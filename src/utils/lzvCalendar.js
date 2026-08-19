/** Parse LZV Cup's official per-team iCalendar feed into `games` rows.
 *
 * Feed: https://www.lzvcup.be/icalendar.php?id=<lzvTeamId>  (text/calendar, one VEVENT per fixture)
 *
 * Pure functions only — `scripts/import-lzv-calendar.mjs` is the thin CLI around this.
 *
 * DESIGN RULE: never guess. The feed's exact SUMMARY layout could not be observed while writing this
 * (LZV had not published the 26-27 season yet, so the feed was empty), so anything ambiguous is returned
 * as a `problem` rather than resolved with a best guess. Home/away lives ONLY in `games.title` and is
 * invisible in the app — a wrong guess would surface silently in subscribers' calendars. Better to stop
 * and make a human look.
 */

const OUR_TEAM_PATTERN = /caracrew/i;

/** Separators LZV might use between the two team names, longest/most explicit first.
 *  All are space-padded so hyphenated place names (St-Katelijne-Waver) can't split by accident.
 *  The feed's ACTUAL separator turned out to be a bare, unpadded "-" ("VT 09-K Caracrew SK") — that
 *  one is too dangerous to put in this list (it would split "St-Katelijne-Waver"), so it is handled
 *  separately by `splitOnBareHyphen` below, which only accepts a split our team name vouches for. */
const SUMMARY_SEPARATORS = [" vs. ", " vs ", " v. ", " v ", " - ", " – ", " — "];

/** Our team name reduced to letters+digits, for exact identity checks ("K. Caracrew SK" == "K Caracrew SK"). */
const OUR_TEAM_KEY = "kcaracrewsk";

function teamKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Split on a bare, unpadded hyphen — LZV's real separator, e.g. "K Caracrew SK-VV Schemerboyz".
 *
 * Splitting on every "-" blindly is unsafe: a hyphenated club or place name (ZVC St-Katelijne-Waver)
 * would break at the wrong hyphen. So instead of trusting position, we let our own name arbitrate —
 * a hyphen is only a team separator if it puts "caracrew" on exactly ONE side. When several hyphens
 * pass that test, prefer the one where our side is exactly our team name and nothing else; if that
 * still leaves a tie, return null so the caller reports it rather than guessing.
 */
function splitOnBareHyphen(s) {
  const candidates = [];
  for (let i = s.indexOf("-"); i !== -1; i = s.indexOf("-", i + 1)) {
    const left = s.slice(0, i).trim();
    const right = s.slice(i + 1).trim();
    if (!left || !right) continue;
    const oursLeft = OUR_TEAM_PATTERN.test(left);
    if (oursLeft === OUR_TEAM_PATTERN.test(right)) continue; // both sides or neither — not the separator
    candidates.push({ left, right, separator: "-", ours: oursLeft ? left : right });
  }
  if (candidates.length === 0) return null;

  const pick =
    candidates.length === 1
      ? candidates[0]
      : (() => {
          const exact = candidates.filter((c) => teamKey(c.ours) === OUR_TEAM_KEY);
          return exact.length === 1 ? exact[0] : null;
        })();
  if (!pick) return null;
  return { left: pick.left, right: pick.right, separator: pick.separator };
}

/** Unfold RFC-5545 folded lines: a CRLF (or LF) followed by one space/tab continues the previous line. */
export function unfoldIcs(text) {
  return String(text || "").replace(/\r?\n[ \t]/g, "");
}

/** Undo RFC-5545 TEXT escaping. */
export function unescapeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Split "DTSTART;TZID=Europe/Brussels:20260910T210000" into name, params, value. */
function parseLine(line) {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/** Render a UTC instant as wall-clock date/time in `timeZone` (DST-correct, no dependency). */
function utcToZonedParts(utcDate, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(utcDate)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  // Some engines render midnight as hour "24"; normalise.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}:${parts.second}`,
  };
}

/**
 * Turn a DTSTART property into `{ date, time }` local to `timeZone`.
 * Handles the three forms a feed can legally use:
 *   DTSTART;TZID=Europe/Brussels:20260910T210000  → already local wall-clock, taken as-is
 *   DTSTART:20260910T190000Z                      → UTC, converted (DST-correct)
 *   DTSTART;VALUE=DATE:20260910                   → all-day, `time` is null
 * Returns null if it cannot be understood.
 */
export function parseDtStart(prop, timeZone = "Europe/Brussels") {
  if (!prop) return null;
  const v = String(prop.value || "").trim();

  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null };
  }

  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!dt) return null;
  const [, y, mo, d, h, mi, s, zulu] = dt;

  if (zulu === "Z") {
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    if (Number.isNaN(utc.getTime())) return null;
    return utcToZonedParts(utc, timeZone);
  }

  // No Z: either an explicit TZID or a floating local time. Both are already wall-clock.
  // (If TZID is some zone other than the feed's own, we do not attempt a conversion — we flag it.)
  const tzid = prop.params?.TZID;
  return {
    date: `${y}-${mo}-${d}`,
    time: `${h}:${mi}:${s}`,
    tzid: tzid || null,
    floating: !tzid,
  };
}

