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

// Difficulty is derived from the opponent's league position relative to ours.
// Higher score = harder match. 1 = very easy, 5 = very hard.
export function getDifficulty(opponent) {
  const team = getOpponentStanding(opponent);
  if (!team) return null;

  let level;
  let label;
  let className;

  if (team.position <= 3) {
    level = 5;
    label = "Very hard";
    className = "diff-very-hard";
  } else if (team.position <= 5) {
    level = 4;
    label = "Hard";
    className = "diff-hard";
  } else if (team.position <= 7) {
    level = 3;
    label = "Medium";
    className = "diff-medium";
  } else if (team.position <= 9) {
    level = 2;
    label = "Easy";
    className = "diff-easy";
  } else {
    level = 1;
    label = "Very easy";
    className = "diff-very-easy";
  }

  return {
    level,
    label,
    className,
    position: team.position,
    ptnPerMatch: team.ptnPerMatch,
    teamName: team.name,
  };
}
