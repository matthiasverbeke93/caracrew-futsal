#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const LZV_URL =
  process.env.LZV_TEAM_URL || "https://www.lzvcup.be/teams/overview/742";

const modUrl = pathToFileURL(
  new URL("./sync-lzv.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:")
).href;

const mod = await import("./sync-lzv.mjs").catch(async () => {
  const src = await readFile(new URL("./sync-lzv.mjs", import.meta.url), "utf8");
  throw new Error("Could not import sync-lzv.mjs:\n" + src.slice(0, 200));
});

const { parseMatches } = mod;
if (typeof parseMatches !== "function") {
  console.error("parseMatches is not exported from sync-lzv.mjs");
  process.exit(1);
}

console.log(`Fetching ${LZV_URL} ...`);
const res = await fetch(LZV_URL, {
  headers: {
    "User-Agent": "caracrew-sync-dryrun/1.0",
    Accept: "text/html",
    "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
  },
});
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const html = await res.text();
const matches = parseMatches(html);
console.log(`Parsed ${matches.length} played Caracrew matches:`);
for (const m of matches) {
  console.log(
    `  ${m.date}  vs ${m.opponentRaw.padEnd(28)} ${m.home_score}-${m.away_score}  @ ${m.venue || ""}`
  );
}
