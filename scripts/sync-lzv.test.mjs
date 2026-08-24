import { describe, expect, it } from "vitest";
import { STALE_RESULT_DAYS, reconcileFixtures, rescheduleSql } from "./sync-lzv.mjs";

/** An LZV result as `parseMatches` emits it. */
function result(date, opponentRaw, home_score = 3, away_score = 2) {
  return { date, opponentRaw, home_score, away_score, venue: "Winketkaai Mechelen" };
}

/** A stored `games` row, unscored unless a score is passed. */
function fixture(id, game_date, opponent, home_score = null, away_score = null) {
  return { id, game_date, opponent, home_score, away_score };
}

const TODAY = "2026-12-01";
const opts = { todayIso: TODAY };

describe("reconcileFixtures — fixtures LZV and the DB agree on", () => {
  it("matches on the exact date and reports nothing else", () => {
    const games = [fixture("g1", "2026-11-08", "VV Schemerboyz")];
    const out = reconcileFixtures([result("2026-11-08", "VV Schemerboyz", 4, 1)], games, opts);

    expect(out.matched).toHaveLength(1);
    expect(out.matched[0].game.id).toBe("g1");
    expect(out.reschedules).toEqual([]);
    expect(out.orphans).toEqual([]);
    expect(out.staleFixtures).toEqual([]);
  });

  it("still matches a row that already has its score, so it is never called stale", () => {
    const games = [fixture("g1", "2026-11-08", "VV Schemerboyz", 4, 1)];
    const out = reconcileFixtures([result("2026-11-08", "VV Schemerboyz", 4, 1)], games, opts);

    expect(out.matched).toHaveLength(1);
    expect(out.staleFixtures).toEqual([]);
  });

  it("matches on a fuzzy opponent name, as the old sync did", () => {
    const games = [fixture("g1", "2026-11-08", "ZVC Tigers")];
    const out = reconcileFixtures([result("2026-11-08", "Tigers")], games, opts);
    expect(out.matched[0].game.id).toBe("g1");
  });
});

describe("reconcileFixtures — reschedules", () => {
  it("spots a result whose fixture is stored on another date", () => {
    const games = [fixture("g-breydel-h", "2026-11-08", "Jan Breydel")];
    const out = reconcileFixtures([result("2026-11-12", "Jan Breydel", 2, 5)], games, opts);

    expect(out.orphans).toEqual([]);
    expect(out.reschedules).toHaveLength(1);
    expect(out.reschedules[0].candidates.map((c) => c.id)).toEqual(["g-breydel-h"]);
  });

  it("offers the nearest date first when the double round-robin gives two candidates", () => {
    const games = [
      fixture("g-away", "2027-03-20", "ZVC Tigers"),
      fixture("g-home", "2026-11-05", "ZVC Tigers"),
    ];
    const out = reconcileFixtures([result("2026-11-12", "ZVC Tigers")], games, opts);

    expect(out.reschedules[0].candidates.map((c) => c.id)).toEqual(["g-home", "g-away"]);
  });

  it("prefers an unscored row over a scored one even when the scored one is nearer", () => {
    const games = [
      fixture("g-scored", "2026-11-10", "ZVC Tigers", 3, 3),
      fixture("g-unscored", "2027-03-20", "ZVC Tigers"),
    ];
    const out = reconcileFixtures([result("2026-11-12", "ZVC Tigers")], games, opts);

    expect(out.reschedules[0].candidates.map((c) => c.id)).toEqual(["g-unscored", "g-scored"]);
  });

  it("will not offer a row that already matched a result of its own", () => {
    // We play Tigers twice. One fixture went ahead as scheduled; the other moved.
    const games = [
      fixture("g-home", "2026-11-05", "ZVC Tigers"),
      fixture("g-away", "2027-03-20", "ZVC Tigers"),
    ];
    const out = reconcileFixtures(
      [result("2026-11-05", "ZVC Tigers", 2, 2), result("2027-03-27", "ZVC Tigers", 1, 4)],
      games,
      opts
    );

    expect(out.matched.map((m) => m.game.id)).toEqual(["g-home"]);
    expect(out.reschedules).toHaveLength(1);
    expect(out.reschedules[0].candidates.map((c) => c.id)).toEqual(["g-away"]);
  });

  it("does not offer the same row to two different results", () => {
    const games = [fixture("g-only", "2026-11-05", "ZVC Tigers")];
    const out = reconcileFixtures(
      [result("2026-11-12", "ZVC Tigers"), result("2026-11-19", "ZVC Tigers")],
      games,
      opts
    );

    expect(out.reschedules).toHaveLength(1);
    expect(out.orphans).toHaveLength(1);
    expect(out.orphans[0].date).toBe("2026-11-19");
  });
});

