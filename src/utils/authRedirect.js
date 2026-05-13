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
