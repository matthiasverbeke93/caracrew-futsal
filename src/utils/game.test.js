import { describe, expect, it } from "vitest";
import {
  getStatsLockDaysLeft,
  isAttendanceEditable,
  isAttendanceEditableByCalendar,
  isAttendanceInUpcomingWindow,
  isPlayed,
  isStatsEditable,
  isStatsFrozen,
  nextUpcomingGamesByCalendar,
  STATS_FREEZE_DAYS,
} from "./game.js";

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
    expect(isAttendanceEditableByCalendar(g(isoOffset(0)))).toBe(true);
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
    expect(isStatsFrozen(g(isoOffset(-STATS_FREEZE_DAYS)))).toBe(false); // boundary: exactly 10 = editable
    expect(isStatsFrozen(g(isoOffset(-(STATS_FREEZE_DAYS + 1))))).toBe(true);
  });

  it("isStatsEditable: played and not yet frozen", () => {
    expect(isStatsEditable(g(isoOffset(-3)))).toBe(true);
    expect(isStatsEditable(g(isoOffset(1)))).toBe(false); // future game
    expect(isStatsEditable(g(isoOffset(-(STATS_FREEZE_DAYS + 5))))).toBe(false); // frozen
  });

  it("getStatsLockDaysLeft counts down, null once frozen or in the future", () => {
    expect(getStatsLockDaysLeft(g(isoOffset(-3)))).toBe(STATS_FREEZE_DAYS - 3);
    expect(getStatsLockDaysLeft(g(isoOffset(1)))).toBeNull();
    expect(getStatsLockDaysLeft(g(isoOffset(-(STATS_FREEZE_DAYS + 2))))).toBeNull();
  });
});
