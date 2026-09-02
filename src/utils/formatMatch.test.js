import { describe, expect, it } from "vitest";
import {
  buildGameWhatsAppShareUrl,
  buildWhatsAppMatchOpenUrl,
  buildWhatsAppNudgeUrl,
  buildWhatsAppStatsChaseUrl,
  formatFixtureRowDateTime,
  formatFixtureShareText,
  formatMatchShortDate,
} from "./formatMatch.js";

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

describe("formatFixtureRowDateTime", () => {
  it("leads with the abbreviated weekday and trims the seconds off game_time", () => {
    expect(formatFixtureRowDateTime({ game_date: "2026-08-22", game_time: "21:00:00" })).toBe(
      "Sat 22-08-26 · 21:00"
    );
    expect(formatFixtureRowDateTime({ game_date: "2026-09-06", game_time: "18:00:00" })).toBe(
      "Sun 06-09-26 · 18:00"
    );
  });

  it("reads the weekday off the local day string, not off Date math", () => {
    // The day is taken from the ISO prefix, so an offset on the timestamp cannot shift it.
    expect(
      formatFixtureRowDateTime({ game_date: "2026-08-22T00:30:00+02:00", game_time: "21:00" })
    ).toBe("Sat 22-08-26 · 21:00");
  });

  it("shows --:-- for a fixture with no kick-off yet", () => {
    expect(formatFixtureRowDateTime({ game_date: "2026-08-22" })).toBe("Sat 22-08-26 · --:--");
    expect(formatFixtureRowDateTime({ game_date: "2026-08-22", game_time: null })).toBe(
      "Sat 22-08-26 · --:--"
    );
  });

  it("falls back to the time alone when the date is missing or unparseable", () => {
    expect(formatFixtureRowDateTime({ game_time: "20:00:00" })).toBe("20:00");
    expect(formatFixtureRowDateTime({ game_date: "not a date" })).toBe("--:--");
    expect(formatFixtureRowDateTime(null)).toBe("--:--");
  });
});

const GAME = {
  id: 42,
  season_slug: "2026-2027",
  opponent: "Nova FC",
  game_date: "2026-09-08",
  game_time: "21:00:00",
  location: "Sporthal Ter Linden",
};

/** `Intl` renders the date half as "Tue, 8 Sept 2026" on this ICU; other builds differ. */
const WHEN_WHERE = /^Tue,? 8 Sept? 2026 · 21:00 · Sporthal Ter Linden$/;

function messageOf(url) {
  return decodeURIComponent(url.replace("https://wa.me/?text=", ""));
}

describe("formatFixtureShareText", () => {
  it("puts the fixture first, then the formatted date, kick-off and venue", () => {
    const lines = formatFixtureShareText(GAME).split("\n");
    expect(lines[0]).toBe("K. Caracrew SK vs Nova FC");
    expect(lines[1]).toMatch(WHEN_WHERE);
  });

  it("never emits a dangling separator when the time or venue is missing", () => {
    const text = formatFixtureShareText({ ...GAME, game_time: null, location: "" });
    expect(text).not.toContain("·  ·");
    expect(text.split("\n")[1]).toBe("Tue, 8 Sept 2026");
  });

  it("adds the final score once a played fixture has one", () => {
    expect(formatFixtureShareText({ ...GAME, home_score: 5, away_score: 3 })).toContain(
      "Final score 5 – 3"
    );
    expect(formatFixtureShareText({ ...GAME, home_score: 0, away_score: 0 })).toContain(
      "Final score 0 – 0"
    );
    expect(formatFixtureShareText(GAME)).not.toContain("Final score");
  });
});

describe("buildGameWhatsAppShareUrl", () => {
  it("bolds the fixture and keeps the link on its own line", () => {
    const lines = messageOf(buildGameWhatsAppShareUrl(GAME)).split("\n");
    expect(lines[0]).toBe("*K. Caracrew SK vs Nova FC*");
    expect(lines[1]).toMatch(WHEN_WHERE);
    expect(lines[2]).toBe("");
    expect(lines[3]).toContain("game=42");
    expect(lines[3]).toContain("season=2026-2027");
  });

  it("does not leak the raw game_date or the seconds off game_time", () => {
    const msg = messageOf(buildGameWhatsAppShareUrl(GAME));
    expect(msg).not.toContain("2026-09-08");
    expect(msg).not.toContain("21:00:00");
  });
});

