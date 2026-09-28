const SCORE_TAIL = /\s+\d+\s*[-–—]\s*\d+\b.*$/;
const OUR_TEAM_TAIL = /\s+(k\s+)?caracrew(\s+sk)?\s*$/i;
// Our own name on its own is not a "tail": stripping it would leave just "K".
const OUR_TEAM_ONLY = /^(k\.?\s+)?caracrew(\s+sk)?$/i;

export function cleanOpponentName(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(SCORE_TAIL, "");
  if (OUR_TEAM_ONLY.test(s)) return s;
  s = s.replace(OUR_TEAM_TAIL, "");
  return s.trim();
}
