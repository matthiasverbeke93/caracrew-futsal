/** Compare LZV's live calendar feed against the `games` rows we serve, and say what moved.
 *
 * WHY THIS EXISTS: nothing used to notice a rescheduled fixture. `sync-lzv` fetches scores only,
 * `sync-ics` re-renders the feeds *from* `games`, and the LZV importer is a manual local script —
 * so when LZV moved fixture 1 of 26-27 (21:00 Winketkaai → 20:00 IHAM, two days before kickoff)
 * every job reported success and the team kept its RSVPs for the wrong hall at the wrong hour.
 * This module is the missing check: run it in CI, fail loudly, hand back the SQL to fix it.
 *
 * Since 2026-11-19 the daily job fixes the safe cases itself (`planAutoFix`, applied by
 * `scripts/check-lzv-drift.mjs --apply` with the service-role key). What a cron job should not
 * decide — played or past games, several fixtures vanishing at once (a withdrawn club looks like
 * that), ambiguous matches — still comes back as SQL for a human (`driftSql`).
 */

import { isHomeFromTitle, slugifyOpponent, sqlLiteral } from "./lzvCalendar.js";

/** Columns worth comparing, in the order a human wants to read them. */
const COMPARED = ["game_date", "game_time", "location", "opponent", "title"];

/** Columns an in-place UPDATE may touch. `game_date`/`game_time` are here too, but see `idWouldChange`. */
const UPDATABLE = ["game_date", "game_time", "location", "opponent", "title"];

function homeKey(row) {
  const home = typeof row.is_home === "boolean" ? row.is_home : isHomeFromTitle(row.title);
  return home == null ? "?" : home ? "H" : "A";
}

/** Identity of a fixture that survives a reschedule: who, and at whose place. */
function pairingKey(row) {
  return `${slugifyOpponent(row.opponent || "")}|${homeKey(row)}`;
}

function changesBetween(db, feed) {
  const changes = [];
  for (const field of COMPARED) {
    const from = db[field] ?? null;
    const to = feed[field] ?? null;
    if (String(from) !== String(to)) changes.push({ field, from, to });
  }
  return changes;
}

/**
 * Match feed rows to `games` rows and report the differences.
 *
 * Matching runs in three passes, most trustworthy first, because `games.id` encodes date AND time
 * (`<season>-<date>-<hhmm>-<opponent>`) and therefore stops being a usable key the moment a fixture
 * moves — which is precisely the case we are trying to catch:
 *   1. exact id            — everything that did not change
 *   2. same opponent + H/A — a time/venue change, or a fixture moved to another date entirely
 *   3. same date           — an opponent change on the day it was always on
 * Opponent before date: when two fixtures swap dates, pairing by date would "rename" each row to
 * the other opponent (and move the RSVPs with it) instead of moving both dates. Every pass skips a
 * key that is ambiguous on either side, so pass 2 only resolves when exactly one candidate is left.
 *
 * Returns `{ changed, added, removed }`. `changed` carries both rows plus `idWouldChange`, which is
 * the flag that decides how it must be fixed: false → plain UPDATE; true → still an UPDATE, keeping
 * the old id, because re-inserting under the feed's new id would orphan every RSVP.
 */
export function diffFixtures(feedRows, dbRows) {
  const feedLeft = [...feedRows];
  const dbLeft = [...dbRows];
  const pairs = [];

  const take = (keyOf) => {
    for (let i = feedLeft.length - 1; i >= 0; i--) {
      const feed = feedLeft[i];
      const key = keyOf(feed);
      if (key == null) continue;
      const matches = dbLeft.filter((db) => keyOf(db) === key);
      if (matches.length !== 1) continue; // 0 = nothing to pair with, >1 = ambiguous, leave it
      const db = matches[0];
      if (feedLeft.filter((f) => keyOf(f) === key).length !== 1) continue; // ambiguous on our side
      pairs.push({ db, feed });
      feedLeft.splice(i, 1);
      dbLeft.splice(dbLeft.indexOf(db), 1);
    }
  };

  take((row) => row.id);
  take(pairingKey);
  take((row) => row.game_date);

  const changed = pairs
    .map(({ db, feed }) => ({ db, feed, changes: changesBetween(db, feed) }))
    .filter((p) => p.changes.length)
    .map((p) => ({ ...p, idWouldChange: p.feed.id !== p.db.id }))
    .sort((a, b) => String(a.db.game_date).localeCompare(String(b.db.game_date)));

  return {
    changed,
    added: feedLeft.sort((a, b) => String(a.game_date).localeCompare(String(b.game_date))),
    removed: dbLeft.sort((a, b) => String(a.game_date).localeCompare(String(b.game_date))),
  };
}