describe("reconcileFixtures — results with nowhere to go", () => {
  it("calls a result an orphan when no row against that opponent exists", () => {
    const games = [fixture("g1", "2026-11-08", "VV Schemerboyz")];
    const out = reconcileFixtures([result("2026-11-12", "Knallende Knapen")], games, opts);

    expect(out.reschedules).toEqual([]);
    expect(out.orphans).toHaveLength(1);
    expect(out.orphans[0].opponentRaw).toBe("Knallende Knapen");
  });
});

describe("reconcileFixtures — fixtures LZV never reported", () => {
  it("flags a long-past fixture that is still unscored", () => {
    const games = [fixture("g-old", "2026-10-01", "FC Tripel")];
    const out = reconcileFixtures([], games, opts);

    expect(out.staleFixtures.map((g) => g.id)).toEqual(["g-old"]);
  });

  it("leaves a just-played fixture alone, since LZV publishes late", () => {
    const games = [fixture("g-recent", "2026-11-29", "FC Tripel")];
    expect(reconcileFixtures([], games, opts).staleFixtures).toEqual([]);
  });

  it("uses the documented grace period as the boundary", () => {
    const onTheEdge = [fixture("g", "2026-11-24", "FC Tripel")]; // exactly 7 days past
    const justOver = [fixture("g", "2026-11-23", "FC Tripel")]; // 8 days past

    expect(reconcileFixtures([], onTheEdge, opts).staleFixtures).toEqual([]);
    expect(reconcileFixtures([], justOver, opts).staleFixtures).toHaveLength(1);
    expect(STALE_RESULT_DAYS).toBe(7);
  });

  it("leaves upcoming fixtures alone", () => {
    const games = [fixture("g-future", "2027-03-20", "FC Tripel")];
    expect(reconcileFixtures([], games, opts).staleFixtures).toEqual([]);
  });

  it("does not also report a row it already offered as a reschedule", () => {
    const games = [fixture("g-moved", "2026-10-01", "Jan Breydel")];
    const out = reconcileFixtures([result("2026-11-12", "Jan Breydel")], games, opts);

    expect(out.reschedules).toHaveLength(1);
    expect(out.staleFixtures).toEqual([]);
  });

  it("ignores a past fixture whose score is already in", () => {
    const games = [fixture("g-done", "2026-10-01", "FC Tripel", 3, 1)];
    expect(reconcileFixtures([], games, opts).staleFixtures).toEqual([]);
  });
});

describe("reconcileFixtures — degenerate input", () => {
  it("survives no results and no games", () => {
    expect(reconcileFixtures([], [], opts)).toEqual({
      matched: [],
      reschedules: [],
      orphans: [],
      staleFixtures: [],
    });
  });

  it("survives null arguments", () => {
    const out = reconcileFixtures(null, null, opts);
    expect(out.matched).toEqual([]);
    expect(out.orphans).toEqual([]);
  });

  it("does not call a fixture with no date stale", () => {
    const games = [{ id: "g", game_date: null, opponent: "FC Tripel", home_score: null, away_score: null }];
    expect(reconcileFixtures([], games, opts).staleFixtures).toEqual([]);
  });
});

describe("rescheduleSql", () => {
  it("moves the existing row rather than creating one", () => {
    const game = fixture("2627-2026-11-08-1800-vv-schemerboyz", "2026-11-08", "VV Schemerboyz");
    expect(rescheduleSql(game, result("2026-11-12", "VV Schemerboyz"))).toBe(
      "update games set game_date = '2026-11-12' where id = '2627-2026-11-08-1800-vv-schemerboyz';"
    );
  });
});
