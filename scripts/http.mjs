// Shared fetch for the CI scripts: a per-attempt timeout plus a few retries with backoff.
//
// Node's built-in fetch has no practical timeout (undici waits ~300 s for headers), so one hung
// LZV request used to eat a whole 5-minute job budget, and a single 503 on the weekly score
// sync meant a week without scores. Retries cover network errors, 429 and 5xx only — a 4xx is
// an answer, not a blip, and is returned to the caller unchanged.
//
// Only retry a POST when it carries an idempotency key (Resend's `Idempotency-Key`), otherwise
// a request that landed but whose response was lost gets sent twice.

export const DEFAULT_TIMEOUT_MS = 15000;
export const DEFAULT_RETRIES = 2;

/** True for statuses worth another attempt: rate limited or a server-side failure. */
export function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fetch` with a timeout on every attempt and up to `retries` extra attempts on network errors,
 * 429 and 5xx. Resolves with the last Response (which may still be !ok); rejects only when the
 * final attempt threw.
 */
export async function fetchWithRetry(
  url,
  init = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, backoffMs = 1000, label = "fetch" } = {}
) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!isRetryableStatus(res.status) || attempt === retries) return res;
      console.warn(`[${label}] HTTP ${res.status}, retrying (${attempt + 1}/${retries})`);
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      console.warn(`[${label}] ${err.name === "TimeoutError" ? "timed out" : err.message}, retrying (${attempt + 1}/${retries})`);
    }
  }
  throw lastError;
}
