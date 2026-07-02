import { describe, expect, it } from "vitest";
import { buildPlayersPerGameSeries } from "./seasonInsights.js";

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

  it("returns one point per played fixture, chronological, counting only played rows", () => {
    const series = buildPlayersPerGameSeries(games, stats);
    expect(series.map((s) => s.id)).toEqual(["gA", "gB"]); // date order, future dropped
    expect(series.map((s) => s.players)).toEqual([2, 1]);
  });

  it("counts a played fixture with no stats as 0", () => {
    const series = buildPlayersPerGameSeries([{ id: "gX", game_date: isoOffset(-2) }], []);
    expect(series).toEqual([
      { id: "gX", date: isoOffset(-2), opponent: undefined, players: 0 },
    ]);
  });

  it("handles empty input", () => {
    expect(buildPlayersPerGameSeries([], [])).toEqual([]);
    expect(buildPlayersPerGameSeries(null, null)).toEqual([]);
  });
});
