/**
 * Pure logic behind the "Report a bug" button.
 *
 * The row shape here has to agree with `supabase/bug_reports.sql`, including its
 * length checks: Postgres rejects the whole insert if a field is over its cap, and
 * a 600-character user agent or a long share URL is entirely realistic. So we
 * truncate here rather than hand the user a constraint violation.
 */

export const BUG_KINDS = [
  { value: "bug", label: "Something is broken" },
  { value: "data", label: "Wrong data / score" },
  { value: "idea", label: "Idea or request" },
];

export const BUG_SEVERITIES = [
  { value: "blocking", label: "Can't use it" },
  { value: "annoying", label: "Annoying" },
  { value: "minor", label: "Minor" },
];

export const MESSAGE_MIN = 3;
export const MESSAGE_MAX = 4000;

// Mirrors the column checks in supabase/bug_reports.sql.
const LIMITS = {
  reporter_name: 120,
  reporter_email: 200,
  page_url: 500,
  season_slug: 16,
  app_build: 64,
  user_agent: 500,
  viewport: 32,
};

const KIND_VALUES = new Set(BUG_KINDS.map((k) => k.value));
const SEVERITY_VALUES = new Set(BUG_SEVERITIES.map((s) => s.value));

/** Trim, collapse empties to null, and cap at the column's length. */
export function clip(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Is this submittable? Returns an error string, or null when it is fine.
 * The message bound matches the DB's `between 3 and 4000` on the trimmed value.
 */
export function validateBugReport({ message, kind, severity } = {}) {
  const trimmed = String(message ?? "").trim();
  if (trimmed.length < MESSAGE_MIN) return "Tell us what went wrong first.";
  if (trimmed.length > MESSAGE_MAX) return `Keep it under ${MESSAGE_MAX} characters.`;
  if (kind !== undefined && kind !== null && !KIND_VALUES.has(kind)) return "Pick a type.";
  if (severity !== undefined && severity !== null && !SEVERITY_VALUES.has(severity)) {
    return "Pick how blocking it is.";
  }
  return null;
}

/**
 * Environment snapshot. Takes plain values rather than reaching for `window`, so
 * it is testable in the node environment the rest of `utils/` uses.
 */
export function collectBugContext({
  url,
  seasonSlug,
  appBuild,
  userAgent,
  viewportWidth,
  viewportHeight,
} = {}) {
  const w = Number(viewportWidth);
  const h = Number(viewportHeight);
  const viewport =
    Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
      ? `${Math.round(w)}x${Math.round(h)}`
      : null;
  return {
    page_url: clip(url, LIMITS.page_url),
    season_slug: clip(seasonSlug, LIMITS.season_slug),
    app_build: clip(appBuild, LIMITS.app_build),
    user_agent: clip(userAgent, LIMITS.user_agent),
    viewport: clip(viewport, LIMITS.viewport),
  };
}

/**
 * Assemble the insert payload.
 *
 * Reporter identity comes from the session when there is one — the typed name and
 * email are only a fallback for signed-out visitors, and are ignored when signed
 * in so a report can't be filed under someone else's name. `auth_user_id` is
 * checked against `auth.uid()` by RLS anyway; sending the session's own value
 * keeps that check satisfied.
 */
export function buildBugReportRow({
  message,
  kind = "bug",
  severity = "annoying",
  user = null,
  currentPlayer = null,
  reporterName = null,
  reporterEmail = null,
  context = {},
} = {}) {
  const signedIn = Boolean(user?.id);
  return {
    kind,
    severity,
    message: String(message ?? "").trim().slice(0, MESSAGE_MAX),
    auth_user_id: signedIn ? user.id : null,
    reporter_player_id: currentPlayer?.id ?? null,
    reporter_name: clip(
      signedIn ? currentPlayer?.name ?? null : reporterName,
      LIMITS.reporter_name
    ),
    reporter_email: clip(signedIn ? user.email ?? null : reporterEmail, LIMITS.reporter_email),
    ...collectBugContext(context),
  };
}
