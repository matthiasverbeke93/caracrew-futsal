const SCORE_TAIL = /\s+\d+\s*[-–—]\s*\d+\b.*$/;
const OUR_TEAM_TAIL = /\s+(k\s+)?caracrew(\s+sk)?\s*$/i;

export function cleanOpponentName(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(SCORE_TAIL, "");
  s = s.replace(OUR_TEAM_TAIL, "");
  return s.trim();
}
