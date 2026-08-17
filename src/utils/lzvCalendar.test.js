import { describe, expect, it } from "vitest";
import {
  buildInsertSql,
  isHomeFromTitle,
  parseDtStart,
  parseIcs,
  slugifyOpponent,
  splitSummary,
  toGameRows,
  unescapeIcsText,
  unfoldIcs,
} from "./lzvCalendar.js";

/** Build a feed the way LZV's generator does: CRLF, VCALENDAR wrapper. */
function feed(...events) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LZV Cup//www.lzvcup.be//NL",
    "X-WR-CALNAME:LZVCup - K Caracrew SK",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function event({ summary, dtstart, location, uid = "x@lzvcup.be" }) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    `DTSTART${dtstart}`,
    ...(location ? [`LOCATION:${location}`] : []),
    "END:VEVENT",
  ].join("\r\n");
}

describe("unfoldIcs", () => {
  it("joins continuation lines that start with a space or tab", () => {
    expect(unfoldIcs("SUMMARY:K Caracrew\r\n  SK vs Foo")).toBe("SUMMARY:K Caracrew SK vs Foo");
    expect(unfoldIcs("A:1\n\tB")).toBe("A:1B");
  });

  it("leaves ordinary newlines alone", () => {
    expect(unfoldIcs("A:1\r\nB:2")).toBe("A:1\r\nB:2");
  });
});

describe("unescapeIcsText", () => {
  it("undoes RFC-5545 escaping", () => {
    expect(unescapeIcsText("De Nekker\\, Mechelen")).toBe("De Nekker, Mechelen");
    expect(unescapeIcsText("a\\nb")).toBe("a\nb");
    expect(unescapeIcsText("a\\;b")).toBe("a;b");
  });
});

describe("parseDtStart", () => {
  it("takes a TZID wall-clock time as-is", () => {
    expect(
      parseDtStart({ value: "20260910T210000", params: { TZID: "Europe/Brussels" } })
    ).toMatchObject({ date: "2026-09-10", time: "21:00:00" });
  });

  it("converts a UTC instant to Brussels, honouring summer time", () => {
    // 19:00Z in September is CEST (+2) -> 21:00 local.
    expect(parseDtStart({ value: "20260910T190000Z", params: {} })).toMatchObject({
      date: "2026-09-10",
      time: "21:00:00",
    });
  });

  it("converts a UTC instant correctly in winter too (+1)", () => {
    // 20:00Z in January is CET (+1) -> 21:00 local.
    expect(parseDtStart({ value: "20270114T200000Z", params: {} })).toMatchObject({
      date: "2027-01-14",
      time: "21:00:00",
    });
  });

  it("crossing midnight in UTC still lands on the right local day", () => {
    // 23:30Z on 2026-09-10 is 01:30 on 2026-09-11 in Brussels.
    expect(parseDtStart({ value: "20260910T233000Z", params: {} })).toMatchObject({
      date: "2026-09-11",
      time: "01:30:00",
    });
  });

  it("handles an all-day VALUE=DATE form with no time", () => {
    expect(parseDtStart({ value: "20260910", params: { VALUE: "DATE" } })).toEqual({
      date: "2026-09-10",
      time: null,
    });
  });

  it("returns null for junk or a missing property", () => {
    expect(parseDtStart(null)).toBeNull();
    expect(parseDtStart({ value: "not-a-date", params: {} })).toBeNull();
  });
});

describe("splitSummary", () => {
  it("accepts each separator LZV might plausibly use", () => {
    for (const sep of [" - ", " vs ", " vs. ", " – ", " v "]) {
      expect(splitSummary(`Home FC${sep}Away FC`)).toMatchObject({ left: "Home FC", right: "Away FC" });
    }
  });

  it("does not split on hyphens inside place names", () => {
    // "St-Katelijne-Waver" has no space-padded hyphen, so the only split is the real separator.
    expect(splitSummary("ZVC St-Katelijne-Waver vs K Caracrew SK")).toMatchObject({
      left: "ZVC St-Katelijne-Waver",
      right: "K Caracrew SK",
    });
  });

  it("returns null when nothing matches", () => {
    expect(splitSummary("Caracrew match")).toBeNull();
    expect(splitSummary("")).toBeNull();
  });
});

describe("slugifyOpponent", () => {
  it("mirrors the existing 25-26 id convention", () => {
    expect(slugifyOpponent("De Karpervissers")).toBe("de-karpervissers");
    expect(slugifyOpponent("ZVC Tigers")).toBe("zvc-tigers");
    expect(slugifyOpponent("04United")).toBe("04united");
    expect(slugifyOpponent("FC Tzit Ni Mee")).toBe("fc-tzit-ni-mee");
  });

  it("strips accents and punctuation rather than emitting them", () => {
    expect(slugifyOpponent("Café Olé")).toBe("cafe-ole");
    expect(slugifyOpponent("F.C. Foo!")).toBe("f-c-foo");
  });
});

