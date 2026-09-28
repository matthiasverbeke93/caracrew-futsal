import { describe, expect, it } from "vitest";
import { getHeadToHeadSummary } from "./headToHead.js";

const game = (date, opponent, us, them) => ({ id: date, game_date: date, opponent, home_score: us, away_score: them });

describe("getHeadToHeadSummary", () => {
  it("returns null without an opponent, games, or a played meeting", () => {
    expect(getHeadToHeadSummary([], "VT 09")).toBeNull();
    expect(getHeadToHeadSummary([game("2020-01-01", "VT 09", 1, 0)], "")).toBeNull();
    expect(getHeadToHeadSummary([game("2999-01-01", "VT 09", null, null)], "VT 09")).toBeNull();
  });

  it("matches the opponent loosely (case, dots, score tail) and reports the last meeting", () => {
    const games = [game("2020-01-01", "V.T. 09", 2, 5), game("2020-02-01", "vt 09 3-2", 4, 1)];
    // "V.T. 09" normalises to "vt 09", same as "vt 09 3-2" once the score tail is gone.
    const summary = getHeadToHeadSummary(games, "VT 09");
    expect(summary.lastLine).toBe("Last meeting: 4–1 W");
    expect(summary.seasonLine).toBe("Season vs them: 1W-0D-1L (2 played)");
    expect(summary.gamesPlayed).toBe(2);
  });

  it("says so when a played meeting has no score yet", () => {
    const summary = getHeadToHeadSummary([game("2020-01-01", "VT 09", null, null)], "VT 09");
    expect(summary.lastLine).toBe("Last meeting: score not set");
    expect(summary.seasonLine).toBe("This season: set final scores on played games to see record");
  });

  it("ignores other opponents", () => {
    const summary = getHeadToHeadSummary(
      [game("2020-01-01", "VT 09", 1, 1), game("2020-01-08", "FC Tripel", 9, 0)],
      "VT 09"
    );
    expect(summary.gamesPlayed).toBe(1);
    expect(summary.lastLine).toBe("Last meeting: 1–1 D");
    expect(summary.seasonLine).toBeNull(); // one scored meeting is not a record
  });
});
