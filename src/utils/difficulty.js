import { LEAGUE_STANDINGS, OUR_TEAM_NAME } from "../data/leagueStandings";
import { cleanOpponentName } from "./opponent";

function normalize(name) {
  return cleanOpponentName(name)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^k\.?\s+/, "k ")
    .trim();
}

export function getOpponentStanding(opponent) {
  const normalized = normalize(opponent);
  return LEAGUE_STANDINGS.find((team) => {
    const teamName = normalize(team.name);
    return teamName === normalized || teamName.includes(normalized) || normalized.includes(teamName);
  });
}

export function getOurStanding() {
  return LEAGUE_STANDINGS.find((team) => normalize(team.name) === normalize(OUR_TEAM_NAME));
}

function findStrengthRow(opponent, strengths) {
  if (!opponent || !strengths?.length) return null;
  const normalized = normalize(opponent);
  return (
    strengths.find((s) => normalize(s.name) === normalized) ||
    strengths.find((s) => {
      const n = normalize(s.name);
      return n.includes(normalized) || normalized.includes(n);
    }) ||
    null
  );
}

function levelFromPosition(position) {
  if (position == null) return null;
  if (position <= 3) return { level: 5, label: "Very hard", className: "diff-very-hard" };
  if (position <= 5) return { level: 4, label: "Hard", className: "diff-hard" };
  if (position <= 7) return { level: 3, label: "Medium", className: "diff-medium" };
  if (position <= 9) return { level: 2, label: "Easy", className: "diff-easy" };
  return { level: 1, label: "Very easy", className: "diff-very-easy" };
}

function shortenReeks(reeks) {
  return String(reeks || "")
    .replace(/Klasse\s+/i, "")
    .replace(/Mechelen$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summariseHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const last3 = [...history]
    .sort((a, b) => (b.season || "").localeCompare(a.season || ""))
    .slice(0, 3);

  const reeksSet = new Set(last3.map((s) => shortenReeks(s.reeks)));
  const sameReeks = reeksSet.size === 1 && [...reeksSet][0] !== "";
  const entries = last3.map((s) => {
    const seasonShort = `${s.season.slice(2, 4)}/${s.season.slice(-2)}`;
    if (sameReeks) return `${seasonShort} pos ${s.position}`;
    return `${seasonShort} ${shortenReeks(s.reeks)} pos ${s.position}`;
  });

  return {
    text: entries.join(" · "),
    reeksPrefix: sameReeks ? [...reeksSet][0] : null,
  };
}

/** Live-data difficulty using opponent_strength when available, falling back to LEAGUE_STANDINGS. */
export function getDifficulty(opponent, strengths) {
  const row = findStrengthRow(opponent, strengths);

  if (row && row.current_position != null) {
    const lvl = levelFromPosition(row.current_position);
    const summary = summariseHistory(row.history);
    const lastSeason = Array.isArray(row.history) && row.history.length > 0
      ? [...row.history].sort((a, b) => (b.season || "").localeCompare(a.season || ""))[0]
      : null;
    return {
      ...lvl,
      position: row.current_position,
      ptnPerMatch: row.current_ptn_per_match ?? null,
      teamName: row.name,
      strengthScore: row.strength_score ?? null,
      historyLine: summary?.text || null,
      historyReeksPrefix: summary?.reeksPrefix || null,
      lastSeason,
      source: "live",
    };
  }

  const team = getOpponentStanding(opponent);
  if (!team) return null;
  const lvl = levelFromPosition(team.position);
  return {
    ...lvl,
    position: team.position,
    ptnPerMatch: team.ptnPerMatch,
    teamName: team.name,
    strengthScore: null,
    historyLine: null,
    historyReeksPrefix: null,
    lastSeason: null,
    source: "static",
  };
}
