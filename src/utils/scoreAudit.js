/**
 * Cross-check every stored final score against the fixture `title`.
 *
 * Why this exists: on 2025-10-14 the ZVC Tigers row stored `10-1` while its own title read
 * `ZVC Tigers 10 - 1 K Caracrew SK` — a 1-10 defeat counted as a 10-1 win. That is 3 phantom
 * league points and an 18-goal swing in the record card, the projected table and win%, and it
 * survived until somebody hand-audited all 22 rows. The title is a second, independent record
 * of the same result, so the disagreement was detectable from day one.
 *
 * Conventions this relies on (both verified against the live data):
 * - `games.home_score` is **our** goals and `away_score` is the opponent's, whichever side we
 *   actually played on. It is not "the home team's score".
 * - `title` names the teams in LZV's order — real home side first — as
 *   `<A> <goals> - <goals> <B>` once a result exists, or `<A> vs <B>` / `<A> - <B>` before then.
 *   So the title, unlike the columns, does encode who was at home.
 */

/** `<left> <h> - <a> <right>`; non-greedy left so a team whose name starts with digits ("04United") is safe. */
const TITLE_SCORE_RE = /^(.*?)\s(\d+)\s*[-–—]\s*(\d+)\s(.*)$/;

function isUs(side) {
  return /caracrew/i.test(side || "");
}

/**
 * Read the result out of a fixture title.
 *
 * @returns {{status: "scored", ourGoals: number, theirGoals: number, opponent: string, weWereHome: boolean}
 *          | {status: "unscored" | "ambiguous"}}
 *   `unscored` = the title carries no result (a fixture not yet played, or one of the older
 *   `Team - Team` titles). `ambiguous` = a result is there but the sides cannot be told apart,
 *   so it proves nothing either way. Neither is a defect on its own.
 */
export function parseScoreFromTitle(title) {
  const m = TITLE_SCORE_RE.exec(String(title || "").trim());
  if (!m) return { status: "unscored" };

  const [, left, leftGoals, rightGoals, right] = m;
  const leftIsUs = isUs(left);
  const rightIsUs = isUs(right);
  // Neither side is us, or a bad parse split our own name across both — either way, undecidable.
  if (leftIsUs === rightIsUs) return { status: "ambiguous" };

  return {
    status: "scored",
    ourGoals: Number(leftIsUs ? leftGoals : rightGoals),
    theirGoals: Number(leftIsUs ? rightGoals : leftGoals),
    opponent: (leftIsUs ? right : left).trim(),
    weWereHome: leftIsUs,
  };
}

/**
 * Compare one game's stored score with its title.
 *
 * @returns {null} when the two agree, or when the title simply cannot say anything.
 *   Otherwise an issue: `kind` is
 *   - `inverted`   — swapping `home_score`/`away_score` would match the title. The 2025-10-14
 *                    failure, and the one with a one-line fix.
 *   - `mismatch`   — the two disagree in some other way; needs a human to decide which is right.
 *   - `unverified` — a score is stored but the title carries none, so nothing checks it.
 *   - `missing`    — the title carries a result the row never stored (the sync missed it).
 */
export function auditGameScore(game) {
  if (!game) return null;
  const parsed = parseScoreFromTitle(game.title);
  const stored = game.home_score;
  const storedAgainst = game.away_score;
  const hasStored = stored != null && storedAgainst != null;

  if (parsed.status !== "scored") {
    if (!hasStored) return null; // no result anywhere yet — an ordinary upcoming fixture
    return {
      gameId: game.id,
      kind: "unverified",
      seasonSlug: game.season_slug ?? null,
      gameDate: game.game_date ?? null,
      title: game.title ?? "",
      stored: { ourGoals: stored, theirGoals: storedAgainst },
      fromTitle: null,
    };
  }

  const fromTitle = { ourGoals: parsed.ourGoals, theirGoals: parsed.theirGoals };

  if (!hasStored) {
    return {
      gameId: game.id,
      kind: "missing",
      seasonSlug: game.season_slug ?? null,
      gameDate: game.game_date ?? null,
      title: game.title ?? "",
      stored: null,
      fromTitle,
    };
  }

  if (stored === parsed.ourGoals && storedAgainst === parsed.theirGoals) return null;

  // A draw can never be "inverted" — swapping 3-3 changes nothing — so an inverted verdict
  // always implies a genuine disagreement.
  const inverted = stored === parsed.theirGoals && storedAgainst === parsed.ourGoals;

  return {
    gameId: game.id,
    kind: inverted ? "inverted" : "mismatch",
    seasonSlug: game.season_slug ?? null,
    gameDate: game.game_date ?? null,
    title: game.title ?? "",
    stored: { ourGoals: stored, theirGoals: storedAgainst },
    fromTitle,
  };
}

/** Severity order — what an admin should look at first. */
const KIND_RANK = { inverted: 0, mismatch: 1, missing: 2, unverified: 3 };

/**
 * Audit a whole season (or every season at once — the ZVC Tigers row was in a season the app
 * was no longer defaulting to, which is exactly why this should not be season-scoped).
 *
 * @returns issues worst-first, then newest fixture first.
 */
export function auditGameScores(games) {
  return (games || [])
    .map(auditGameScore)
    .filter(Boolean)
    .sort((a, b) => {
      const rank = (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
      if (rank !== 0) return rank;
      return String(b.gameDate || "").localeCompare(String(a.gameDate || ""));
    });
}

/** The `update` an admin can paste into the SQL editor to make the row agree with its title. */
export function suggestedScoreFix(issue) {
  if (!issue?.fromTitle || (issue.kind !== "inverted" && issue.kind !== "missing")) return null;
  return (
    `update games set home_score = ${issue.fromTitle.ourGoals}, ` +
    `away_score = ${issue.fromTitle.theirGoals} where id = '${issue.gameId}';`
  );
}
