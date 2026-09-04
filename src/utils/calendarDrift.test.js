import { describe, expect, it } from "vitest";
import { diffFixtures, driftSql, formatDriftReport, hasDrift } from "./calendarDrift.js";

/** A `games`/feed row. Defaults describe a home fixture so `isHomeFromTitle` can read it. */
function row(overrides = {}) {
  const base = {
    id: "2627-2026-09-24-2100-vv-schemerboyz",
    season_slug: "2627",
    opponent: "VV Schemerboyz",
    game_date: "2026-09-24",
    game_time: "21:00:00",
    location: "Winketkaai Mechelen",
    title: "K. Caracrew SK vs VV Schemerboyz",
  };
  return { ...base, ...overrides };
}

const away = row({
  id: "2627-2026-09-06-2100-vt-09",
  opponent: "VT 09",
  game_date: "2026-09-06",
  title: "VT 09 vs K. Caracrew SK",
  location: "Winketkaai Mechelen",
});

describe("diffFixtures", () => {
  it("reports nothing when the feed matches games", () => {
    const diff = diffFixtures([row(), away], [row(), away]);
    expect(diff).toEqual({ changed: [], added: [], removed: [] });
    expect(hasDrift(diff)).toBe(false);
  });

  it("catches the real 2026-09-06 case: kickoff and hall moved on the same date", () => {
    const moved = { ...away, id: "2627-2026-09-06-2000-vt-09", game_time: "20:00:00", location: "IHAM Mechelen" };
    const diff = diffFixtures([moved], [away]);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].changes).toEqual([
      { field: "game_time", from: "21:00:00", to: "20:00:00" },
      { field: "location", from: "Winketkaai Mechelen", to: "IHAM Mechelen" },
    ]);
    // The id it WOULD get differs, which is exactly why this must be an in-place update.
    expect(diff.changed[0].idWouldChange).toBe(true);
    expect(diff.changed[0].db.id).toBe(away.id);
  });

  it("follows a fixture to a new date via opponent + home/away, rather than calling it add+remove", () => {
    const rescheduled = { ...row(), id: "2627-2026-09-26-2100-vv-schemerboyz", game_date: "2026-09-26" };
    const diff = diffFixtures([rescheduled], [row()]);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed[0].changes).toEqual([
      { field: "game_date", from: "2026-09-24", to: "2026-09-26" },
    ]);
  });

  it("tells the two legs against one opponent apart by home/away, even if both moved", () => {
    const homeLeg = row();
    const awayLeg = row({
      id: "2627-2026-11-08-1800-vv-schemerboyz",
      game_date: "2026-11-08",
      game_time: "18:00:00",
      title: "VV Schemerboyz vs K. Caracrew SK",
    });
    const diff = diffFixtures(
      [
        { ...homeLeg, id: "x1", game_date: "2026-10-01" },
        { ...awayLeg, id: "x2", game_date: "2026-11-15" },
      ],
      [homeLeg, awayLeg]
    );

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.map((c) => [c.db.game_date, c.feed.game_date])).toEqual([
      ["2026-09-24", "2026-10-01"],
      ["2026-11-08", "2026-11-15"],
    ]);
  });

  it("refuses to pair when the fixtures are genuinely indistinguishable", () => {
    // Two fixtures vs the same club on the same side of the pitch, both on dates games has never
    // seen — a cup double-header, or titles `isHomeFromTitle` cannot split. Nothing tells them
    // apart, so guessing would silently write one fixture's change onto the other. Report both
    // sides instead and let a human look.
    const first = row({ id: "cup-1", game_date: "2026-12-05", title: "cup round 1" });
    const second = row({ id: "cup-2", game_date: "2026-12-12", title: "cup round 2" });
    const diff = diffFixtures(
      [
        { ...first, id: "y1", game_date: "2026-12-06" },
        { ...second, id: "y2", game_date: "2026-12-13" },
      ],
      [first, second]
    );

    expect(diff.changed).toEqual([]);
    expect(diff.added).toHaveLength(2);
    expect(diff.removed).toHaveLength(2);
  });

  it("separates a fixture only the feed has from one only games has", () => {
    const extra = row({ id: "2627-2027-02-27-2030-fc-de-wandelgang", opponent: "FC De Wandelgang", game_date: "2027-02-27", game_time: "20:30:00", title: "FC De Wandelgang vs K. Caracrew SK" });
    const diff = diffFixtures([row(), extra], [row(), away]);
    expect(diff.added.map((r) => r.id)).toEqual([extra.id]);
    expect(diff.removed.map((r) => r.id)).toEqual([away.id]);
    expect(hasDrift(diff)).toBe(true);
  });

  it("sorts by date so the soonest fixture is read first", () => {
    const late = row({ id: "2627-2027-03-11-2100-knallende-knapen", opponent: "Knallende Knapen", game_date: "2027-03-11", title: "K. Caracrew SK vs Knallende Knapen" });
    const diff = diffFixtures(
      [{ ...late, location: "Arena Walem" }, { ...away, location: "IHAM Mechelen" }],
      [late, away]
    );
    expect(diff.changed.map((c) => c.db.game_date)).toEqual(["2026-09-06", "2027-03-11"]);
  });
});

