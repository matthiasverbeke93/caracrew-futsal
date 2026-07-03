import { describe, expect, it } from "vitest";
import { buildLeagueTable, computeTeamRecord } from "./teamRecord.js";

// Dates are in the past (isPlayed compares game_date < local today) so they count as played.
const g = (id, date, us, them) => ({
  id,
  game_date: date,
  opponent: `Opp ${id}`,
  home_score: us,
  away_score: them,
});

describe("computeTeamRecord", () => {
  it("is all-zero for no games", () => {
    const r = computeTeamRecord([]);
    expect(r).toMatchObject({ played: 0, wins: 0, draws: 0, losses: 0, points: 0, pointsPerGame: 0 });
    expect(r.results).toEqual([]);
  });

  it("counts W/D/L, goals, points (3-1-0) and derived rates", () => {
    const r = computeTeamRecord([
      g("a", "2025-09-10", 5, 2), // W
      g("b", "2025-09-17", 3, 3), // D
      g("c", "2025-09-24", 1, 4), // L
      g("d", "2025-10-01", 6, 6), // D
    ]);
    expect(r.played).toBe(4);
    expect(r.wins).toBe(1);
    expect(r.draws).toBe(2);
    expect(r.losses).toBe(1);
    expect(r.gf).toBe(15);
    expect(r.ga).toBe(15);
    expect(r.gd).toBe(0);
    expect(r.points).toBe(1 * 3 + 2 * 1); // 5
    expect(r.pointsPerGame).toBeCloseTo(1.25);
    expect(r.winPct).toBeCloseTo(25);
  });

  it("ignores future fixtures and scoreless played games (counted as unscored)", () => {
    const r = computeTeamRecord([
      g("a", "2025-09-10", 5, 2), // played + scored → counts
      g("b", "2025-09-17", null, null), // played but no score → unscored
      g("future", "2099-01-01", 9, 0), // future → ignored entirely
    ]);
    expect(r.played).toBe(1);
    expect(r.unscored).toBe(1);
    expect(r.wins).toBe(1);
    expect(r.results).toHaveLength(1);
  });

  it("returns results chronologically oldest→newest", () => {
    const r = computeTeamRecord([
      g("late", "2025-10-01", 2, 1),
      g("early", "2025-09-01", 0, 0),
    ]);
    expect(r.results.map((x) => x.id)).toEqual(["early", "late"]);
    expect(r.results[0].result).toBe("D");
    expect(r.results[1].result).toBe("W");
  });
});

describe("buildLeagueTable", () => {
  const opponents = [
    { name: "Alpha", team_id: "1", current_ptn_per_match: 2.5, current_position: 1 },
    { name: "Bravo", team_id: "2", current_ptn_per_match: 1.0, current_position: 2 },
    { name: "Charlie", team_id: "3", current_ptn_per_match: null, current_position: null },
  ];

  it("inserts our team by computed pts/match and ranks all together", () => {
    const record = computeTeamRecord([
      g("a", "2025-09-10", 5, 2), // W → 3 pts in 1 game → 3.0 ppm
    ]);
    const table = buildLeagueTable(opponents, record, "Caracrew");
    expect(table).toHaveLength(4);
    // 3.0 (us) > 2.5 (Alpha) > 1.0 (Bravo) > null (Charlie)
    expect(table.map((r) => r.team)).toEqual(["Caracrew", "Alpha", "Bravo", "Charlie"]);
    expect(table[0]).toMatchObject({ rank: 1, isUs: true, ptnPerMatch: 3 });
    expect(table[3]).toMatchObject({ rank: 4, team: "Charlie", ptnPerMatch: null });
  });

  it("sends our team below all scored teams with no played games (null pts/match)", () => {
    const table = buildLeagueTable(opponents, computeTeamRecord([]), "Caracrew");
    const us = table.find((r) => r.isUs);
    expect(us.ptnPerMatch).toBeNull();
    // Below Alpha (2.5) and Bravo (1.0); among the null rows, "Caracrew" < "Charlie" by name.
    expect(table.map((r) => r.team)).toEqual(["Alpha", "Bravo", "Caracrew", "Charlie"]);
    expect(us.rank).toBe(3);
  });
});
