#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SEASON_SLUG } from "../src/seasons.js";

const SEASON_SLUG = process.env.LZV_SEASON_SLUG || DEFAULT_SEASON_SLUG;

const TEAM_OVERVIEW_URL =
  process.env.LZV_TEAM_URL || "https://www.lzvcup.be/teams/overview/742";
const OUR_TEAM_ID =
  process.env.LZV_OUR_TEAM_ID ||
  (TEAM_OVERVIEW_URL.match(/(\d+)$/) || [])[1] ||
  "742";

const UA = "caracrew-palmares/1.0 (+https://github.com/matthiasverbeke93/caracrew-futsal)";

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

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^k\.?\s+/, "k ")
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export function discoverOpponents(html, ourTeamId) {
  const regex = /teams\/detail\/(\d+)"[^>]*>([^<]+)</g;
  const seen = new Map();
  let m;
  while ((m = regex.exec(html))) {
    const id = m[1];
    if (id === String(ourTeamId)) continue;
    const name = m[2].trim();
    if (!name || /caracrew/i.test(name)) continue;
    if (!seen.has(id)) seen.set(id, name);
  }
  return [...seen.entries()].map(([team_id, name]) => ({ team_id, name }));
}

/** Parse the current-season standings table from a team overview page.
 * Returns: Map<team_id, { position, played, wins, draws, losses, gf, ga, gd, points, ptnPerMatch }>.
 */
export function parseCurrentStandings(html) {
  const out = new Map();
  const blockRe = /<li class="item[^"]*"[\s\S]*?<\/li>/g;
  const blocks = html.match(blockRe) || [];
  for (const b of blocks) {
    const idMatch = b.match(/teams\/detail\/(\d+)"[^>]*>([^<]+)</);
    if (!idMatch) continue;
    const teamId = idMatch[1];
    const name = idMatch[2].trim();
    const text = b
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(name, " ");
    const nums = text.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 10) continue;
    const [position, played, wins, draws, losses, gf, ga, gd, points, ptnPerMatch] =
      nums.map(Number);
    out.set(teamId, {
      name,
      position,
      played,
      wins,
      draws,
      losses,
      gf,
      ga,
      gd,
      points,
      ptnPerMatch,
    });
  }
  return out;
}

export function parseTeamPage(html, teamId) {
  const text = stripTags(html);
  const lines = text
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let palmaresIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/palmares/i.test(lines[i])) {
      palmaresIdx = i;
      break;
    }
  }

  const history = [];
  if (palmaresIdx !== -1) {
    const region = lines.slice(palmaresIdx, palmaresIdx + 400);
    const seasonRegex = /^(\d{4}-\d{4})$/;
    for (let i = 0; i < region.length; i++) {
      if (!seasonRegex.test(region[i])) continue;
      const season = region[i];
      const reeks = region[i + 1] || "";
      const nums = [];
      let scan = i + 2;
      while (nums.length < 6 && scan < region.length) {
        if (/^-?\d+$/.test(region[scan])) {
          nums.push(Number(region[scan]));
        } else if (/^\d{4}-\d{4}$/.test(region[scan])) {
          break;
        } else if (nums.length > 0) {
          break;
        }
        scan += 1;
      }
      if (nums.length < 6) continue;
      const [position, wins, draws, losses, goalsFor, goalsAgainst] = nums;
      history.push({
        season,
        reeks,
        position,
        wins,
        draws,
        losses,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
      });
    }
  }

  return { teamId, history };
}

function computeStrengthScore(parsed) {
  const weights = [0.55, 0.3, 0.15];
  let score = 0;
  let totalWeight = 0;
  const seasons = [];

  if (parsed.currentPosition != null) {
    seasons.push({
      position: parsed.currentPosition,
      ptn: parsed.currentPtnPerMatch ?? 0,
    });
  }
  for (const s of parsed.history.slice(-3).reverse()) {
    seasons.push({
      position: s.position,
      ptn: null,
      gd: (s.goals_for || 0) - (s.goals_against || 0),
      played: (s.wins || 0) + (s.draws || 0) + (s.losses || 0),
    });
  }

  for (let i = 0; i < seasons.length && i < weights.length; i++) {
    const s = seasons[i];
    let component;
    if (s.ptn != null) {
      component = (s.ptn / 3) * 100;
    } else {
      const norm = Math.max(0, 12 - (s.position || 12)) / 11;
      const gdPart = s.played > 0 ? Math.max(-2, Math.min(2, s.gd / s.played)) : 0;
      component = norm * 100 + gdPart * 5;
    }
    score += component * weights[i];
    totalWeight += weights[i];
  }

  if (totalWeight === 0) return null;
  return Number((score / totalWeight).toFixed(2));
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

  console.log(
    `[palmares] Season ${SEASON_SLUG} · Discovering opponents from ${TEAM_OVERVIEW_URL}`
  );
  const overviewHtml = await fetchText(TEAM_OVERVIEW_URL);
  const opponents = discoverOpponents(overviewHtml, OUR_TEAM_ID);
  const standings = parseCurrentStandings(overviewHtml);
  console.log(`[palmares] Found ${opponents.length} opponents; standings rows: ${standings.size}.`);

  let updated = 0;
  for (const opp of opponents) {
    const url = `https://www.lzvcup.be/teams/detail/${opp.team_id}`;
    console.log(`[palmares] -> ${opp.name} (${opp.team_id})`);
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      console.error(`[palmares] fetch failed:`, err.message);
      continue;
    }
    const parsed = parseTeamPage(html, opp.team_id);
    const currentRow = standings.get(opp.team_id) || null;
    const combined = {
      ...parsed,
      currentPosition: currentRow?.position ?? null,
      currentPtnPerMatch: currentRow?.ptnPerMatch ?? null,
    };
    const strength = computeStrengthScore(combined);
    const { error } = await supabase
      .from("opponent_strength")
      .upsert({
        season_slug: SEASON_SLUG,
        team_id: opp.team_id,
        name: opp.name,
        last_synced: new Date().toISOString(),
        current_position: combined.currentPosition,
        current_ptn_per_match: combined.currentPtnPerMatch,
        history: parsed.history,
        strength_score: strength,
      });
    if (error) {
      console.error(`[palmares] upsert failed:`, error.message);
      continue;
    }
    updated += 1;
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[palmares] Done. Updated ${updated} opponents.`);
}

const isMain =
  import.meta.url ===
  (process.argv[1]
    ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href
    : null);

if (isMain) {
  main().catch((err) => {
    console.error("[palmares] Fatal:", err);
    process.exit(1);
  });
}