export function hasDrift(diff) {
  return Boolean(diff.changed.length || diff.added.length || diff.removed.length);
}

/** `21:00:00` → `21:00`; anything else through untouched. */
function shortTime(value) {
  return /^\d{2}:\d{2}:\d{2}$/.test(String(value ?? "")) ? String(value).slice(0, 5) : String(value ?? "—");
}

function describeChange({ field, from, to }) {
  if (field === "game_time") return `time ${shortTime(from)} → ${shortTime(to)}`;
  return `${field.replace("game_", "")} ${from ?? "—"} → ${to ?? "—"}`;
}

/**
 * The SQL that resolves the drift, ready for the Supabase SQL editor.
 *
 * Changed fixtures become in-place UPDATEs keyed on the EXISTING id — never a re-insert under the
 * feed's id, which would duplicate the fixture and orphan its RSVPs. Added fixtures are inserts.
 * Removed fixtures get a commented-out stub only: a fixture vanishing from the feed usually means
 * postponed-not-yet-rescheduled, and deleting it would take real RSVPs with it.
 */
export function driftSql(diff, { seasonSlug = "" } = {}) {
  if (!hasDrift(diff)) return "";
  const out = [
    `-- LZV calendar drift for ${seasonSlug || "the current season"} — generated by scripts/check-lzv-drift.mjs.`,
    "-- Run in the Supabase SQL editor; the anon key cannot write to `games`.",
    "-- Every UPDATE is keyed on the id the row ALREADY has, so RSVPs stay attached even when the",
    "-- kickoff moved (the id encodes the time, so the feed's own id would be a different row).",
    "",
  ];

  // Only open a transaction if there is something to run in it: a drift that is nothing but a
  // vanished fixture is reported as comments, and `begin; commit;` around nothing reads as a bug.
  const statements = [];

  for (const { db, changes, idWouldChange } of diff.changed) {
    const sets = changes
      .filter((c) => UPDATABLE.includes(c.field))
      .map((c) => `       ${c.field} = ${sqlLiteral(c.to)}`);
    if (!sets.length) continue;
    statements.push(`-- ${db.game_date} ${shortTime(db.game_time)} vs ${db.opponent}: ${changes.map(describeChange).join(", ")}`);
    if (idWouldChange) {
      statements.push("--   NOTE: this change alters what the id would be. Keeping the existing id on purpose.");
    }
    statements.push(`update games`, `   set ${sets.join(",\n").trimStart()}`, ` where id = ${sqlLiteral(db.id)};`, "");
  }

  for (const row of diff.added) {
    statements.push(
      `-- ${row.game_date} ${shortTime(row.game_time)} vs ${row.opponent} — in the feed, missing from games.`,
      "insert into games (id, season_slug, opponent, game_date, game_time, location, title) values",
      `  (${sqlLiteral(row.id)}, ${sqlLiteral(row.season_slug)}, ${sqlLiteral(row.opponent)}, ` +
        `${sqlLiteral(row.game_date)}, ${sqlLiteral(row.game_time)}, ${sqlLiteral(row.location)}, ${sqlLiteral(row.title)})`,
      "on conflict (id) do update set",
      "  opponent  = excluded.opponent,",
      "  game_time = excluded.game_time,",
      "  location  = excluded.location,",
      "  title     = excluded.title;",
      ""
    );
  }

  if (statements.length) out.push("begin;", "", ...statements, "commit;");

  if (diff.removed.length) {
    out.push(
      "",
      "-- NOT scripted — these fixtures are in `games` but no longer in LZV's feed. Usually postponed",
      "-- without a new date. Deleting one deletes its RSVPs, so decide by hand:"
    );
    for (const row of diff.removed) {
      out.push(`--   ${row.game_date} ${shortTime(row.game_time)} vs ${row.opponent}  (${row.id})`);
    }
  }

  return out.join("\n") + "\n";
}

