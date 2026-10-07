import { describe, expect, it } from "vitest";
import {
  getStatsLockDaysLeft,
  playerStatusLabel,
  readinessClass,
  isAttendanceEditable,
  isAttendanceEditableByCalendar,
  isAttendanceInUpcomingWindow,
  isGameFull,
  isPlayed,
  isRsvpAllowedWhenFull,
  isStatsEditable,
  isStatsFrozen,
  nextUpcomingGamesByCalendar,
  parseFinalScore,
  STATS_FREEZE_DAYS,
} from "./game.js";
import { GAME_FULL_PLAYERS } from "../constants.js";

/** Local YYYY-MM-DD offset from today — mirrors the util's own local-day logic. */
function isoOffset(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const g = (date, extra = {}) => ({ id: date, game_date: date, ...extra });

describe("isPlayed", () => {
  it("is true only for strictly-past dates", () => {
    expect(isPlayed(g(isoOffset(-1)))).toBe(true);
    expect(isPlayed(g(isoOffset(0)))).toBe(false); // today is not yet played
    expect(isPlayed(g(isoOffset(1)))).toBe(false);
  });
});

describe("isAttendanceEditableByCalendar", () => {
  it("allows today and future, rejects past and undated", () => {
    expect(isAttendanceEditableByCalendar(g(isoOffset(3)))).toBe(true);
    expect(isAttendanceEditableByCalendar(g(isoOffset(-1)))).toBe(false);
    expect(isAttendanceEditableByCalendar({})).toBe(false);
  });
});

describe("nextUpcomingGamesByCalendar", () => {
  const games = [
    g(isoOffset(-2)),
    g(isoOffset(5), { game_time: "20:00" }),
    { id: "a", game_date: isoOffset(1), game_time: "21:00" },
    { id: "b", game_date: isoOffset(1), game_time: "19:00" },
    g(isoOffset(10)),
  ];

  it("drops played games and sorts by date then kick-off time", () => {
    expect(nextUpcomingGamesByCalendar(games, 3).map((x) => x.id)).toEqual([
      "b",
      "a",
      isoOffset(5),
    ]);
  });

  it("respects the limit and handles empty input", () => {
    expect(nextUpcomingGamesByCalendar(games, 1).map((x) => x.id)).toEqual(["b"]);
    expect(nextUpcomingGamesByCalendar([], 3)).toEqual([]);
    expect(nextUpcomingGamesByCalendar(null)).toEqual([]);
  });
});

describe("isAttendanceInUpcomingWindow", () => {
  const games = [
    { id: "a", game_date: isoOffset(1) },
    { id: "b", game_date: isoOffset(2) },
    { id: "c", game_date: isoOffset(3) },
    { id: "d", game_date: isoOffset(4) },
  ];

  it("only the next N upcoming fixtures are inside the window", () => {
    expect(isAttendanceInUpcomingWindow(games[0], games, 3)).toBe(true);
    expect(isAttendanceInUpcomingWindow(games[2], games, 3)).toBe(true);
    expect(isAttendanceInUpcomingWindow(games[3], games, 3)).toBe(false); // 4th
  });
});

// Match day: a 21:00 Brussels kickoff. Times are chosen to sit on the same side of
// kickoff whether the runner is on Brussels time or UTC.
describe("match day turns on kickoff, not the calendar day", () => {
  const matchDay = { id: "md", game_date: "2026-10-14", game_time: "21:00:00" };
  const morning = new Date(2026, 9, 14, 12, 0).getTime();
  const lateEvening = new Date(2026, 9, 14, 22, 30).getTime();

  it("keeps RSVP open until kickoff, then closes it", () => {
    expect(isAttendanceEditableByCalendar(matchDay, morning)).toBe(true);
    expect(isAttendanceEditableByCalendar(matchDay, lateEvening)).toBe(false);
  });

  it("opens stats only once the match has kicked off — admins included", () => {
    expect(isStatsEditable(matchDay, { nowMs: morning })).toBe(false);
    expect(isStatsEditable(matchDay, { nowMs: morning, isAdmin: true })).toBe(false);
    expect(isStatsEditable(matchDay, { nowMs: lateEvening })).toBe(true);
  });

  it("falls back to a 21:00 kickoff when game_time is missing", () => {
    const noTime = { id: "nt", game_date: "2026-10-14" };
    expect(isStatsEditable(noTime, { nowMs: morning })).toBe(false);
    expect(isAttendanceEditableByCalendar(noTime, morning)).toBe(true);
  });
});

describe("parseFinalScore", () => {
  it("accepts two whole numbers, including 0", () => {
    expect(parseFinalScore("5", "2")).toEqual({ kind: "score", home: 5, away: 2 });
    expect(parseFinalScore("0", " 0 ")).toEqual({ kind: "score", home: 0, away: 0 });
  });

  it("clears when both sides are empty", () => {
    expect(parseFinalScore("", "")).toEqual({ kind: "clear" });
    expect(parseFinalScore(undefined, " ")).toEqual({ kind: "clear" });
  });

  it("waits while only one side is filled", () => {
    expect(parseFinalScore("5", "")).toEqual({ kind: "incomplete" });
    expect(parseFinalScore("", "3")).toEqual({ kind: "incomplete" });
  });

  it("rejects negative, decimal and non-numeric goals", () => {
    expect(parseFinalScore("-1", "2").kind).toBe("invalid");
    expect(parseFinalScore("2.5", "2").kind).toBe("invalid");
    expect(parseFinalScore("1e1", "2").kind).toBe("invalid");
    expect(parseFinalScore("abc", "").kind).toBe("invalid");
  });
});

describe("isAttendanceEditable", () => {
  const games = [
    { id: "a", game_date: isoOffset(1) },
    { id: "b", game_date: isoOffset(2) },
    { id: "c", game_date: isoOffset(3) },
    { id: "d", game_date: isoOffset(9) },
  ];

  it("requires calendar-editable AND (when allGames given) inside the window", () => {
    expect(isAttendanceEditable(games[0], games)).toBe(true);
    expect(isAttendanceEditable(games[3], games)).toBe(false); // upcoming but beyond window
    expect(isAttendanceEditable(g(isoOffset(-1)), games)).toBe(false); // past
  });

  it("skips the window check when allGames is not provided", () => {
    expect(isAttendanceEditable({ game_date: isoOffset(1) })).toBe(true);
  });
});

describe("stats freeze window", () => {
  it("freezes strictly after STATS_FREEZE_DAYS days", () => {
    expect(isStatsFrozen(g(isoOffset(-(STATS_FREEZE_DAYS - 1))))).toBe(false);
    expect(isStatsFrozen(g(isoOffset(-STATS_FREEZE_DAYS)))).toBe(false); // boundary: exactly STATS_FREEZE_DAYS = editable
    expect(isStatsFrozen(g(isoOffset(-(STATS_FREEZE_DAYS + 1))))).toBe(true);
  });

  it("isStatsEditable: played and not yet frozen", () => {
    expect(isStatsEditable(g(isoOffset(-(STATS_FREEZE_DAYS - 1))))).toBe(true);
    expect(isStatsEditable(g(isoOffset(1)))).toBe(false); // future game
    expect(isStatsEditable(g(isoOffset(-(STATS_FREEZE_DAYS + 5))))).toBe(false); // frozen
  });

  it("isStatsEditable: an admin is exempt from the freeze but not from 'played'", () => {
    const opts = { isAdmin: true };
    expect(isStatsEditable(g(isoOffset(-(STATS_FREEZE_DAYS + 30))), opts)).toBe(true);
    expect(isStatsEditable(g(isoOffset(1)), opts)).toBe(false); // nothing to record yet
    expect(isStatsEditable(undefined, opts)).toBe(false);
  });

  it("getStatsLockDaysLeft counts down, null once frozen or in the future", () => {
    expect(getStatsLockDaysLeft(g(isoOffset(0)))).toBe(STATS_FREEZE_DAYS + 1);
    expect(getStatsLockDaysLeft(g(isoOffset(-1)))).toBe(STATS_FREEZE_DAYS);
    // Last editable day: still editable, so the countdown must show (it locks tomorrow).
    expect(isStatsEditable(g(isoOffset(-STATS_FREEZE_DAYS)))).toBe(true);
    expect(getStatsLockDaysLeft(g(isoOffset(-STATS_FREEZE_DAYS)))).toBe(1);
    expect(getStatsLockDaysLeft(g(isoOffset(-(STATS_FREEZE_DAYS + 1))))).toBeNull();
    expect(getStatsLockDaysLeft(g(isoOffset(1)))).toBeNull();
    expect(getStatsLockDaysLeft(g(isoOffset(-(STATS_FREEZE_DAYS + 2))))).toBeNull();
  });
});

describe("stats freeze counts calendar days, not 24h blocks", () => {
  it("is not shifted by a DST change between the game and now", () => {
    // Europe/Brussels springs forward on 2027-03-28; three calendar days later is frozen.
    const game = { game_date: "2027-03-27" };
    const now = new Date(2027, 2, 30, 0, 30).getTime();
    expect(isStatsFrozen(game, now)).toBe(true);
    expect(getStatsLockDaysLeft(game, now)).toBeNull();
    const lastDay = new Date(2027, 2, 29, 23, 30).getTime();
    expect(isStatsFrozen(game, lastDay)).toBe(false);
    expect(getStatsLockDaysLeft(game, lastDay)).toBe(1);
  });
});

describe("readiness (count vs. nobody-has-answered)", () => {
  it("keeps the old thresholds once people have answered", () => {
    expect(playerStatusLabel(3, 8)).toBe("Not enough players");
    expect(playerStatusLabel(6, 9)).toBe("Just enough players");
    expect(playerStatusLabel(7, 9)).toBe("Enough players");
    expect(playerStatusLabel(GAME_FULL_PLAYERS, 9)).toBe("Full — RSVP closed");
    expect(readinessClass(3, 8)).toBe("game-card danger");
    expect(readinessClass(6, 9)).toBe("game-card warning");
    expect(readinessClass(7, 9)).toBe("game-card success");
    expect(readinessClass(GAME_FULL_PLAYERS, 9)).toBe("game-card success"); // full is still "good"
  });

  it("reports 'no responses yet' instead of a red 'not enough' when nobody has answered", () => {
    // Every fixture of a freshly imported season looks like this.
    expect(playerStatusLabel(0, 0)).toBe("No responses yet");
    expect(readinessClass(0, 0)).toBe("game-card neutral");
  });

  it("still warns when people answered but too few are in", () => {
    // 9 answers, all "Out" — genuinely short-handed, not unknown.
    expect(playerStatusLabel(0, 9)).toBe("Not enough players");
    expect(readinessClass(0, 9)).toBe("game-card danger");
  });

  it("falls back to count-only behaviour when responses are not supplied", () => {
    expect(playerStatusLabel(0)).toBe("Not enough players");
    expect(readinessClass(0)).toBe("game-card danger");
  });
});

describe("full game (enough players — RSVP closes)", () => {
  it("is full at GAME_FULL_PLAYERS In, not before", () => {
    expect(isGameFull(GAME_FULL_PLAYERS - 1)).toBe(false);
    expect(isGameFull(GAME_FULL_PLAYERS)).toBe(true);
    expect(isGameFull(GAME_FULL_PLAYERS + 1)).toBe(true);
  });

  it("treats a missing count as not full", () => {
    expect(isGameFull(undefined)).toBe(false);
    expect(isGameFull(null)).toBe(false);
    expect(isGameFull(0)).toBe(false);
  });

  it("lets an In player drop out, so a freed spot reopens the match", () => {
    expect(isRsvpAllowedWhenFull("playing", "cant")).toBe(true);
    expect(isRsvpAllowedWhenFull("playing", "if_needed")).toBe(true);
    expect(isRsvpAllowedWhenFull("playing", null)).toBe(true); // Clear RSVP
  });

  it("blocks everything that does not free a spot", () => {
    expect(isRsvpAllowedWhenFull("playing", "playing")).toBe(false); // no-op re-click
    expect(isRsvpAllowedWhenFull(null, "playing")).toBe(false); // late sign-up
    expect(isRsvpAllowedWhenFull("cant", "playing")).toBe(false);
    expect(isRsvpAllowedWhenFull("if_needed", "playing")).toBe(false);
    expect(isRsvpAllowedWhenFull("cant", "if_needed")).toBe(false); // pointless churn while full
    expect(isRsvpAllowedWhenFull("cant", null)).toBe(false);
  });
});
