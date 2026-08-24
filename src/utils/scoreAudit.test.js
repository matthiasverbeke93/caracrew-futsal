import { describe, expect, it } from "vitest";
import {
  auditGameScore,
  auditGameScores,
  parseScoreFromTitle,
  suggestedScoreFix,
} from "./scoreAudit.js";

/**
 * Every title from the real 25-26 season (public/fixtures-2526.ics), with our goals first —
 * i.e. what `home_score` / `away_score` should hold. This is the data the original audit ran
 * against by hand, so a parser that agrees with all of it is doing the same job in code.
 */
const REAL_2526 = [
  ["K Caracrew SK 6 - 4 De Karpervissers", 6, 4],
  ["ZVC Tigers 10 - 1 K Caracrew SK", 1, 10],
  ["04United 7 - 4 K Caracrew SK", 4, 7],
  ["K Caracrew SK 2 - 2 ZVC Tigers", 2, 2],
  ["Futsal Opsinjoor 10 - 1 K Caracrew SK", 1, 10],
  ["K Caracrew SK 1 - 8 FC Tzit Ni Mee", 1, 8],
  ["K Caracrew SK 1 - 11 Hattrick", 1, 11],
  ["K Caracrew SK 5 - 4 04United", 5, 4],
  ["K Caracrew SK 2 - 5 VV Schemerboyz", 2, 5],
  ["VV Schemerboyz 2 - 11 K Caracrew SK", 11, 2],
  ["K Caracrew SK 3 - 3 Wille ma ni kunne", 3, 3],
  ["Hattrick 7 - 5 K Caracrew SK", 5, 7],
  ["K Caracrew SK 3 - 6 FC Tripel", 3, 6],
  ["Los Dollos 5 - 2 K Caracrew SK", 2, 5],
  ["Wille ma ni kunne 6 - 3 K Caracrew SK", 3, 6],
  ["FC De Planeet 9 - 4 K Caracrew SK", 4, 9],
  ["De Karpervissers 3 - 6 K Caracrew SK", 6, 3],
  ["FC Tzit Ni Mee 16 - 0 K Caracrew SK", 0, 16],
  ["K Caracrew SK 1 - 3 Los Dollos", 1, 3],
  ["FC Tripel 3 - 1 K Caracrew SK", 1, 3],
  ["K Caracrew SK 2 - 9 FC De Planeet", 2, 9],
];

describe("parseScoreFromTitle", () => {
  it.each(REAL_2526)("reads %s as %i-%i for us", (title, ourGoals, theirGoals) => {
    expect(parseScoreFromTitle(title)).toMatchObject({
      status: "scored",
      ourGoals,
      theirGoals,
    });
  });

  it("keeps a team name that starts with digits intact", () => {
    expect(parseScoreFromTitle("04United 7 - 4 K Caracrew SK")).toMatchObject({
      opponent: "04United",
      weWereHome: false,
    });
    expect(parseScoreFromTitle("K Caracrew SK 5 - 4 04United")).toMatchObject({
      opponent: "04United",
      weWereHome: true,
    });
  });

  it("keeps a team name with a number in it intact", () => {
    expect(parseScoreFromTitle("VT 09 3 - 2 K. Caracrew SK")).toMatchObject({
      status: "scored",
      ourGoals: 2,
      theirGoals: 3,
      opponent: "VT 09",
    });
  });

  it("recovers home/away, which the score columns do not store", () => {
    expect(parseScoreFromTitle("K Caracrew SK 6 - 4 De Karpervissers").weWereHome).toBe(true);
    expect(parseScoreFromTitle("De Karpervissers 3 - 6 K Caracrew SK").weWereHome).toBe(false);
  });

  it("handles both spellings of the team name", () => {
    expect(parseScoreFromTitle("K. Caracrew SK 2 - 1 VT 09").ourGoals).toBe(2);
    expect(parseScoreFromTitle("K Caracrew SK 2 - 1 VT 09").ourGoals).toBe(2);
  });

  it("accepts an en dash or em dash as the separator", () => {
    expect(parseScoreFromTitle("K Caracrew SK 4 – 2 FC Tripel").ourGoals).toBe(4);
    expect(parseScoreFromTitle("K Caracrew SK 4 — 2 FC Tripel").ourGoals).toBe(4);
  });

  it("reports an unplayed fixture title as unscored, not as a problem", () => {
    expect(parseScoreFromTitle("VT 09 vs K. Caracrew SK").status).toBe("unscored");
    // The one real 25-26 title with no score in it.
    expect(parseScoreFromTitle("K Caracrew SK - Futsal Opsinjoor").status).toBe("unscored");
  });

  it("is unscored for empty input rather than throwing", () => {
    expect(parseScoreFromTitle("").status).toBe("unscored");
    expect(parseScoreFromTitle(null).status).toBe("unscored");
    expect(parseScoreFromTitle(undefined).status).toBe("unscored");
  });

  it("refuses to guess when neither side is us", () => {
    expect(parseScoreFromTitle("Hattrick 3 - 2 Los Dollos").status).toBe("ambiguous");
  });

  it("refuses to guess when both sides look like us", () => {
    expect(parseScoreFromTitle("K Caracrew SK 3 - 2 Caracrew B").status).toBe("ambiguous");
  });
});

