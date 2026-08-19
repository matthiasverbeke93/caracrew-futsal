import { describe, expect, it } from "vitest";
import { getDifficulty } from "./difficulty.js";

/** An opponent_strength row as sync-palmares writes it. */
function strengthRow(overrides = {}) {
  return {
    team_id: "1",
    name: "Knallende Knapen",
    current_position: 2,
    current_ptn_per_match: 0,
    current_played: 0,
    strength_score: 40,
    history: [],
    ...overrides,
  };
}

// "2627" has no manual standings, so suppressing the live row leaves nothing —
// which is the point: no rating at all beats a confident wrong one.
const SEASON = "2627";

describe("getDifficulty — standings that have not started yet", () => {
  it("shows no rating when the season has 0 matches played", () => {
    // LZV publishes the whole table on day one with everyone on 0 points; the
    // ordering is arbitrary. Position 2 here means nothing.
    const rows = [strengthRow({ current_played: 0 })];
    expect(getDifficulty("Knallende Knapen", rows, SEASON)).toBeNull();
  });

  it("rates normally once any match has been played", () => {
    const rows = [strengthRow({ current_played: 1 })];
    const d = getDifficulty("Knallende Knapen", rows, SEASON);
    expect(d).not.toBeNull();
    expect(d.position).toBe(2);
    expect(d.label).toBe("Very hard");
    expect(d.source).toBe("live");
  });

  it("still trusts rows synced before the column existed (null played)", () => {
    // Backwards compatibility: every 25-26 row looks like this, and they must
    // keep their ratings.
    const rows = [strengthRow({ current_played: null, current_position: 11 })];
    const d = getDifficulty("Knallende Knapen", rows, SEASON);
    expect(d).not.toBeNull();
    expect(d.label).toBe("Very easy");
  });

  it("does not confuse 'not started' with 'played and winless'", () => {
    // Same 0 pts/match, genuinely bottom of the table after 8 games.
    const rows = [
      strengthRow({ current_played: 8, current_position: 12, current_ptn_per_match: 0 }),
    ];
    const d = getDifficulty("Knallende Knapen", rows, SEASON);
    expect(d).not.toBeNull();
    expect(d.position).toBe(12);
  });
});

describe("getDifficulty — opponent matching", () => {
  it("prefers an exact name match over a substring sibling", () => {
    const rows = [
      strengthRow({ team_id: "1", name: "Hattrick B", current_position: 1, current_played: 5 }),
      strengthRow({ team_id: "2", name: "Hattrick", current_position: 9, current_played: 5 }),
    ];
    expect(getDifficulty("Hattrick", rows, SEASON).teamName).toBe("Hattrick");
  });

  it("suppresses a not-started sibling rather than borrowing its rating", () => {
    // CALENDAR-IMPORT.md 2c: with no exact row, the two-way substring fallback
    // returns the sibling. It must still respect the played guard.
    const rows = [strengthRow({ name: "Hattrick B", current_position: 1, current_played: 0 })];
    expect(getDifficulty("Hattrick", rows, SEASON)).toBeNull();
  });
});

describe("getDifficulty — the real 26-27 pre-season table", () => {
  // Exactly what LZV serves today and what sync-palmares will therefore write:
  // all 12 teams on 0 played / 0 points, in an arbitrary order.
  const LIVE_POSITIONS = {
    "Oranje Duivels": 1,
    "Knallende Knapen": 2,
    "ZVC Tigers": 3,
    "FC Tripel": 4,
    "VV Schemerboyz": 5,
    "Wille ma ni kunne": 6,
    "04United": 8,
    "De Karpervissers": 9,
    "VT 09": 10,
    "Jan Breydel": 11,
    "Bankzitters United": 12,
  };
  const rows = (played) =>
    Object.entries(LIVE_POSITIONS).map(([name, position], i) => ({
      team_id: String(i),
      name,
      current_position: position,
      current_ptn_per_match: 0,
      current_played: played,
      strength_score: null,
      history: [],
    }));

  it("rates nothing while the season has not started", () => {
    const notStarted = rows(0);
    const labelled = Object.keys(LIVE_POSITIONS).filter((n) =>
      getDifficulty(n, notStarted, SEASON)
    );
    expect(labelled).toEqual([]);
  });

  it("would otherwise have mislabelled the whole division", () => {
    // Without the guard: Knallende Knapen (relegated 12th of 4e Klasse last
    // season) reads "Very hard", and Bankzitters United (brand new, no history)
    // reads "Very easy" — purely from an all-zero table's ordering.
    const unguarded = rows(0).map((r) => {
      const legacy = { ...r };
      delete legacy.current_played; // as the rows looked before the column existed
      return legacy;
    });
    expect(getDifficulty("Knallende Knapen", unguarded, SEASON).label).toBe("Very hard");
    expect(getDifficulty("Bankzitters United", unguarded, SEASON).label).toBe("Very easy");
  });

  it("rates the whole division again once results exist", () => {
    const withResults = rows(6);
    const labelled = Object.keys(LIVE_POSITIONS).filter((n) =>
      getDifficulty(n, withResults, SEASON)
    );
    expect(labelled).toHaveLength(Object.keys(LIVE_POSITIONS).length);
  });
});