/** Markdown summary for a CI job summary / console. Empty string when there is no drift. */
export function formatDriftReport(diff, { seasonSlug = "", feedUrl = "" } = {}) {
  if (!hasDrift(diff)) return "";
  const lines = [`### LZV calendar drift — season ${seasonSlug || "?"}`, ""];
  if (feedUrl) lines.push(`Feed: ${feedUrl}`, "");

  if (diff.changed.length) {
    lines.push("**Changed**", "", "| Fixture | What moved | Fix |", "| --- | --- | --- |");
    for (const { db, changes, idWouldChange } of diff.changed) {
      lines.push(
        `| ${db.game_date} ${shortTime(db.game_time)} vs ${db.opponent} | ` +
          `${changes.map(describeChange).join("<br>")} | ` +
          `${idWouldChange ? "UPDATE in place — id must NOT change (RSVPs)" : "UPDATE in place"} |`
      );
    }
    lines.push("");
  }
  if (diff.added.length) {
    lines.push("**In the feed, missing from `games`**", "");
    for (const row of diff.added) {
      lines.push(`- ${row.game_date} ${shortTime(row.game_time)} vs ${row.opponent} @ ${row.location ?? "?"}`);
    }
    lines.push("");
  }
  if (diff.removed.length) {
    lines.push("**In `games`, gone from the feed** (postponed? decide by hand — deleting takes RSVPs with it)", "");
    for (const row of diff.removed) {
      lines.push(`- ${row.game_date} ${shortTime(row.game_time)} vs ${row.opponent} (\`${row.id}\`)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** The columns a `games` insert may carry — feed rows also hold `is_home`, which is not a column. */
const INSERT_COLUMNS = ["id", "season_slug", "opponent", "game_date", "game_time", "location", "title"];

export function gameInsertRow(feed) {
  return Object.fromEntries(INSERT_COLUMNS.map((c) => [c, feed[c] ?? null]));
}

/**
 * Decide which drift the daily job may fix by itself (owner, 2026-11-19), and what is left for a human.
 *
 *   - same date, new time / hall / name → `update` in place, RSVPs stay
 *   - new date                          → `move`: insert the feed's row, delete the old one; the RSVPs go
 *                                         with the old row so the team answers again for the new date
 *   - new in the feed                   → `insert`
 *   - gone from the feed                → `delete` (postponed; the new date arrives later as an insert)
 *
 * Guards, each of which leaves the item in `manual` with a reason:
 *   - a played game (`playedIds`: has a score, stats or MOTM votes) is never moved or deleted — the
 *     FKs cascade, so that would wipe a result
 *   - a game before `today` is never moved or deleted
 *   - more than one game gone at once looks like a broken feed or a withdrawn club — none deleted
 */
export function planAutoFix(diff, { today, playedIds = new Set() } = {}) {
  const actions = [];
  const manual = [];
  const untouchable = (db) =>
    playedIds.has(db.id) ? "already played (score, stats or MOTM votes)" : db.game_date < today ? "in the past" : null;

  for (const item of diff.changed) {
    const { db, feed, changes } = item;
    if (!changes.some((c) => c.field === "game_date")) {
      const set = Object.fromEntries(changes.filter((c) => UPDATABLE.includes(c.field)).map((c) => [c.field, c.to]));
      actions.push({ kind: "update", id: db.id, set, db, changes });
      continue;
    }
    const why = untouchable(db);
    if (why) manual.push({ kind: "changed", item, reason: `new date, but ${why}` });
    else actions.push({ kind: "move", oldId: db.id, insert: gameInsertRow(feed), db, changes });
  }

  for (const feed of diff.added) actions.push({ kind: "insert", insert: gameInsertRow(feed) });

  if (diff.removed.length > 1) {
    for (const db of diff.removed) {
      manual.push({ kind: "removed", db, reason: `${diff.removed.length} games gone at once — broken feed or withdrawn club?` });
    }
  } else {
    for (const db of diff.removed) {
      const why = untouchable(db);
      if (why) manual.push({ kind: "removed", db, reason: why });
      else actions.push({ kind: "delete", id: db.id, db });
    }
  }

  return { actions, manual };
}

/** One line per applied action, for the job summary / email. */
export function describeAction(a) {
  const when = (r) => `${r.game_date} ${shortTime(r.game_time)} vs ${r.opponent}`;
  if (a.kind === "update") return `Updated ${when(a.db)}: ${a.changes.map(describeChange).join(", ")} (RSVPs kept)`;
  if (a.kind === "move") return `Moved ${when(a.db)} → ${a.insert.game_date} ${shortTime(a.insert.game_time)} (RSVPs cleared)`;
  if (a.kind === "insert") return `Added ${when(a.insert)} @ ${a.insert.location ?? "?"}`;
  if (a.kind === "delete") return `Deleted ${when(a.db)} — gone from LZV's feed, postponed? (RSVPs removed)`;
  return JSON.stringify(a);
}

/** Rebuild a diff from what `planAutoFix` left for a human, so `driftSql`/`formatDriftReport` can show it. */
export function manualDiff(manual) {
  return {
    changed: manual.filter((m) => m.kind === "changed").map((m) => m.item),
    added: [],
    removed: manual.filter((m) => m.kind === "removed").map((m) => m.db),
  };
}
