import { describe, expect, it } from "vitest";
import { hasRecordedStats, playersOwingStats } from "./statsChase.js";

const roster = [
  { id: "1", name: "Cédric" },
  { id: "2", name: "Laurens" },
  { id: "3", name: "Stef" },
  { id: "4", name: "Bench" },
];
const attendance = [
  { player_id: "1", status: "playing" },
  { player_id: "2", status: "playing" },
  { player_id: "3", status: "playing" },
  { player_id: "4", status: "not_playing" },
];

describe("playersOwingStats", () => {
  it("chases an In player whose row says they did not play", () => {
    const stats = [
      { player_id: "1", goals: 0, assists: 0, played: false },
      { player_id: "2", goals: 1, assists: 2, played: true },
    ];
    const { playedRoster, owing } = playersOwingStats(roster, attendance, stats);
    expect(playedRoster.map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(owing.map((p) => p.id)).toEqual(["1", "3"]);
  });

  it("treats legacy rows without the played column as recorded", () => {
    const { owing } = playersOwingStats(roster, attendance, [
      { player_id: "1", goals: 0, assists: 0 },
      { player_id: "2", goals: 0, assists: 0 },
      { player_id: "3", goals: 0, assists: 0 },
    ]);
    expect(owing).toEqual([]);
  });

  it("handles missing inputs", () => {
    expect(playersOwingStats(null, null, null)).toEqual({ playedRoster: [], owing: [] });
    expect(hasRecordedStats(undefined)).toBe(false);
  });
});
