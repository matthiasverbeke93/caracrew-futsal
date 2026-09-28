/* global process */
import { describe, expect, it } from "vitest";
import { buildMonthlyTeamGaSeries, buildPlayersPerGameSeries } from "./seasonInsights.js";

function isoOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

describe("buildPlayersPerGameSeries", () => {
  const games = [
    { id: "gB", game_date: isoOffset(-1), opponent: "B" },
    { id: "gA", game_date: isoOffset(-3), opponent: "A" },
    { id: "gFuture", game_date: isoOffset(3), opponent: "F" },
  ];
  const stats = [
    { game_id: "gA", player_id: "1", played: true },
    { game_id: "gA", player_id: "2" }, // played undefined => counts
    { game_id: "gA", player_id: "3", played: false }, // excluded
    { game_id: "gB", player_id: "1", played: true },
    { game_id: "gFuture", player_id: "1", played: true }, // future game excluded
  ];
  const guests = [
    { game_id: "gA", status: "playing" }, // counts as a guest
    { game_id: "gA", status: "cant" }, // excluded
    { game_id: "gFuture", status: "playing" }, // future game excluded
  ];

  it("splits roster/guests per played fixture in date order (future dropped)", () => {
    const series = buildPlayersPerGameSeries(games, stats, guests);
    expect(series.map((s) => s.id)).toEqual(["gA", "gB"]);
    expect(series.map((s) => s.roster)).toEqual([2, 1]);
    expect(series.map((s) => s.guests)).toEqual([1, 0]);
    expect(series.map((s) => s.players)).toEqual([3, 1]); // roster + guests
  });

  it("counts a played fixture with no data as 0", () => {
    const series = buildPlayersPerGameSeries([{ id: "gX", game_date: isoOffset(-2) }], [], []);
    expect(series).toEqual([
      { id: "gX", date: isoOffset(-2), opponent: undefined, roster: 0, guests: 0, players: 0 },
    ]);
  });

  it("handles empty/missing input", () => {
    expect(buildPlayersPerGameSeries([], [], [])).toEqual([]);
    expect(buildPlayersPerGameSeries(null, null, null)).toEqual([]);
  });
});

describe("buildMonthlyTeamGaSeries month labels", () => {
  it("labels the month itself for a viewer west of UTC", () => {
    const saved = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const [row] = buildMonthlyTeamGaSeries([{ id: "g", game_date: "2025-10-12" }], []);
      expect(row.label).toBe("Oct 2025");
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });
});
