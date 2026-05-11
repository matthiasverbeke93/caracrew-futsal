#!/usr/bin/env node
import {
  discoverOpponents,
  parseCurrentStandings,
  parseTeamPage,
} from "./sync-palmares.mjs";

const TEAM_OVERVIEW_URL =
  process.env.LZV_TEAM_URL || "https://www.lzvcup.be/teams/overview/742";
const OUR_TEAM_ID =
  process.env.LZV_OUR_TEAM_ID ||
  (TEAM_OVERVIEW_URL.match(/(\d+)$/) || [])[1] ||
  "742";

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "caracrew-palmares-dryrun/1.0",
      Accept: "text/html",
      "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
    },
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

console.log(`Discovering from ${TEAM_OVERVIEW_URL}`);
const overviewHtml = await fetchText(TEAM_OVERVIEW_URL);
const opponents = discoverOpponents(overviewHtml, OUR_TEAM_ID);
const standings = parseCurrentStandings(overviewHtml);
console.log(
  `Opponents discovered: ${opponents.length}; standings rows: ${standings.size}`
);
for (const o of opponents) {
  const s = standings.get(o.team_id);
  console.log(
    `  ${o.team_id}  ${o.name.padEnd(22)} pos=${s?.position ?? "-"} ptn/m=${s?.ptnPerMatch ?? "-"}`
  );
}

console.log("\nFetching palmares for each opponent (this takes a moment)...");
for (const opp of opponents.slice(0, 12)) {
  const html = await fetchText(`https://www.lzvcup.be/teams/detail/${opp.team_id}`);
  const parsed = parseTeamPage(html, opp.team_id);
  const s = standings.get(opp.team_id);
  console.log(
    `\n${opp.name} (id=${opp.team_id}) currentPos=${s?.position ?? "-"} ptn/m=${s?.ptnPerMatch ?? "-"}`
  );
  for (const h of parsed.history) {
    console.log(
      `  ${h.season} ${h.reeks} pos=${h.position} ${h.wins}W-${h.draws}D-${h.losses}L gd=${h.goals_for}-${h.goals_against}`
    );
  }
  await new Promise((r) => setTimeout(r, 300));
}
