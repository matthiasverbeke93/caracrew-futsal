import { isPlayed } from "./game.js";
import { cleanOpponentName } from "./opponent.js";

function normalizeOpponent(name) {
  return cleanOpponentName(name)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameOpponent(a, b) {
  return normalizeOpponent(a) === normalizeOpponent(b);
}

export function getHeadToHeadSummary(games, opponentName) {
  if (!opponentName || !games?.length) return null;

  const playedVs = games
    .filter((g) => isPlayed(g) && sameOpponent(g.opponent, opponentName))
    .sort((a, b) => (a.game_date || "").localeCompare(b.game_date || ""));

  if (!playedVs.length) return null;

  const last = playedVs[playedVs.length - 1];
  const lastOur = last.home_score;
  const lastTheir = last.away_score;
  const lastLine =
    lastOur != null && lastTheir != null
      ? (() => {
          const w = lastOur > lastTheir;
          const l = lastOur < lastTheir;
          return `Last meeting: ${lastOur}–${lastTheir} ${w ? "W" : l ? "L" : "D"}`;
        })()
      : "Last meeting: score not set";

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const g of playedVs) {
    const us = g.home_score;
    const them = g.away_score;
    if (us == null || them == null) continue;
    if (us > them) wins++;
    else if (us < them) losses++;
    else draws++;
  }

  const withScores = playedVs.filter((g) => g.home_score != null && g.away_score != null).length;

  let seasonLine = null;
  if (withScores >= 2) {
    seasonLine = `Season vs them: ${wins}W-${draws}D-${losses}L (${withScores} played)`;
  } else if (withScores === 0 && playedVs.length > 0) {
    seasonLine = "This season: set final scores on played games to see record";
  }

  return { lastLine, seasonLine, gamesPlayed: playedVs.length };
}