/** Extract VEVENTs as `{ SUMMARY, LOCATION, UID, DTSTART: {value, params} , ... }`. */
export function parseIcs(text) {
  const lines = unfoldIcs(text).split(/\r?\n/);
  const events = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    // Keep the structured form for DTSTART (params matter); plain text for the rest.
    if (parsed.name === "DTSTART") current.DTSTART = { value: parsed.value, params: parsed.params };
    else current[parsed.name] = unescapeIcsText(parsed.value);
  }

  return events;
}

/** Mirror the id convention of the existing rows: lowercase, non-alphanumerics collapsed to "-". */
export function slugifyOpponent(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents (é -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Reduce LZV's LOCATION to the venue spelling the `games` table already uses.
 *
 * The feed gives "Venue, Street 12, City" ("IHAM, Bautersemstraat 57 , Mechelen"); every existing row
 * stores "Venue City" ("IHAM Mechelen"). Keeping the first and last comma-separated part reproduces the
 * 25-26 spelling exactly for every venue in the 26-27 feed, so the score sync and the ICS generator see
 * the same venue strings they always have. Anything without a comma is passed through untouched.
 */
export function normalizeLocation(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return parts[0] || null;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Split a SUMMARY into the two team names. Returns null when no separator applies cleanly. */
export function splitSummary(summary) {
  const s = String(summary || "").trim();
  if (!s) return null;
  for (const sep of SUMMARY_SEPARATORS) {
    const idx = s.indexOf(sep);
    if (idx === -1) continue;
    const left = s.slice(0, idx).trim();
    const right = s.slice(idx + sep.length).trim();
    if (left && right) return { left, right, separator: sep };
  }
  return splitOnBareHyphen(s);
}

/**
 * Is `games.title` describing a home game? `true` home, `false` away, `null` when undecidable.
 *
 * `title` is the ONLY store of home/away (there is no column, and `location` is not a proxy —
 * De Nekker hosts other teams, so we are sometimes the away side there). Both title shapes in use
 * are handled, because `splitSummary` treats the score as a separator too:
 *   "K. Caracrew SK vs Hattrick"            → left  "K. Caracrew SK"      → home
 *   "ZVC Tigers 10 - 1 K Caracrew SK"       → right "1 K Caracrew SK"     → away
 *   "Futsal Opsinjoor - K Caracrew SK"      → right "K Caracrew SK"       → away
 *
 * Returns null rather than guessing when the title cannot be split, or when our name appears on
 * both sides or neither. The previous implementation fell back to testing the WHOLE string, which
 * reported every " - " separated title as home — including away fixtures.
 */
export function isHomeFromTitle(title) {
  const t = String(title || "").trim();
  if (!t) return null;
  const split = splitSummary(t);
  if (!split) return null;
  const left = OUR_TEAM_PATTERN.test(split.left);
  const right = OUR_TEAM_PATTERN.test(split.right);
  if (left === right) return null;
  return left;
}

/**
 * Convert parsed VEVENTs into `games` rows.
 *
 * Returns `{ rows, problems }`. `problems` is never silently dropped — the CLI refuses to emit SQL
 * while any exist, because every problem class here (unknown SUMMARY shape, our team on both or
 * neither side, unparseable DTSTART) would otherwise produce a wrong home/away or a wrong kickoff.
 */
export function toGameRows(events, options = {}) {
  const {
    seasonSlug = "2627",
    teamName = "K. Caracrew SK",
    timeZone = "Europe/Brussels",
    defaultTime = null,
  } = options;

  const rows = [];
  const problems = [];
  const seenIds = new Map();

  events.forEach((ev, index) => {
    const label = ev.SUMMARY || ev.UID || `event #${index + 1}`;

    const when = parseDtStart(ev.DTSTART, timeZone);
    if (!when) {
      problems.push({ kind: "bad-dtstart", label, detail: ev.DTSTART?.value ?? "(missing DTSTART)" });
      return;
    }
    if (when.tzid && when.tzid !== timeZone) {
      problems.push({
        kind: "unexpected-tzid",
        label,
        detail: `DTSTART carries TZID=${when.tzid}, expected ${timeZone}; kickoff would be wrong if converted blindly`,
      });
      return;
    }

    const split = splitSummary(ev.SUMMARY);
    if (!split) {
      problems.push({
        kind: "unknown-summary-format",
        label,
        detail:
          `no usable separator (${SUMMARY_SEPARATORS.map((x) => `"${x}"`).join(", ")}, or a bare "-" ` +
          `with our team on exactly one side) in "${ev.SUMMARY ?? ""}"`,
      });
      return;
    }

    const oursLeft = OUR_TEAM_PATTERN.test(split.left);
    const oursRight = OUR_TEAM_PATTERN.test(split.right);
    if (oursLeft === oursRight) {
      problems.push({
        kind: oursLeft ? "our-team-both-sides" : "our-team-absent",
        label,
        detail: `split as "${split.left}" | "${split.right}"`,
      });
      return;
    }

    const isHome = oursLeft;
    const opponent = (isHome ? split.right : split.left).trim();
    const time = when.time ?? defaultTime;
    if (!time) {
      problems.push({
        kind: "missing-time",
        label,
        detail: "all-day event and no --default-time given; game_time would be null",
      });
      return;
    }

    const hhmm = time.slice(0, 5).replace(":", "");
    const id = `${seasonSlug}-${when.date}-${hhmm}-${slugifyOpponent(opponent)}`;

    if (seenIds.has(id)) {
      problems.push({
        kind: "duplicate-id",
        label,
        detail: `collides with "${seenIds.get(id)}" — both map to ${id}`,
      });
      return;
    }
    seenIds.set(id, label);

    rows.push({
      id,
      season_slug: seasonSlug,
      opponent,
      game_date: when.date,
      game_time: time.length === 5 ? `${time}:00` : time,
      location: normalizeLocation(ev.LOCATION),
      // title is the ONLY store of home/away — see CALENDAR-IMPORT.md §1.
      title: isHome ? `${teamName} vs ${opponent}` : `${opponent} vs ${teamName}`,
      is_home: isHome, // not a DB column; carried for the preview/verification only
    });
  });

  rows.sort((a, b) => (a.game_date + a.game_time).localeCompare(b.game_date + b.game_time));
  return { rows, problems };
}

/** SQL string literal, single quotes doubled; bare NULL for null/undefined. */
function sqlLiteral(value) {
  if (value == null) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Build the idempotent INSERT for the SQL editor.
 *
 * Deliberately UNLIKE the retired `seed_season_2627.sql`: it does NOT delete existing rows first.
 * That delete-then-insert shape is exactly what made the seed a footgun next to a real calendar.
 * On an id collision it refreshes only the mutable columns and never touches scores, so re-running
 * after a partial load is safe and cannot wipe a result the score sync already fetched.
 */
export function buildInsertSql(rows, options = {}) {
  const { seasonSlug = "2627" } = options;
  if (!rows.length) return "-- no rows\n";

  const values = rows
    .map(
      (r) =>
        `  (${sqlLiteral(r.id)}, ${sqlLiteral(r.season_slug)}, ${sqlLiteral(r.opponent)}, ` +
        `${sqlLiteral(r.game_date)}, ${sqlLiteral(r.game_time)}, ${sqlLiteral(r.location)}, ${sqlLiteral(r.title)})`
    )
    .join(",\n");

  const homeCount = rows.filter((r) => r.is_home).length;

  return `-- Official ${seasonSlug} LZV calendar — generated by scripts/import-lzv-calendar.mjs
-- Source: LZV's own iCalendar feed. Run in the Supabase SQL editor (anon key cannot write to games).
-- ${rows.length} fixtures: ${homeCount} home, ${rows.length - homeCount} away.
-- Scores are left null; the weekly sync-lzv job fills them.
--
-- Re-runnable: refreshes the mutable columns on an id clash and never touches home_score/away_score.
-- NOTE: a rescheduled match changes game_date, which changes the id, so re-importing it would create a
-- SECOND row and orphan every RSVP (attendance/player_stats/guest_players/motm_votes all FK to game_id).
-- Move a fixture by updating game_date/game_time on the EXISTING row instead. See CALENDAR-IMPORT.md.

begin;

insert into games (id, season_slug, opponent, game_date, game_time, location, title) values
${values}
on conflict (id) do update set
  opponent  = excluded.opponent,
  game_time = excluded.game_time,
  location  = excluded.location,
  title     = excluded.title;

commit;

-- Verification: expect ${rows.length} fixtures, 0 missing a time/location, and 0 whose title omits the team.
select
  (select count(*) from games where season_slug = ${sqlLiteral(seasonSlug)})                        as fixtures,
  (select count(*) from games where season_slug = ${sqlLiteral(seasonSlug)} and game_time is null)  as missing_time,
  (select count(*) from games where season_slug = ${sqlLiteral(seasonSlug)} and location is null)   as missing_location,
  (select count(*) from games where season_slug = ${sqlLiteral(seasonSlug)}
     and title !~* 'caracrew')                                                                     as title_without_team,
  (select min(game_date) from games where season_slug = ${sqlLiteral(seasonSlug)})                  as first_game,
  (select max(game_date) from games where season_slug = ${sqlLiteral(seasonSlug)})                  as last_game;
`;
}
