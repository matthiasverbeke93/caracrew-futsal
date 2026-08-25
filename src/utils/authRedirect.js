/**
 * Canonical site URL for Supabase email confirmation / redirect flows.
 * Dashboard "Site URL" must match (full https URL); see .env.example.
 */

export function normalizeSiteUrl(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

/** Used by signUp emailRedirectTo — must be an absolute https URL for Supabase. */
export function getAuthEmailRedirectTo() {
  if (typeof window === "undefined") return undefined;
  const fromEnv = import.meta.env.VITE_SITE_URL || import.meta.env.VITE_PUBLIC_APP_URL;
  const candidate = fromEnv?.trim() ? fromEnv : window.location.origin;
  const normalized = normalizeSiteUrl(candidate);
  return normalized || undefined;
}

/** Used by resetPasswordForEmail redirectTo — same canonical URL as sign-up,
 *  so Supabase Auth → URL Configuration needs no second entry. */
export function getPasswordResetRedirectTo() {
  return getAuthEmailRedirectTo();
}

/**
 * Read the outcome of a Supabase email link off the URL it landed on.
 * With the client's default implicit flow a recovery link arrives as
 * `#access_token=…&type=recovery`; a stale or already-used link arrives as
 * `#error=access_denied&error_code=otp_expired&error_description=…`.
 * Pure (takes the strings, not `window`) so it is unit-testable.
 *
 * @param {string} [hash]   e.g. `window.location.hash`
 * @param {string} [search] e.g. `window.location.search`
 * @returns {{ recovery: boolean, error: string | null }}
 */
export function readRecoveryFromUrl(hash, search) {
  const result = { recovery: false, error: null };
  for (const raw of [hash, search]) {
    const s = String(raw || "").replace(/^[#?]/, "");
    if (!s) continue;
    const params = new URLSearchParams(s);
    if (params.get("type") === "recovery") result.recovery = true;
    const errorCode = params.get("error_code") || params.get("error");
    if (errorCode && !result.error) {
      const description = params.get("error_description") || "";
      result.error = /expired|invalid|access_denied|otp/i.test(`${errorCode} ${description}`)
        ? "That email link is invalid or has already been used. Request a new one below."
        : description || "That email link could not be used. Request a new one below.";
    }
  }
  // An error hash carries no session, so there is nothing to recover with.
  if (result.error) result.recovery = false;
  return result;
}
