import { describe, expect, it } from "vitest";
import { formatMatchShortDate } from "./formatMatch.js";

describe("formatMatchShortDate", () => {
  it("renders a game_date as DD-MM-YY", () => {
    expect(formatMatchShortDate({ game_date: "2026-08-22" })).toBe("22-08-26");
  });

  it("accepts a raw date string as well as a game", () => {
    expect(formatMatchShortDate("2026-12-05")).toBe("05-12-26");
  });

  it("keeps the leading zeros rather than trimming to 5-12-26", () => {
    expect(formatMatchShortDate({ game_date: "2027-01-09" })).toBe("09-01-27");
  });

  it("takes the day off an ISO datetime without shifting it", () => {
    expect(formatMatchShortDate({ game_date: "2026-08-22T00:30:00+02:00" })).toBe("22-08-26");
  });

  it("returns an empty string for a missing or unparseable date", () => {
    expect(formatMatchShortDate({ game_date: null })).toBe("");
    expect(formatMatchShortDate({})).toBe("");
    expect(formatMatchShortDate("not a date")).toBe("");
  });
});
