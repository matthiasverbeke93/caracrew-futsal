import { describe, expect, it } from "vitest";
import { buildWhatsAppNudgeUrl, formatMatchShortDate } from "./formatMatch.js";

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

describe("buildWhatsAppNudgeUrl", () => {
  const game = {
    id: 42,
    season_slug: "2026-2027",
    opponent: "Nova FC",
    game_date: "2026-09-08",
    game_time: "21:00:00",
    location: "Sporthal Ter Linden",
  };
  const snapshot = { fixedRoster: 13, playing: 5, if_needed: 2, cant: 3, missing: 3, guests: 1 };

  function messageOf(url) {
    return decodeURIComponent(url.replace("https://wa.me/?text=", ""));
  }

  it("leads with the fixture in bold, then date, kick-off and venue", () => {
    const lines = messageOf(buildWhatsAppNudgeUrl(game, ["Jan"], snapshot)).split("\n");
    expect(lines[0]).toBe("*K. Caracrew SK vs Nova FC*");
    // The date half comes from Intl ("Tue, 8 Sept 2026" on this ICU), so assert the shape.
    expect(lines[1]).toMatch(/^Tue,? 8 Sept? 2026 · 21:00 · Sporthal Ter Linden$/);
  });

  it("lists the missing players as a sentence and closes with the link", () => {
    const msg = messageOf(buildWhatsAppNudgeUrl(game, ["Jan", "Piet", "Bram"], snapshot));
    expect(msg).toContain("In 5 · If needed 2 · Out 3 · No reply 3");
    expect(msg).toContain("13 in the roster · 1 guest");
    expect(msg).toContain("Still waiting on Jan, Piet and Bram.");
    expect(msg).toContain("Confirm here:");
    expect(msg).toContain("game=42");
  });

  it("uses no 'and' for a single name and drops the guest count when there are none", () => {
    const msg = messageOf(buildWhatsAppNudgeUrl(game, ["Jan"], { ...snapshot, guests: 0 }));
    expect(msg).toContain("Still waiting on Jan.");
    expect(msg).toContain("13 in the roster\n");
    expect(msg).not.toContain("guest");
  });

  it("omits the when/where line and the names line when there is nothing to say", () => {
    const msg = messageOf(
      buildWhatsAppNudgeUrl({ ...game, game_date: null, game_time: null, location: "" }, [], snapshot)
    );
    expect(msg.split("\n")[1]).toBe("");
    expect(msg).not.toContain("Still waiting on");
  });
});