describe("driftSql", () => {
  it("updates on the existing id and never re-inserts a moved fixture", () => {
    const moved = { ...away, id: "2627-2026-09-06-2000-vt-09", game_time: "20:00:00", location: "IHAM Mechelen" };
    const sql = driftSql(diffFixtures([moved], [away]), { seasonSlug: "2627" });

    expect(sql).toContain("where id = '2627-2026-09-06-2100-vt-09'");
    expect(sql).toContain("game_time = '20:00:00'");
    expect(sql).toContain("location = 'IHAM Mechelen'");
    // The feed's id must appear nowhere: inserting under it is the bug this guards against.
    expect(sql).not.toContain("2627-2026-09-06-2000-vt-09");
    expect(sql).not.toMatch(/insert into games/);
  });

  it("inserts a fixture games has never seen", () => {
    const extra = row({ id: "2627-2027-02-27-2030-fc-de-wandelgang", opponent: "FC De Wandelgang", game_date: "2027-02-27", game_time: "20:30:00", title: "FC De Wandelgang vs K. Caracrew SK" });
    const sql = driftSql(diffFixtures([row(), extra], [row()]), { seasonSlug: "2627" });
    expect(sql).toContain("insert into games");
    expect(sql).toContain("'2627-2027-02-27-2030-fc-de-wandelgang'");
  });

  it("only comments a vanished fixture — a delete would take its RSVPs", () => {
    const sql = driftSql(diffFixtures([row()], [row(), away]), { seasonSlug: "2627" });
    expect(sql).not.toMatch(/^\s*delete\s/im);
    expect(sql).toContain("2627-2026-09-06-2100-vt-09");
    expect(sql).toContain("decide by hand");
    // Nothing to run, so no transaction to open: `begin; commit;` around nothing reads as a bug.
    expect(sql).not.toContain("begin;");
  });

  it("escapes a quote in a club name", () => {
    const renamed = { ...row(), opponent: "D'Oude Kantine", title: "K. Caracrew SK vs D'Oude Kantine" };
    const sql = driftSql(diffFixtures([renamed], [row()]), { seasonSlug: "2627" });
    expect(sql).toContain("'D''Oude Kantine'");
  });

  it("is empty when there is nothing to fix", () => {
    expect(driftSql(diffFixtures([row()], [row()]), { seasonSlug: "2627" })).toBe("");
  });
});

describe("formatDriftReport", () => {
  it("is empty in the no-drift case, so a caller can use it as the gate", () => {
    expect(formatDriftReport(diffFixtures([row()], [row()]), { seasonSlug: "2627" })).toBe("");
  });

  it("names the fixture by its current date, time and opponent", () => {
    const moved = { ...away, game_time: "20:00:00" };
    const report = formatDriftReport(diffFixtures([moved], [away]), { seasonSlug: "2627" });
    expect(report).toContain("2026-09-06 21:00 vs VT 09");
    expect(report).toContain("time 21:00 → 20:00");
  });
});
