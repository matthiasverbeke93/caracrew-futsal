import { LEAGUE_STANDINGS } from "./leagueStandings";

/** Manual LZV standings snapshot per season. Use `[]` until you paste the new table for 26-27. */
export const LEAGUE_STANDINGS_BY_SEASON = {
  "2526": LEAGUE_STANDINGS,
  "2627": [],
};

export function getLeagueStandingsForSeason(seasonSlug) {
  return LEAGUE_STANDINGS_BY_SEASON[seasonSlug] ?? [];
}