describe("isHomeFromTitle", () => {
  it("reads the ' vs ' form both ways", () => {
    expect(isHomeFromTitle("K. Caracrew SK vs Hattrick")).toBe(true);
    expect(isHomeFromTitle("Hattrick vs K. Caracrew SK")).toBe(false);
  });

  it("reads the score form both ways (the shape sync-lzv leaves behind)", () => {
    expect(isHomeFromTitle("K Caracrew SK 6 - 4 De Karpervissers")).toBe(true);
    expect(isHomeFromTitle("ZVC Tigers 10 - 1 K Caracrew SK")).toBe(false);
  });

  it("reads a plain ' - ' separator both ways — the regression this replaced", () => {
    // The old implementation found no separator, fell back to testing the whole string, and so
    // reported BOTH of these as home. The away one was silently wrong in subscribers' calendars.
    expect(isHomeFromTitle("K Caracrew SK - Futsal Opsinjoor")).toBe(true);
    expect(isHomeFromTitle("Futsal Opsinjoor - K Caracrew SK")).toBe(false);
  });

  it("returns null instead of guessing when the title is unusable", () => {
    expect(isHomeFromTitle("")).toBeNull();
    expect(isHomeFromTitle(null)).toBeNull();
    expect(isHomeFromTitle("Caracrew speeldag 1")).toBeNull(); // no separator at all
    expect(isHomeFromTitle("K Caracrew SK vs Caracrew B")).toBeNull(); // ambiguous, both sides
    expect(isHomeFromTitle("Hattrick vs Los Dollos")).toBeNull(); // neither side is us
  });

  it("agrees with the home/away that toGameRows wrote into the title", () => {
    const events = parseIcs(
      feed(
        event({ summary: "K Caracrew SK - Hattrick", dtstart: ";TZID=Europe/Brussels:20260910T210000" }),
        event({
          summary: "Hattrick - K Caracrew SK",
          dtstart: ";TZID=Europe/Brussels:20270114T210000",
          uid: "rt@lzvcup.be",
        })
      )
    );
    for (const row of toGameRows(events).rows) {
      expect(isHomeFromTitle(row.title)).toBe(row.is_home);
    }
  });
});

