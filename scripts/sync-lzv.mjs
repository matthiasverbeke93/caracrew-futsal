#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SEASON_SLUG } from "../src/seasons.js";

const LZV_URL =
  process.env.LZV_TEAM_URL || "https://www.lzvcup.be/teams/overview/742";

const SEASON_SLUG = process.env.LZV_SEASON_SLUG || DEFAULT_SEASON_SLUG;

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(li|p|div|tr|td|th|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isoDate(belgian) {
  const [dd, mm, yyyy] = belgian.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function normalize(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^k\.?\s+/, "k ")
    .trim();
}

function stripOurTeamSuffix(name) {
  return normalize(name).replace(/\s*(k\s+)?caracrew(\s+sk)?\s*$/i, "").trim();
}

function cleanOpponent(rawOpponent) {
  const s = normalize(rawOpponent)
    .replace(/\s+\d+\s*[-–—]\s*\d+\b.*$/, "")
    .trim();
  return stripOurTeamSuffix(s) || s;
}

function isOurTeam(name) {
  return /caracrew/i.test(name);
}

export function parseMatches(html) {
  const text = stripTags(html);
  const lines = text
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(/(\d{2}\/\d{2}\/\d{4})/);
    if (!dateMatch) continue;

    let scoreIdx = -1;
    for (let j = i + 1; j <= i + 8 && j < lines.length; j++) {
      if (/^\d+\s*[-–—]\s*\d+$/.test(lines[j])) {
        scoreIdx = j;
        break;
      }
    }
    if (scoreIdx === -1) continue;

    const home = lines[scoreIdx - 1];
    const scoreLine = lines[scoreIdx];
    const away = lines[scoreIdx + 1];
    const venue = lines[scoreIdx + 2];

    const [hsStr, asStr] = scoreLine.split(/[-–—]/).map((s) => s.trim());
    const homeScore = Number(hsStr);
    const awayScore = Number(asStr);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;

    const ourIsHome = isOurTeam(home);
    const ourIsAway = isOurTeam(away);
    if (!ourIsHome && !ourIsAway) continue;

    matches.push({
      date: isoDate(dateMatch[1]),
      opponentRaw: ourIsHome ? away : home,
      home_score: ourIsHome ? homeScore : awayScore,
      away_score: ourIsHome ? awayScore : homeScore,
      venue,
    });
  }

  const seen = new Set();
  return matches.filter((m) => {
    const key = `${m.date}|${normalize(m.opponentRaw)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findGameForMatch(games, m) {
  const lzvOpp = cleanOpponent(m.opponentRaw);
  const sameDate = games.filter((g) => g.game_date === m.date);
  if (sameDate.length === 0) return null;
  const exact = sameDate.find((g) => cleanOpponent(g.opponent) === lzvOpp);
  if (exact) return exact;
  const fuzzy = sameDate.find((g) => {
    const dbOpp = cleanOpponent(g.opponent);
    return dbOpp.includes(lzvOpp) || lzvOpp.includes(dbOpp);
  });
  return fuzzy || null;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log(`[lzv-sync] Fetching ${LZV_URL}`);
  const res = await fetch(LZV_URL, {
    headers: {
      "User-Agent":
        "caracrew-sync/1.0 (+https://github.com/matthiasverbeke93/caracrew-futsal)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`LZV fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  const parsed = parseMatches(html);
  console.log(
    `[lzv-sync] Season ${SEASON_SLUG} · Parsed ${parsed.length} played Caracrew matches.`
  );
  if (parsed.length === 0) {
    console.warn(
      "[lzv-sync] No matches parsed. The page layout may have changed."
    );
    return;
  }

  const { data: games, error } = await supabase
    .from("games")
    .select("id, game_date, opponent, home_score, away_score")
    .eq("season_slug", SEASON_SLUG);
  if (error) throw error;

  const targets = (games || []).filter(
    (g) => g.home_score == null || g.away_score == null
  );
  console.log(
    `[lzv-sync] ${targets.length} games in DB missing a final score.`
  );

  let updated = 0;
  let unmatched = 0;
  for (const m of parsed) {
    const game = findGameForMatch(targets, m);
    if (!game) {
      const anyGame = findGameForMatch(games || [], m);
      if (!anyGame) {
        unmatched += 1;
        console.warn(
          `[lzv-sync] No DB row for ${m.date} vs ${m.opponentRaw}`
        );
      }
      continue;
    }
    const { error: upErr } = await supabase
      .from("games")
      .update({ home_score: m.home_score, away_score: m.away_score })
      .eq("id", game.id);
    if (upErr) {
      console.error(`[lzv-sync] Update failed for ${game.id}:`, upErr.message);
      continue;
    }
    updated += 1;
    console.log(
      `[lzv-sync] ${game.game_date} vs ${game.opponent} -> ${m.home_score}-${m.away_score}`
    );
  }

  console.log(
    `[lzv-sync] Done. Updated ${updated} game(s). ${unmatched} parsed match(es) had no DB row.`
  );
}

const isMain =
  import.meta.url ===
  (process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href : null);

if (isMain) {
  main().catch((err) => {
    console.error("[lzv-sync] Fatal:", err);
    process.exit(1);
  });
}
