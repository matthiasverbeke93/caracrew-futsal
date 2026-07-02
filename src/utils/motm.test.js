import { describe, expect, it } from "vitest";
import { getMotmLeaderIds, isMotmVotingOpen } from "./motm.js";

/** Local YYYY-MM-DD offset from today. */
function isoOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

describe("getMotmLeaderIds", () => {
  const votes = [
    { game_id: "g1", nominee_id: "a" },
    { game_id: "g1", nominee_id: "a" },
    { game_id: "g1", nominee_id: "b" },
    { game_id: "g2", nominee_id: "z" }, // different game — ignored
  ];

  it("returns the single top vote-getter", () => {
    expect(getMotmLeaderIds("g1", votes)).toEqual(["a"]);
  });

  it("returns all tied leaders", () => {
    const tied = [
      { game_id: "g1", nominee_id: "a" },
      { game_id: "g1", nominee_id: "b" },
    ];
    expect(getMotmLeaderIds("g1", tied)).toEqual(["a", "b"]);
  });

  it("returns [] when there are no votes for the game", () => {
    expect(getMotmLeaderIds("g9", votes)).toEqual([]);
    expect(getMotmLeaderIds("g1", [])).toEqual([]);
  });
});

describe("isMotmVotingOpen", () => {
  it("is open within 24h after estimated full-time of a played game", () => {
    const game = { id: "g", game_date: isoOffset(-1), game_time: "18:00", season_slug: "2627" };
    // full-time ≈ yesterday 20:00, window closes today 20:00
    const withinWindow = new Date(`${isoOffset(-1)}T21:00:00`).getTime();
    expect(isMotmVotingOpen(game, withinWindow)).toBe(true);
  });

  it("is closed once the 24h window has passed", () => {
    const game = { id: "g", game_date: isoOffset(-1), game_time: "18:00", season_slug: "2627" };
    const wellAfter = new Date(`${isoOffset(2)}T00:00:00`).getTime();
    expect(isMotmVotingOpen(game, wellAfter)).toBe(false);
  });

  it("is closed for a game that has not been played yet", () => {
    const future = { id: "g", game_date: isoOffset(2), game_time: "18:00", season_slug: "2627" };
    expect(isMotmVotingOpen(future, Date.now())).toBe(false);
  });
});
