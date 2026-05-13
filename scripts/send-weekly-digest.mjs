#!/usr/bin/env node
/**
 * Weekly squad pulse email: next fixture RSVP gaps + MotM voting status.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY — https://resend.com (free tier)
 *   DIGEST_TO_EMAIL — comma-separated recipients
 *   DIGEST_FROM_EMAIL — optional (default: onboarding@resend.dev until domain verified)
 *   DIGEST_SEASON_SLUG — optional (default: first entry in src/seasons.js default == 2526)
 *   PUBLIC_APP_URL — optional link base for CTA (default https://lzvcup.be teams — override with your deployed app URL)
 */

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SEASON_SLUG } from "../src/seasons.js";
import { TEAM_NAME } from "../src/constants.js";
import { nextUpcomingGamesByCalendar } from "../src/utils/game.js";
import { isMotmVotingOpen, getMotmVotingEnd } from "../src/utils/motm.js";
import { formatMatchCalendarDateTime } from "../src/utils/formatMatch.js";
import { cleanOpponentName } from "../src/utils/opponent.js";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtWhen(game) {
  return formatMatchCalendarDateTime(game) || game.game_date || "";
}

async function main() {
  const seasonSlug = process.env.DIGEST_SEASON_SLUG || DEFAULT_SEASON_SLUG;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const toRaw = process.env.DIGEST_TO_EMAIL || "";
  const fromEmail =
    process.env.DIGEST_FROM_EMAIL || "Caracrew digest <onboarding@resend.dev>";
  const appUrl =
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    "https://www.lzvcup.be";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!resendKey) throw new Error("Missing RESEND_API_KEY");
  const toList = toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!toList.length) throw new Error("Set DIGEST_TO_EMAIL (comma-separated)");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: games, error: gErr } = await supabase
    .from("games")
    .select("*")
    .eq("season_slug", seasonSlug)
    .order("game_date", { ascending: true });

  const { data: players, error: pErr } = await supabase.from("players").select("*");

  if (gErr) throw gErr;
  if (pErr) throw pErr;

  const gameIds = (games || []).map((g) => g.id);

  let attendanceScoped = [];
  if (gameIds.length > 0) {
    const { data: att, error: aErr } = await supabase
      .from("attendance")
      .select("*")
      .in("game_id", gameIds);
    if (aErr) throw aErr;
    attendanceScoped = att || [];
  }

  let motmScoped = [];
  if (gameIds.length > 0) {
    const { data: mv, error: mErr } = await supabase
      .from("motm_votes")
      .select("*")
      .in("game_id", gameIds);
    if (mErr) throw mErr;
    motmScoped = mv || [];
  }

  const hiddenNames = new Set(["test test"]);
  const fixedRoster = (players || []).filter(
    (p) => p.fixed && !p.archived && !hiddenNames.has(String(p.name || "").toLowerCase().trim())
  );

  const nextThree = nextUpcomingGamesByCalendar(games || [], 3);
  const nextGame = nextThree[0] ?? null;

  let rsvpSection = "";
  if (nextGame) {
    const missing = [];
    for (const pl of fixedRoster) {
      const row = attendanceScoped.find((a) => a.game_id === nextGame.id && a.player_id === pl.id);
      if (!row) missing.push(pl.name);
    }
    const opp = escapeHtml(cleanOpponentName(nextGame.opponent));
    const when = escapeHtml(fmtWhen(nextGame));
    const loc = escapeHtml(nextGame.location || "Venue TBD");
    if (missing.length) {
      rsvpSection = `
        <h3 style="margin:24px 0 8px;font-size:16px;">RSVP · next fixture</h3>
        <p style="margin:0 0 8px;"><strong>vs ${opp}</strong><br/>${when} · ${loc}</p>
        <p style="margin:0 0 8px;color:#b45309;"><strong>${
          missing.length
        }</strong> fixed roster player(s) still need to RSVP:</p>
        <ul style="margin:0;padding-left:20px;">
          ${missing.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
        </ul>`;
    } else {
      rsvpSection = `
        <h3 style="margin:24px 0 8px;font-size:16px;">RSVP · next fixture</h3>
        <p style="margin:0;"><strong>vs ${opp}</strong><br/>${when} · ${loc}</p>
        <p style="margin:8px 0 0;color:#166534;">Everyone on the fixed roster has an RSVP saved for this match.</p>`;
    }
  } else {
    rsvpSection =
      '<p style="margin:16px 0 0;">No upcoming fixtures left in this season block.</p>';
  }

  const motmOpen = (games || []).filter((g) => isMotmVotingOpen(g));
  let motmSection = "";
  if (motmOpen.length) {
    const blocks = motmOpen.map((g) => {
      const end = getMotmVotingEnd(g);
      const votes = motmScoped.filter((v) => v.game_id === g.id);
      const voters = new Set(votes.map((v) => v.voter_key)).size;
      const endStr = end
        ? end.toLocaleString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      return `<li style="margin-bottom:10px;">
        <strong>vs ${escapeHtml(cleanOpponentName(g.opponent))}</strong> · closes ${escapeHtml(endStr)}<br/>
        <span style="color:#64748b;font-size:14px;">Votes cast: ${voters}</span>
      </li>`;
    });
    motmSection = `
      <h3 style="margin:24px 0 8px;font-size:16px;">MotM voting open</h3>
      <ul style="margin:0;padding-left:20px;">${blocks.join("")}</ul>`;
  } else {
    motmSection =
      '<p style="margin:16px 0 0;color:#64748b;font-size:14px;">No Man of the Match votes due right now.</p>';
  }

  const upcomingLines = nextThree.length
    ? nextThree
        .map(
          (g) =>
            `<li>${escapeHtml(fmtWhen(g))} · <strong>vs ${escapeHtml(
              cleanOpponentName(g.opponent)
            )}</strong> · ${escapeHtml(g.location || "TBD")}</li>`
        )
        .join("")
    : "<li>No upcoming games</li>";

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,Segoe UI,sans-serif;line-height:1.5;color:#0f172a;max-width:560px;">
  <h1 style="font-size:20px;margin:0 0 8px;">${escapeHtml(TEAM_NAME)} · Weekly pulse</h1>
  <p style="margin:0 0 16px;color:#64748b;font-size:14px;">Season ${escapeHtml(seasonSlug)} · sent automatically</p>

  <h3 style="margin:0 0 8px;font-size:16px;">Upcoming (next ${nextThree.length || 0})</h3>
  <ul style="margin:0;padding-left:20px;">${upcomingLines}</ul>

  ${rsvpSection}
  ${motmSection}

  <p style="margin:28px 0 0;">
    <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#020617;color:#fff;text-decoration:none;padding:10px 16px;border-radius:12px;font-weight:700;font-size:14px;">Open squad app</a>
  </p>
  <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Reply not monitored — use WhatsApp or the app.</p>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toList,
      subject: `${TEAM_NAME} · Weekly squad pulse`,
      html,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  console.log("[digest] Sent OK:", body);
}

const isMain =
  import.meta.url ===
  (process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href : null);

if (isMain) {
  main().catch((err) => {
    console.error("[digest] Fatal:", err);
    process.exit(1);
  });
}
