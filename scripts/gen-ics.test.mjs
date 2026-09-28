import { describe, expect, it } from "vitest";
import { buildCalendar, countEvents, emptyFeedRefusal, fold, localDT } from "./gen-ics.mjs";

const octets = (s) => Buffer.byteLength(s, "utf8");

describe("fold — RFC 5545 line folding", () => {
  it("leaves a line of exactly 75 octets alone", () => {
    const line = "D".repeat(75);
    expect(fold(line)).toBe(line);
  });

  it("keeps every physical line at 75 octets or fewer with multi-byte characters", () => {
    // "—" is 3 bytes, "·" is 2: 60 of them would pass a UTF-16 length check far too late.
    const line = `DESCRIPTION:${"—·".repeat(60)}`;
    const physical = fold(line).split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const l of physical) expect(octets(l)).toBeLessThanOrEqual(75);
    for (const l of physical.slice(1)) expect(l.startsWith(" ")).toBe(true);
  });

  it("never splits a code point, and unfolds back to the original", () => {
    const line = `LOCATION:${"⚽".repeat(40)}`; // 4-byte emoji, a surrogate pair in UTF-16
    const folded = fold(line);
    expect(folded).not.toMatch(/�/);
    for (const l of folded.split("\r\n")) {
      expect(Buffer.from(l, "utf8").toString("utf8")).toBe(l);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("localDT", () => {
  it("formats a plain kickoff", () => {
    expect(localDT("2026-10-14", "21:00:00")).toBe("20261014T210000");
  });

  it("rolls a late end time over the month", () => {
    expect(localDT("2026-10-31", "23:30:00", 1)).toBe("20261101T003000");
  });

  it("rolls over the year", () => {
    expect(localDT("2026-12-31", "23:00:00", 1)).toBe("20270101T000000");
  });

  it("defaults a missing time to 20:00", () => {
    expect(localDT("2026-09-06", null)).toBe("20260906T200000");
  });
});

describe("emptyFeedRefusal", () => {
  const feed = (n) =>
    ["BEGIN:VCALENDAR", ...Array.from({ length: n }, () => "BEGIN:VEVENT\r\nEND:VEVENT"), "END:VCALENDAR"].join(
      "\r\n"
    );

  it("counts events in a CRLF feed", () => {
    expect(countEvents(feed(3))).toBe(3);
  });

  it("refuses to replace a feed that had events with an empty one", () => {
    expect(emptyFeedRefusal(feed(22), 0)).toMatch(/22 event/);
  });

  it("allows it with the explicit override", () => {
    expect(emptyFeedRefusal(feed(22), 0, true)).toBeNull();
  });

  it("allows an empty feed when the previous one was empty or missing", () => {
    expect(emptyFeedRefusal(feed(0), 0)).toBeNull();
    expect(emptyFeedRefusal("", 0)).toBeNull();
  });

  it("allows any non-empty feed", () => {
    expect(emptyFeedRefusal(feed(22), 5)).toBeNull();
  });
});

describe("buildCalendar output", () => {
  it("folds every physical line to 75 octets (fold must not receive map's index as its limit)", () => {
    const games = Array.from({ length: 12 }, (_, i) => ({
      id: `2627-2026-10-${String(i + 1).padStart(2, "0")}-2100-opp`,
      season_slug: "2627",
      game_date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      game_time: "21:00:00",
      title: "K. Caracrew SK - Some Very Long Opponent Name",
      location: "Sporthal Heiveld — St-Katelijne-Waver, a long venue string",
    }));
    const { ics } = buildCalendar("2627", games, [], null, new Date("2026-09-28T10:00:00Z"));
    expect(countEvents(ics)).toBe(12);
    for (const physical of ics.split("\r\n")) {
      expect(octets(physical)).toBeLessThanOrEqual(75);
    }
  });
});
