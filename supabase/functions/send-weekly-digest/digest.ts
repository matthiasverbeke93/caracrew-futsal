/**
 * Weekly digest body + Resend send — mirrors scripts/send-weekly-digest.mjs (keep in sync when changing copy).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const TEAM_NAME = "K. Caracrew SK";
const SEASON_SLUGS_PREVIEW_LOCKED = new Set(["2627"]);

function isSeasonVotingLocked(slug: string | null | undefined) {
  return typeof slug === "string" && SEASON_SLUGS_PREVIEW_LOCKED.has(slug);
}

function isPlayed(game: { game_date?: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  return (game.game_date || "") < today;
}

function compareByKickoff(a: { game_date?: string; game_time?: string }, b: { game_date?: string; game_time?: string }) {
  const da = a.game_date || "";
  const db = b.game_date || "";
  if (da !== db) return da.localeCompare(db);
  return String(a.game_time || "").localeCompare(String(b.game_time || ""));
}

function nextUpcomingGamesByCalendar<T extends { game_date?: string }>(allGames: T[], limit = 3): T[] {
  if (!allGames?.length) return [];
  return [...allGames]
    .filter((g) => !isPlayed(g))
    .sort(compareByKickoff)
    .slice(0, limit);
}

function parseGameStart(game: { game_date?: string; game_time?: string | null }) {
  const date = game.game_date;
  if (!date) return null;
  let t = game.game_time ? String(game.game_time) : "21:00:00";
  if (t.length === 5) t += ":00";
  const d = new Date(`${date}T${t}`);
  return Number.isNaN(d.getTime()) ? new Date(`${date}T21:00:00`) : d;
}

function getMotmVotingStart(game: { game_date?: string; game_time?: string | null }) {
  const start = parseGameStart(game);
  if (!start) return null;
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

function getMotmVotingEnd(game: { game_date?: string; game_time?: string | null }) {
  const openAt = getMotmVotingStart(game);
  if (!openAt) return null;
  return new Date(openAt.getTime() + 24 * 60 * 60 * 1000);
}

function isMotmVotingOpen(game: { game_date?: string; game_time?: string | null; season_slug?: string }, nowMs = Date.now()) {
  if (!game || isSeasonVotingLocked(game.season_slug) || !isPlayed(game)) return false;
  const openAt = getMotmVotingStart(game);
  const end = getMotmVotingEnd(game);
  if (!openAt || !end) return false;
  return nowMs >= openAt.getTime() && nowMs <= end.getTime();
}

function normalizeGameDateOnly(game: { game_date?: string | null }) {
  const raw = game?.game_date;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (isoDay) return isoDay[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function formatMatchCalendarDateTime(game: { game_date?: string; game_time?: string | null }) {
  const dateOnly = normalizeGameDateOnly(game);
  if (!dateOnly) return "";
  let d = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(d.getTime())) d = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateOnly;
  const datePart = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = game?.game_time ? String(game.game_time).slice(0, 5) : "";
  return time ? `${datePart} · ${time}` : datePart;
}

const SCORE_TAIL = /\s+\d+\s*[-–—]\s*\d+\b.*$/;
const OUR_TEAM_TAIL = /\s+(k\s+)?caracrew(\s+sk)?\s*$/i;

function cleanOpponentName(raw: string | null | undefined) {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(SCORE_TAIL, "");
  s = s.replace(OUR_TEAM_TAIL, "");
  return s.trim();
}

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeAppUrl(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return "https://www.lzvcup.be";
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, "") || "https://www.lzvcup.be";
  return `https://${s.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function emailCard(title: string, headerBg: string, headerColor: string, bodyHtml: string) {
  const t = escapeHtml(title);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden;">
  <tr>
    <td style="padding:12px 16px;background:${headerBg};">
      <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${headerColor};">${t}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 16px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;">
      ${bodyHtml}
    </td>
  </tr>
</table>`;
}

function fmtWhen(game: { game_date?: string; game_time?: string | null }) {
  return formatMatchCalendarDateTime(game) || game.game_date || "";
}

export type DigestSendConfig = {
  seasonSlug: string;
  appUrl: string;
  fromEmail: string;
  toList: string[];
  resendKey: string;
};

export async function sendWeeklyDigest(
  supabase: SupabaseClient,
  { seasonSlug, appUrl, fromEmail, toList, resendKey }: DigestSendConfig,
): Promise<{ resendBody: string }> {
  const { data: games, error: gErr } = await supabase
    .from("games")
    .select("*")
    .eq("season_slug", seasonSlug)
    .order("game_date", { ascending: true });

  const { data: players, error: pErr } = await supabase.from("players").select("*");

  if (gErr) throw gErr;
  if (pErr) throw pErr;

  const gameList = games || [];
  const gameIds = gameList.map((g: { id: string }) => g.id);

  let attendanceScoped: { game_id: string; player_id: string }[] = [];
  if (gameIds.length > 0) {
    const { data: att, error: aErr } = await supabase.from("attendance").select("*").in("game_id", gameIds);
    if (aErr) throw aErr;
    attendanceScoped = att || [];
  }

  let motmScoped: { game_id: string; voter_key: string }[] = [];
  if (gameIds.length > 0) {
    const { data: mv, error: mErr } = await supabase.from("motm_votes").select("*").in("game_id", gameIds);
    if (mErr) throw mErr;
    motmScoped = mv || [];
  }

  const hiddenNames = new Set(["test test"]);
  const fixedRoster = (players || []).filter(
    (p: { fixed?: boolean; archived?: boolean; name?: string }) =>
      p.fixed && !p.archived && !hiddenNames.has(String(p.name || "").toLowerCase().trim()),
  );

  const nextThree = nextUpcomingGamesByCalendar(gameList, 3);
  const nextGame = nextThree[0] ?? null;

  let rsvpBody = "";
  if (nextGame) {
    const missing: string[] = [];
    for (const pl of fixedRoster) {
      const row = attendanceScoped.find(
        (a) => a.game_id === nextGame.id && a.player_id === (pl as { id: string }).id,
      );
      if (!row) missing.push((pl as { name: string }).name);
    }
    const opp = escapeHtml(cleanOpponentName(nextGame.opponent));
    const when = escapeHtml(fmtWhen(nextGame));
    const loc = escapeHtml(nextGame.location || "Venue TBD");
    if (missing.length) {
      rsvpBody = `
        <p style="margin:0 0 8px;"><strong>vs ${opp}</strong><br/>${when} · ${loc}</p>
        <p style="margin:0 0 8px;color:#b45309;font-size:14px;"><strong>${
          missing.length
        }</strong> fixed roster player(s) still need to RSVP:</p>
        <ul style="margin:0;padding-left:20px;">
          ${missing.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
        </ul>`;
    } else {
      rsvpBody = `
        <p style="margin:0;"><strong>vs ${opp}</strong><br/>${when} · ${loc}</p>
        <p style="margin:10px 0 0;color:#166534;font-size:14px;">Everyone on the fixed roster has an RSVP saved for this match.</p>`;
    }
  } else {
    rsvpBody = '<p style="margin:0;">No upcoming fixtures left in this season block.</p>';
  }

  const motmOpen = gameList.filter((g) => isMotmVotingOpen(g));
  let motmBody = "";
  if (motmOpen.length) {
    const blocks = motmOpen.map((g: { id: string; opponent?: string }) => {
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
    motmBody = `<ul style="margin:0;padding-left:20px;">${blocks.join("")}</ul>`;
  } else {
    motmBody =
      '<p style="margin:0;color:#64748b;font-size:14px;">No Man of the Match votes due right now.</p>';
  }

  const upcomingLines = nextThree.length
    ? nextThree
      .map(
        (g: { game_date?: string; game_time?: string | null; opponent?: string; location?: string }) =>
          `<li>${escapeHtml(fmtWhen(g))} · <strong>vs ${escapeHtml(
            cleanOpponentName(g.opponent),
          )}</strong> · ${escapeHtml(g.location || "TBD")}</li>`,
      )
      .join("")
    : "<li>No upcoming games</li>";

  const normalizedApp = normalizeAppUrl(appUrl);
  const href = escapeHtml(normalizedApp);
  const subjectLine = `${TEAM_NAME} · Weekly squad pulse`;

  const rsvpCard = emailCard("RSVP · next fixture", "#fefce8", "#854d0e", rsvpBody);
  const motmTitle = motmOpen.length ? "Man of the Match · voting open" : "Man of the Match";
  const motmCard = emailCard(motmTitle, "#eff6ff", "#1d4ed8", motmBody);

  const upcomingPlain = nextThree.length
    ? nextThree
      .map(
        (g: { opponent?: string; game_date?: string; game_time?: string | null; location?: string }) =>
          `- ${fmtWhen(g)} · vs ${cleanOpponentName(g.opponent)} · ${g.location || "TBD"}`,
      )
      .join("\n")
    : "- (none)";

  const textBody = `${TEAM_NAME} · Weekly pulse
Season ${seasonSlug}

Upcoming (next ${nextThree.length}):
${upcomingPlain}

RSVP (next fixture):
${nextGame ? `${cleanOpponentName(nextGame.opponent)} · ${fmtWhen(nextGame)}` : "No upcoming game"}

MotM:
${motmOpen.length ? `${motmOpen.length} vote window(s) open` : "No votes due right now"}

Open the squad app (tap or copy):
${normalizedApp}

Reply not monitored — use WhatsApp or the app.
`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subjectLine)}</title>
</head>
<body style="margin:0;padding:0;background:#e2e8f0;-webkit-text-size-adjust:100%;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
    ${escapeHtml(TEAM_NAME)} — fixtures, RSVP, MotM
  </span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#e2e8f0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:#020617;padding:22px 24px;">
              <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:20px;font-weight:800;color:#f8fafc;line-height:1.25;">
                ${escapeHtml(TEAM_NAME)}
              </p>
              <p style="margin:8px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;color:#94a3b8;line-height:1.45;">
                Weekly pulse · Season ${escapeHtml(seasonSlug)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;">
              <p style="margin:0 0 20px;font-size:14px;color:#64748b;">
                RSVP gaps and MotM voting — sent automatically.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden;">
                <tr>
                  <td style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">
                      Upcoming · next ${nextThree.length || 0}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px 16px;">
                    <ul style="margin:0;padding-left:20px;">${upcomingLines}</ul>
                  </td>
                </tr>
              </table>

              ${rsvpCard}
              ${motmCard}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                <tr>
                  <td align="left">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="border-radius:12px;background:#020617;">
                          <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;line-height:1.2;">Open squad app</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-size:13px;color:#64748b;">
                Or copy this link into your browser:<br/>
                <a href="${href}" style="color:#2563eb;word-break:break-all;">${href}</a>
              </p>

              <p style="margin:22px 0 0;font-size:12px;color:#94a3b8;line-height:1.45;">
                Reply not monitored — use WhatsApp or the app.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toList,
      subject: subjectLine,
      html,
      text: textBody,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return { resendBody: body };
}