describe("auditGameScore", () => {
  const tigers = {
    id: "2526-2025-10-14-2100-zvc-tigers",
    season_slug: "2526",
    game_date: "2025-10-14",
    title: "ZVC Tigers 10 - 1 K Caracrew SK",
  };

  it("catches the real 2025-10-14 inversion", () => {
    const issue = auditGameScore({ ...tigers, home_score: 10, away_score: 1 });
    expect(issue).toMatchObject({
      kind: "inverted",
      gameId: tigers.id,
      stored: { ourGoals: 10, theirGoals: 1 },
      fromTitle: { ourGoals: 1, theirGoals: 10 },
    });
  });

  it("passes that row once it is fixed", () => {
    expect(auditGameScore({ ...tigers, home_score: 1, away_score: 10 })).toBeNull();
  });

  it("passes every other real 25-26 row", () => {
    for (const [title, ourGoals, theirGoals] of REAL_2526) {
      const game = { id: title, title, home_score: ourGoals, away_score: theirGoals };
      expect(auditGameScore(game)).toBeNull();
    }
  });

  it("calls a non-swap disagreement a mismatch, not an inversion", () => {
    const issue = auditGameScore({ ...tigers, home_score: 4, away_score: 2 });
    expect(issue.kind).toBe("mismatch");
  });

  it("never calls a draw inverted", () => {
    const issue = auditGameScore({
      id: "g",
      title: "K Caracrew SK 3 - 3 Wille ma ni kunne",
      home_score: 2,
      away_score: 2,
    });
    expect(issue.kind).toBe("mismatch");
  });

  it("flags a score the title records but the row never stored", () => {
    const issue = auditGameScore({ ...tigers, home_score: null, away_score: null });
    expect(issue).toMatchObject({ kind: "missing", fromTitle: { ourGoals: 1, theirGoals: 10 } });
  });

  it("flags a stored score no title can check", () => {
    const issue = auditGameScore({
      id: "g",
      title: "K Caracrew SK - Futsal Opsinjoor",
      home_score: 3,
      away_score: 2,
    });
    expect(issue).toMatchObject({ kind: "unverified", fromTitle: null });
  });

  it("says nothing about an ordinary upcoming fixture", () => {
    expect(
      auditGameScore({
        id: "g",
        title: "VT 09 vs K. Caracrew SK",
        home_score: null,
        away_score: null,
      })
    ).toBeNull();
  });

  it("treats a half-entered score as unstored rather than comparing against null", () => {
    expect(auditGameScore({ ...tigers, home_score: 1, away_score: null }).kind).toBe("missing");
  });

  it("does not count 0-0 as a missing score", () => {
    expect(
      auditGameScore({
        id: "g",
        title: "K Caracrew SK 0 - 0 VT 09",
        home_score: 0,
        away_score: 0,
      })
    ).toBeNull();
  });

  it("handles a null game", () => {
    expect(auditGameScore(null)).toBeNull();
  });
});

describe("auditGameScores", () => {
  const games = [
    { id: "ok", title: "K Caracrew SK 2 - 1 VT 09", home_score: 2, away_score: 1 },
    {
      id: "unverified",
      game_date: "2025-01-01",
      title: "K Caracrew SK - Futsal Opsinjoor",
      home_score: 3,
      away_score: 2,
    },
    {
      id: "inverted",
      game_date: "2025-02-01",
      title: "ZVC Tigers 10 - 1 K Caracrew SK",
      home_score: 10,
      away_score: 1,
    },
    {
      id: "missing",
      game_date: "2025-03-01",
      title: "Hattrick 7 - 5 K Caracrew SK",
      home_score: null,
      away_score: null,
    },
    {
      id: "mismatch",
      game_date: "2025-04-01",
      title: "K Caracrew SK 3 - 6 FC Tripel",
      home_score: 9,
      away_score: 9,
    },
  ];

  it("reports worst first and drops the healthy rows", () => {
    expect(auditGameScores(games).map((i) => i.gameId)).toEqual([
      "inverted",
      "mismatch",
      "missing",
      "unverified",
    ]);
  });

  it("breaks ties by newest fixture first", () => {
    const older = {
      id: "a",
      game_date: "2025-01-01",
      title: "ZVC Tigers 2 - 1 K Caracrew SK",
      home_score: 2,
      away_score: 1,
    };
    const newer = {
      id: "b",
      game_date: "2025-12-01",
      title: "ZVC Tigers 4 - 3 K Caracrew SK",
      home_score: 4,
      away_score: 3,
    };
    expect(auditGameScores([older, newer]).map((i) => i.gameId)).toEqual(["b", "a"]);
  });

  it("survives an empty or missing list", () => {
    expect(auditGameScores([])).toEqual([]);
    expect(auditGameScores(null)).toEqual([]);
  });

  it("spans seasons, since the real bug was in a season the app no longer defaults to", () => {
    const issues = auditGameScores([
      {
        id: "old",
        season_slug: "2526",
        title: "ZVC Tigers 10 - 1 K Caracrew SK",
        home_score: 10,
        away_score: 1,
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].seasonSlug).toBe("2526");
  });
});

describe("suggestedScoreFix", () => {
  it("writes the update that makes an inverted row agree with its title", () => {
    const issue = auditGameScore({
      id: "2526-2025-10-14-2100-zvc-tigers",
      title: "ZVC Tigers 10 - 1 K Caracrew SK",
      home_score: 10,
      away_score: 1,
    });
    expect(suggestedScoreFix(issue)).toBe(
      "update games set home_score = 1, away_score = 10 where id = '2526-2025-10-14-2100-zvc-tigers';"
    );
  });

  it("offers no fix for a disagreement only a human can settle", () => {
    const issue = auditGameScore({
      id: "g",
      title: "K Caracrew SK 3 - 6 FC Tripel",
      home_score: 9,
      away_score: 9,
    });
    expect(suggestedScoreFix(issue)).toBeNull();
  });

  it("offers no fix when the title proves nothing", () => {
    const issue = auditGameScore({
      id: "g",
      title: "K Caracrew SK - Futsal Opsinjoor",
      home_score: 3,
      away_score: 2,
    });
    expect(suggestedScoreFix(issue)).toBeNull();
  });
});
