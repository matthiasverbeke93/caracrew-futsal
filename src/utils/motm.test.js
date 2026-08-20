import { describe, expect, it } from "vitest";
import { MOTM_VOTING_DAYS, getMotmLeaderIds, isMotmVotingOpen } from "./motm.js";

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
  it("is open within the window after estimated full-time of a played game", () => {
    const game = { id: "g", game_date: isoOffset(-1), game_time: "18:00", season_slug: "2627" };
    // full-time ≈ yesterday 20:00; the window now runs 5 days from there
    const withinWindow = new Date(`${isoOffset(-1)}T21:00:00`).getTime();
    expect(isMotmVotingOpen(game, withinWindow)).toBe(true);
  });

  it("stays open on the days in between — not just the next day", () => {
    const game = { id: "g", game_date: isoOffset(-1), game_time: "18:00", season_slug: "2627" };
    // Two days after the match was shut under the old 24h window; now it is mid-window.
    const twoDaysLater = new Date(`${isoOffset(1)}T12:00:00`).getTime();
    expect(isMotmVotingOpen(game, twoDaysLater)).toBe(true);
  });

  it("is closed once the window has passed", () => {
    const game = { id: "g", game_date: isoOffset(-1), game_time: "18:00", season_slug: "2627" };
    // Derived from the constant, so widening the window cannot silently pass this.
    const wellAfter = new Date(`${isoOffset(MOTM_VOTING_DAYS + 1)}T00:00:00`).getTime();
    expect(isMotmVotingOpen(game, wellAfter)).toBe(false);
  });

  it("is closed for a game that has not been played yet", () => {
    const future = { id: "g", game_date: isoOffset(2), game_time: "18:00", season_slug: "2627" };
    expect(isMotmVotingOpen(future, Date.now())).toBe(false);
  });

  // Regression: the window used to be gated on isPlayed(), which is day-granular
  // (game_date < today), so voting on match night stayed shut until midnight —
  // exactly the hours after the final whistle when people vote.
  describe("opens on match night, not at midnight", () => {
    const today = isoOffset(0);
    const at = (hhmm) => new Date(`${today}T${hhmm}:00`).getTime();

    it("21:00 home kickoff is open from 23:00 the same evening", () => {
      const game = { id: "g", game_date: today, game_time: "21:00", season_slug: "2627" };
      expect(isMotmVotingOpen(game, at("23:30"))).toBe(true);
    });

    it("18:00 away kickoff is open from 20:00 the same evening", () => {
      // The 26-27 calendar has 18:00/19:00/19:30/20:00 away kickoffs — this one
      // used to lose four hours of its window.
      const game = { id: "g", game_date: today, game_time: "18:00", season_slug: "2627" };
      expect(isMotmVotingOpen(game, at("20:30"))).toBe(true);
    });

    it("stays shut before estimated full-time", () => {
      const game = { id: "g", game_date: today, game_time: "21:00", season_slug: "2627" };
      expect(isMotmVotingOpen(game, at("22:00"))).toBe(false);
      expect(isMotmVotingOpen(game, at("20:00"))).toBe(false);
    });
  });
});