describe("buildWhatsAppNudgeUrl", () => {
  const snapshot = {
    fixedRoster: 12,
    playing: 4,
    if_needed: 2,
    cant: 3,
    guests: 1,
    guestPlaying: 1,
  };

  it("leads with the fixture in bold, then date, kick-off and venue", () => {
    const lines = messageOf(buildWhatsAppNudgeUrl(GAME, ["Jan"], snapshot)).split("\n");
    expect(lines[0]).toBe("*K. Caracrew SK vs Nova FC*");
    expect(lines[1]).toMatch(WHEN_WHERE);
  });

  it("prints a roster tally that adds up to the roster size", () => {
    const msg = messageOf(buildWhatsAppNudgeUrl(GAME, ["Koen", "David", "Lennart"], snapshot));
    expect(msg).toContain("*Roster (12)* · In 4 · If needed 2 · Out 3 · No reply 3");
    expect(snapshot.playing + snapshot.if_needed + snapshot.cant + 3).toBe(snapshot.fixedRoster);
  });

  it("takes 'No reply' from the names it lists, so the two can never disagree", () => {
    // A stale `missing` in the snapshot must not win over the actual list.
    const msg = messageOf(buildWhatsAppNudgeUrl(GAME, ["Koen", "David"], { ...snapshot, missing: 6 }));
    expect(msg).toContain("No reply 2");
    expect(msg).not.toContain("No reply 6");
    expect(msg).toContain("Still waiting on Koen and David.");
  });

  it("keeps guests on their own line and only mentions statuses that happened", () => {
    const msg = messageOf(buildWhatsAppNudgeUrl(GAME, ["Jan"], snapshot));
    expect(msg).toContain("*Guests (1)* · 1 in");
    expect(msg).not.toContain("0 out");
  });

  it("drops the guest line entirely when there are no guests", () => {
    const msg = messageOf(buildWhatsAppNudgeUrl(GAME, ["Jan"], { ...snapshot, guests: 0 }));
    expect(msg).not.toContain("Guests");
  });

  it("lists the missing players as a sentence and closes with the link", () => {
    const msg = messageOf(buildWhatsAppNudgeUrl(GAME, ["Jan", "Piet", "Bram"], snapshot));
    expect(msg).toContain("Still waiting on Jan, Piet and Bram.");
    expect(msg).toContain("Confirm here:");
    expect(msg).toContain("game=42");
    expect(msg.trimEnd().endsWith("_— Attendance Bot 3000_")).toBe(true);
  });

  it("omits the when/where line and the names line when there is nothing to say", () => {
    const msg = messageOf(
      buildWhatsAppNudgeUrl({ ...GAME, game_date: null, game_time: null, location: "" }, [], snapshot)
    );
    expect(msg.split("\n")[1]).toBe("");
    expect(msg).not.toContain("Still waiting on");
    expect(msg).toContain("No reply 0");
  });
});

describe("buildWhatsAppMatchOpenUrl", () => {
  it("opens with the fixture and carries the squad rule instead of a tally", () => {
    const lines = messageOf(buildWhatsAppMatchOpenUrl(GAME)).split("\n");
    expect(lines[0]).toBe("*K. Caracrew SK vs Nova FC*");
    expect(lines[1]).toMatch(WHEN_WHERE);
    expect(lines.join("\n")).toContain("First 8 In play");
  });

  it("closes with the fixture link and the bot signature", () => {
    const msg = messageOf(buildWhatsAppMatchOpenUrl(GAME));
    expect(msg).toContain("Let us know here:");
    expect(msg).toContain("game=42");
    expect(msg.trimEnd().endsWith("_— Attendance Bot 3000_")).toBe(true);
  });

  it("has no tally to print, so it never mentions one", () => {
    const msg = messageOf(buildWhatsAppMatchOpenUrl(GAME));
    expect(msg).not.toContain("Roster");
    expect(msg).not.toContain("No reply");
  });
});

describe("buildWhatsAppStatsChaseUrl", () => {
  const PLAYED = { ...GAME, home_score: 4, away_score: 3 };
  const snapshot = { played: 8, recorded: 5, goalsRecorded: 3, goalsFinal: 4, freezeDays: 2 };

  it("leads with the fixture and its final score, then the stats tally", () => {
    const msg = messageOf(buildWhatsAppStatsChaseUrl(PLAYED, ["Jan"], snapshot));
    const lines = msg.split("\n");
    expect(lines[0]).toBe("*K. Caracrew SK vs Nova FC*");
    expect(lines[1]).toMatch(WHEN_WHERE);
    expect(msg).toContain("Final score 4 – 3");
    expect(msg).toContain("*Stats* · 5 of 8 recorded · 3 of 4 goals in");
  });

  it("lists who still owes stats as a sentence", () => {
    const msg = messageOf(buildWhatsAppStatsChaseUrl(PLAYED, ["Jan", "Piet", "Bram"], snapshot));
    expect(msg).toContain("Still to add: Jan, Piet and Bram.");
    expect(msg).toContain("Add yours here:");
    expect(msg).toContain("game=42");
    expect(msg.trimEnd().endsWith("_— Attendance Bot 3000_")).toBe(true);
  });

  it("drops the goals clause when the final score is not in yet", () => {
    const msg = messageOf(
      buildWhatsAppStatsChaseUrl(GAME, ["Jan"], { ...snapshot, goalsFinal: null })
    );
    expect(msg).toContain("*Stats* · 5 of 8 recorded");
    expect(msg).not.toContain("goals in");
  });

  it("changes the ask once the window has closed rather than pointing at dead inputs", () => {
    const open = messageOf(buildWhatsAppStatsChaseUrl(PLAYED, ["Jan"], snapshot));
    expect(open).toContain("Stats lock 2 days after the match.");
    const shut = messageOf(
      buildWhatsAppStatsChaseUrl(PLAYED, ["Jan"], { ...snapshot, frozen: true })
    );
    expect(shut).toContain("Stats are locked now");
    expect(shut).not.toContain("Stats lock 2 days");
  });

  it("still sends a usable message when nobody is named", () => {
    const msg = messageOf(buildWhatsAppStatsChaseUrl(PLAYED, [], snapshot));
    expect(msg).not.toContain("Still to add:");
    expect(msg).toContain("*Stats* · 5 of 8 recorded");
  });
});
