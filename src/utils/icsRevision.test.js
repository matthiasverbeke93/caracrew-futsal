import { describe, expect, it } from "vitest";
import { eventBody, icsUtcStamp, parseIcsRevisions, reviseEvents } from "./icsRevision.js";

const T1 = new Date("2026-09-04T12:00:00Z");
const T2 = new Date("2026-09-05T08:30:00Z");

function event(overrides = {}) {
  return {
    uid: "2627-2026-09-06-2100-vt-09@caracrew.org",
    lines: [
      "DTSTART;TZID=Europe/Brussels:20260906T210000",
      "SUMMARY:VT 09 vs K. Caracrew SK",
      "LOCATION:Winketkaai Mechelen",
    ],
    ...overrides,
  };
}

/** Render events the way gen-ics.mjs does, so a test can feed its own output back in. */
function render(revised) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0"];
  for (const e of revised) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${e.dtstamp}`,
      `SEQUENCE:${e.sequence}`,
      `LAST-MODIFIED:${e.dtstamp}`,
      ...e.lines,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

describe("icsUtcStamp", () => {
  it("formats an RFC 5545 UTC date-time", () => {
    expect(icsUtcStamp(T1)).toBe("20260904T120000Z");
  });
});

describe("eventBody", () => {
  it("ignores the generated fields and the UID, so only content decides a change", () => {
    const a = eventBody(["UID:x@y", "DTSTAMP:20260904T120000Z", "SEQUENCE:3", "SUMMARY:One"]);
    const b = eventBody(["UID:other@y", "DTSTAMP:20270101T000000Z", "SEQUENCE:9", "SUMMARY:One"]);
    expect(a).toBe(b);
  });

  it("still notices a real content change", () => {
    expect(eventBody(["SUMMARY:One"])).not.toBe(eventBody(["SUMMARY:Two"]));
  });
});

describe("reviseEvents", () => {
  it("starts a brand-new feed at SEQUENCE 0", () => {
    const [e] = reviseEvents([event()], "", T1);
    expect(e.sequence).toBe(0);
    expect(e.dtstamp).toBe("20260904T120000Z");
    expect(e.reason).toBe("new");
  });

  it("re-renders an unchanged fixture byte-for-byte, so a scheduled regen makes no diff", () => {
    const first = reviseEvents([event()], "", T1);
    const second = reviseEvents([event()], render(first), T2);
    expect(render(second)).toBe(render(first));
    expect(second[0].reason).toBe("unchanged");
  });

  it("bumps SEQUENCE and re-stamps when the kickoff moves", () => {
    const first = reviseEvents([event()], "", T1);
    const moved = event({ lines: ["DTSTART;TZID=Europe/Brussels:20260906T200000", "SUMMARY:VT 09 vs K. Caracrew SK", "LOCATION:IHAM Mechelen"] });
    const [e] = reviseEvents([moved], render(first), T2);
    expect(e.sequence).toBe(1);
    expect(e.dtstamp).toBe("20260905T083000Z");
    expect(e.reason).toBe("content");
  });

  it("keeps climbing across successive changes — SEQUENCE must never go down", () => {
    let feed = "";
    const sequences = [];
    for (const hall of ["Winketkaai Mechelen", "IHAM Mechelen", "De Nekker Mechelen", "Arena Walem"]) {
      const revised = reviseEvents([event({ lines: [`LOCATION:${hall}`] })], feed, T1);
      sequences.push(revised[0].sequence);
      feed = render(revised);
    }
    expect(sequences).toEqual([0, 1, 2, 3]);
  });

  it("gives an unseen UID SEQUENCE 0 without disturbing its neighbours", () => {
    const first = reviseEvents([event()], "", T1);
    const extra = event({ uid: "2627-2027-02-27-2030-fc-de-wandelgang@caracrew.org", lines: ["SUMMARY:FC De Wandelgang vs K. Caracrew SK"] });
    const second = reviseEvents([event(), extra], render(first), T2);
    expect(second.map((e) => e.sequence)).toEqual([0, 0]);
    expect(second[0].dtstamp).toBe(first[0].dtstamp); // untouched fixture keeps its stamp
    expect(second[1].dtstamp).toBe("20260905T083000Z");
  });

  it("bumps a pre-SEQUENCE feed to 1 rather than inheriting its future DTSTAMP", () => {
    // What the old generator wrote: no SEQUENCE, and a DTSTAMP set to the LATEST FIXTURE DATE.
    const legacy = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:2627-2026-09-06-2100-vt-09@caracrew.org",
      "DTSTAMP:20270509T000000Z",
      "DTSTART;TZID=Europe/Brussels:20260906T210000",
      "SUMMARY:VT 09 vs K. Caracrew SK",
      "LOCATION:Winketkaai Mechelen",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    // Sequence 1, not 0: RFC 5545 breaks an equal-SEQUENCE tie on DTSTAMP, and the legacy stamp
    // above is in the FUTURE — so re-publishing at 0 with an earlier stamp is what a strict client
    // would throw away. `reason` marks it as the one-off migration, not a real fixture change.
    const [e] = reviseEvents([event()], legacy, T1);
    expect(e.sequence).toBe(1);
    expect(e.reason).toBe("migrated");
    expect(e.dtstamp).toBe("20260904T120000Z");

    // ...and the run after that is stable again.
    const settled = reviseEvents([event()], render([e]), T2);
    expect(settled[0].sequence).toBe(1);
    expect(settled[0].reason).toBe("unchanged");
  });

  it("survives a folded previous feed", () => {
    const first = reviseEvents([event({ lines: ["DESCRIPTION:" + "x".repeat(200)] })], "", T1);
    const folded = render(first).replace(/(.{74})/, "$1\r\n ");
    const [e] = reviseEvents([event({ lines: ["DESCRIPTION:" + "x".repeat(200)] })], folded, T2);
    expect(e.sequence).toBe(0);
    expect(e.reason).toBe("unchanged"); // folding is presentation, not content
  });
});

describe("parseIcsRevisions", () => {
  it("reads back sequence, stamp and versioned-ness", () => {
    const revisions = parseIcsRevisions(render(reviseEvents([event()], "", T1)));
    const entry = revisions.get("2627-2026-09-06-2100-vt-09@caracrew.org");
    expect(entry.sequence).toBe(0);
    expect(entry.dtstamp).toBe("20260904T120000Z");
    expect(entry.versioned).toBe(true);
  });

  it("treats a missing or empty feed as no history", () => {
    expect(parseIcsRevisions("").size).toBe(0);
    expect(parseIcsRevisions(null).size).toBe(0);
  });

  it("skips an event with no UID rather than throwing", () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:orphan", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    expect(parseIcsRevisions(ics).size).toBe(0);
  });

  it("falls back to 0 for a non-numeric SEQUENCE", () => {
    const ics = ["BEGIN:VEVENT", "UID:a@b", "SEQUENCE:banana", "DTSTAMP:20260904T120000Z", "END:VEVENT"].join("\r\n");
    expect(parseIcsRevisions(ics).get("a@b").sequence).toBe(0);
  });
});