describe("toGameRows", () => {
  it("reads home/away from the SUMMARY order and writes it into title", () => {
    const events = parseIcs(
      feed(
        event({
          summary: "K Caracrew SK - Hattrick",
          dtstart: ";TZID=Europe/Brussels:20260910T210000",
          location: "De Nekker Mechelen",
        }),
        event({
          summary: "Los Dollos - K Caracrew SK",
          dtstart: ";TZID=Europe/Brussels:20260917T220000",
          location: "Sporthal Elders",
          uid: "y@lzvcup.be",
        })
      )
    );

    const { rows, problems } = toGameRows(events);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      id: "2627-2026-09-10-2100-hattrick",
      opponent: "Hattrick",
      game_date: "2026-09-10",
      game_time: "21:00:00",
      location: "De Nekker Mechelen",
      title: "K. Caracrew SK vs Hattrick",
      is_home: true,
    });

    expect(rows[1]).toMatchObject({
      id: "2627-2026-09-17-2200-los-dollos",
      opponent: "Los Dollos",
      title: "Los Dollos vs K. Caracrew SK",
      is_home: false,
    });
  });

  it("produces a title that isHomeGame() can read back", () => {
    // Mirrors scripts/gen-ics.mjs isHomeGame(): split on " vs " or a score, look for caracrew first.
    const isHomeGame = (title) => {
      const t = String(title || "").toLowerCase();
      const first = t.split(/\s+vs\s+|\s+\d+\s*[-–—]\s*\d+\s+/)[0] || "";
      return /caracrew/.test(first);
    };

    const events = parseIcs(
      feed(
        event({ summary: "K Caracrew SK - Hattrick", dtstart: ";TZID=Europe/Brussels:20260910T210000" }),
        event({
          summary: "Hattrick - K Caracrew SK",
          dtstart: ";TZID=Europe/Brussels:20270114T210000",
          uid: "z@lzvcup.be",
        })
      )
    );
    const { rows } = toGameRows(events);
    expect(isHomeGame(rows[0].title)).toBe(true);
    expect(isHomeGame(rows[1].title)).toBe(false);
  });

  it("sorts chronologically regardless of feed order", () => {
    const events = parseIcs(
      feed(
        event({ summary: "K Caracrew SK - Later", dtstart: ";TZID=Europe/Brussels:20270501T210000" }),
        event({
          summary: "K Caracrew SK - Earlier",
          dtstart: ";TZID=Europe/Brussels:20260910T210000",
          uid: "b@lzvcup.be",
        })
      )
    );
    const { rows } = toGameRows(events);
    expect(rows.map((r) => r.opponent)).toEqual(["Earlier", "Later"]);
  });

  it("flags an unrecognised SUMMARY instead of guessing", () => {
    const events = parseIcs(
      feed(event({ summary: "Caracrew speeldag 1", dtstart: ";TZID=Europe/Brussels:20260910T210000" }))
    );
    const { rows, problems } = toGameRows(events);
    expect(rows).toEqual([]);
    expect(problems[0].kind).toBe("unknown-summary-format");
  });

  it("flags a fixture that is not ours, and one where both sides look like us", () => {
    const notOurs = parseIcs(
      feed(event({ summary: "Hattrick - Los Dollos", dtstart: ";TZID=Europe/Brussels:20260910T210000" }))
    );
    expect(toGameRows(notOurs).problems[0].kind).toBe("our-team-absent");

    const both = parseIcs(
      feed(
        event({ summary: "K Caracrew SK - Caracrew B", dtstart: ";TZID=Europe/Brussels:20260910T210000" })
      )
    );
    expect(toGameRows(both).problems[0].kind).toBe("our-team-both-sides");
  });

  it("flags a foreign TZID rather than silently mis-timing the kickoff", () => {
    const events = parseIcs(
      feed(event({ summary: "K Caracrew SK - Hattrick", dtstart: ";TZID=America/New_York:20260910T210000" }))
    );
    const { rows, problems } = toGameRows(events);
    expect(rows).toEqual([]);
    expect(problems[0].kind).toBe("unexpected-tzid");
  });

  it("flags an all-day fixture unless a default time is supplied", () => {
    const events = parseIcs(
      feed(event({ summary: "K Caracrew SK - Hattrick", dtstart: ";VALUE=DATE:20260910" }))
    );
    expect(toGameRows(events).problems[0].kind).toBe("missing-time");

    const { rows, problems } = toGameRows(events, { defaultTime: "21:00:00" });
    expect(problems).toEqual([]);
    expect(rows[0].game_time).toBe("21:00:00");
  });

  it("flags two fixtures that would collide on one id", () => {
    const events = parseIcs(
      feed(
        event({ summary: "K Caracrew SK - Hattrick", dtstart: ";TZID=Europe/Brussels:20260910T210000" }),
        event({
          summary: "K Caracrew SK - Hattrick",
          dtstart: ";TZID=Europe/Brussels:20260910T210000",
          uid: "dup@lzvcup.be",
        })
      )
    );
    const { rows, problems } = toGameRows(events);
    expect(rows).toHaveLength(1);
    expect(problems[0].kind).toBe("duplicate-id");
  });

  it("survives folded lines and escaped commas in LOCATION", () => {
    const raw = feed(
      [
        "BEGIN:VEVENT",
        "UID:fold@lzvcup.be",
        "SUMMARY:K Caracrew SK - Hattrick",
        "DTSTART;TZID=Europe/Brussels:20260910T210000",
        "LOCATION:De Nekker\\, Nekkerspoel",
        " straat 21",
        "END:VEVENT",
      ].join("\r\n")
    );
    const { rows, problems } = toGameRows(parseIcs(raw));
    expect(problems).toEqual([]);
    expect(rows[0].location).toBe("De Nekker, Nekkerspoelstraat 21");
  });

  it("returns nothing for the empty feed LZV serves before publication", () => {
    const { rows, problems } = toGameRows(parseIcs(feed()));
    expect(rows).toEqual([]);
    expect(problems).toEqual([]);
  });
});

describe("buildInsertSql", () => {
  const rows = toGameRows(
    parseIcs(
      feed(
        event({
          summary: "K Caracrew SK - Hattrick",
          dtstart: ";TZID=Europe/Brussels:20260910T210000",
          location: "De Nekker Mechelen",
        })
      )
    )
  ).rows;

  it("emits an upsert whose update clause never assigns the scores", () => {
    const sql = buildInsertSql(rows);
    expect(sql).toContain("on conflict (id) do update set");
    // Inspect the assignment list itself — the surrounding comments legitimately name those columns.
    const updateClause = sql.split("on conflict (id) do update set")[1].split(";")[0];
    expect(updateClause).not.toMatch(/home_score/);
    expect(updateClause).not.toMatch(/away_score/);
    expect(updateClause).toMatch(/opponent\s*=\s*excluded\.opponent/);
  });

  it("never deletes existing rows, unlike the retired seed", () => {
    expect(buildInsertSql(rows)).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("escapes quotes in team names", () => {
    const sql = buildInsertSql([{ ...rows[0], opponent: "O'Leary FC", title: "O'Leary FC vs X" }]);
    expect(sql).toContain("'O''Leary FC'");
  });

  it("reports the home/away split in a comment so the count can be eyeballed", () => {
    expect(buildInsertSql(rows)).toContain("1 fixtures: 1 home, 0 away");
  });

  it("handles the no-rows case without emitting a broken statement", () => {
    expect(buildInsertSql([])).toBe("-- no rows\n");
  });
});
