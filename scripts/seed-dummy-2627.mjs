#!/usr/bin/env node
/**
 * Seeds season 2627 (26–27) from current 2526 data for preview:
 * - Same opponents, venues, kick-off times.
 * - Dates shifted +1 calendar year (fixtures stay on same calendar day/month).
 * - No scores or tally targets; unplayed for stats / attendance rules.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same as sync scripts).
 *
 * Usage:
 *   node scripts/seed-dummy-2627.mjs           # apply
 *   node scripts/seed-dummy-2627.mjs --dry-run # print plan only
 */

import { createClient } from "@supabase/supabase-js";

const SOURCE_SLUG = "2526";
const TARGET_SLUG = "2627";

function shiftGameDateOneYear(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return isoDate;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  const y = Number(m[1]) + 1;
  return `${y}-${m[2]}-${m[3]}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: sourceGames, error: fetchErr } = await supabase
    .from("games")
    .select("*")
    .eq("season_slug", SOURCE_SLUG)
    .order("game_date", { ascending: true });

  if (fetchErr) throw fetchErr;
  if (!sourceGames?.length) {
    console.warn(`[seed-2627] No games found for season_slug=${SOURCE_SLUG}. Nothing to clone.`);
    return;
  }

  console.log(
    `[seed-2627] Found ${sourceGames.length} game(s) in ${SOURCE_SLUG} → will create ${TARGET_SLUG} dummy fixtures (+1 year, no scores).`
  );

  const inserts = sourceGames.map((g) => ({
    ...g,
    id: crypto.randomUUID(),
    season_slug: TARGET_SLUG,
    game_date: shiftGameDateOneYear(g.game_date),
    home_score: null,
    away_score: null,
    expected_goals: null,
    expected_assists: null,
  }));

  if (dryRun) {
    inserts.slice(0, 5).forEach((row, i) => {
      console.log(
        `  [${i + 1}] ${row.game_date} ${row.game_time ?? ""} vs ${row.opponent?.slice(0, 40)}…`
      );
    });
    if (inserts.length > 5) console.log(`  … and ${inserts.length - 5} more`);
    console.log("[seed-2627] Dry run — no writes.");
    return;
  }

  const { data: existing2627, error: exErr } = await supabase
    .from("games")
    .select("id")
    .eq("season_slug", TARGET_SLUG);
  if (exErr) throw exErr;
  const oldIds = (existing2627 || []).map((g) => g.id);

  if (oldIds.length > 0) {
    for (const table of ["attendance", "player_stats", "guest_players", "motm_votes"]) {
      const { error: depErr } = await supabase.from(table).delete().in("game_id", oldIds);
      if (depErr && !String(depErr.message || "").includes("Could not find the table")) {
        console.warn(`[seed-2627] Warning deleting ${table}:`, depErr.message);
      }
    }
  }

  const { error: delGamesErr } = await supabase.from("games").delete().eq("season_slug", TARGET_SLUG);
  if (delGamesErr) {
    console.error("[seed-2627] Delete existing 2627 games failed:", delGamesErr.message);
    throw delGamesErr;
  }

  const { error: insErr } = await supabase.from("games").insert(inserts);
  if (insErr) {
    console.error("[seed-2627] Insert failed:", insErr.message);
    throw insErr;
  }

  console.log(`[seed-2627] Inserted ${inserts.length} game(s) for ${TARGET_SLUG}.`);

  const { data: strengths, error: stErr } = await supabase
    .from("opponent_strength")
    .select("*")
    .eq("season_slug", SOURCE_SLUG);

  if (stErr) {
    console.warn("[seed-2627] Could not read opponent_strength:", stErr.message);
    return;
  }

  if (!strengths?.length) {
    console.log("[seed-2627] No opponent_strength rows for source season — skip copy.");
    return;
  }

  await supabase.from("opponent_strength").delete().eq("season_slug", TARGET_SLUG);

  const strengthInserts = strengths.map((row) => ({
    ...row,
    season_slug: TARGET_SLUG,
  }));

  const { error: osErr } = await supabase.from("opponent_strength").insert(strengthInserts);
  if (osErr) {
    console.warn("[seed-2627] opponent_strength copy failed:", osErr.message);
    return;
  }

  console.log(`[seed-2627] Copied ${strengthInserts.length} opponent_strength row(s) to ${TARGET_SLUG}.`);
}

const isMain =
  import.meta.url ===
  (process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href : null);

if (isMain) {
  main().catch((err) => {
    console.error("[seed-2627] Fatal:", err);
    process.exit(1);
  });
}
