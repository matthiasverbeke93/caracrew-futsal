import { describe, expect, it } from "vitest";
import { buildGoldenBootRace } from "./goldenBoot.js";

// Past dates so isPlayed() is true.
const game = (id, date) => ({ id, game_date: date, opponent: `Opp ${id}` });
const stat = (game_id, player_id, goals, assists = 0) => ({ game_id, player_id, goals, assists });

const games = [game("g2", "2025-09-17"), game("g1", "2025-09-10"), game("g3", "2025-09-24")];
const players = [
  { id: "p1", name: "Ann" },
  { id: "p2", name: "Bob" },
  { id: "p3", name: "Cid" },
];
const stats = [
  stat("g1", "p1", 2, 1),
  stat("g1", "p2", 1, 0),
  stat("g2", "p1", 1, 2),
  stat("g2", "p3", 3, 0),
  stat("g3", "p2", 2, 1),
];

describe("buildGoldenBootRace", () => {
  it("orders points by date and returns monotonic cumulative goals", () => {
    const race = buildGoldenBootRace(games, stats, players, { metric: "goals" });
    expect(race.points.map((p) => p.id)).toEqual(["g1", "g2", "g3"]);
    const p1 = race.players.find((p) => p.id === "p1");
    // goals: g1=2, g2=+1, g3=+0
    expect(p1.cumulative).toEqual([2, 3, 3]);
    expect(p1.total).toBe(3);
    // non-decreasing for every player
    for (const p of race.players) {
      for (let i = 1; i < p.cumulative.length; i++) {
        expect(p.cumulative[i]).toBeGreaterThanOrEqual(p.cumulative[i - 1]);
      }
      expect(p.cumulative).toHaveLength(3);
    }
  });

  it("supports the goals+assists metric and ranks by final total", () => {
    const race = buildGoldenBootRace(games, stats, players, { metric: "ga" });
    // totals G+A: p1 = (2+1)+(1+2) = 6; p2 = 1 + (2+1) = 4; p3 = 3
    expect(race.players.map((p) => [p.name, p.total])).toEqual([
      ["Ann", 6],
      ["Bob", 4],
      ["Cid", 3],
    ]);
  });

  it("honours topN and drops players with no contribution", () => {
    const race = buildGoldenBootRace(games, stats, players, { metric: "goals", topN: 2 });
    expect(race.players).toHaveLength(2);
    // goals totals: p3=3, p1=3 (tie -> name), p2=3 ... top 2 by goals then name
    expect(race.players.every((p) => p.total > 0)).toBe(true);
  });

  it("is empty with no played games", () => {
    const future = [game("f", "2099-01-01")];
    const race = buildGoldenBootRace(future, [stat("f", "p1", 5)], players);
    expect(race.points).toEqual([]);
    expect(race.players).toEqual([]);
  });
});
