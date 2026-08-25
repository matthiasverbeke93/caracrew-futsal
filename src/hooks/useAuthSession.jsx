import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatAuthError } from "../utils/authErrors";
import {
  getAuthEmailRedirectTo,
  getPasswordResetRedirectTo,
  readRecoveryFromUrl,
} from "../utils/authRedirect";

/** Drop the `#access_token=…&type=recovery` fragment once it has been consumed, so a
 *  refresh (or a shared URL) does not drop the user back into the recovery form. */
function clearAuthUrlFragment() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  if (!window.location.hash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

/** Source of truth for "who am I right now":
 *  - `user`         : the Supabase auth.User, or null when signed out.
 *  - `currentPlayer`: the row in `players` linked via `auth_user_id = user.id`, or null
 *                     when signed out or not linked yet (claim pending or awaiting admin).
 *  - `isAdmin`      : `currentPlayer.is_admin === true`.
 *  - `recovery`     : `{ active, error }` — `active` when the user arrived on a Supabase
 *                     password-recovery link (they hold a short-lived session and must set a
 *                     new password), `error` when that link was stale or already used.
 */
export function useAuthSession() {
  const [user, setUser] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [myClaim, setMyClaim] = useState(null);
  const [claimsTick, setClaimsTick] = useState(0);
  // Read straight off the landing URL as well as from the auth event: the client parses the
  // recovery hash while it initialises, which can beat our listener to the punch.
  const [recovery, setRecovery] = useState(() =>
    typeof window === "undefined"
      ? { active: false, error: null }
      : readRecoveryFromUrl(window.location.hash, window.location.search)
  );

  const refreshClaim = useCallback(() => setClaimsTick((n) => n + 1), []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (event === "PASSWORD_RECOVERY") setRecovery({ active: true, error: null });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPlayer() {
      if (!user) {
        setCurrentPlayer(null);
        setMyClaim(null);
        setAuthLoading(false);
        return;
      }
      setAuthLoading(true);
      const { data, error: fetchErr } = await supabase
        .from("players")
        .select("id, name, fixed, is_admin, auth_user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr) console.error("loadPlayer failed:", fetchErr);
      setCurrentPlayer(data || null);
      setAuthLoading(false);
    }
    loadPlayer();
    return () => {
      cancelled = true;
    };
  }, [user, claimsTick]);

  useEffect(() => {
    let cancelled = false;
    async function loadClaim() {
      if (!user) {
        setMyClaim(null);
        return;
      }
      const { data, error: claimErr } = await supabase
        .from("player_claims")
        .select("id, player_id, status, message, created_at, decided_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (claimErr) console.error("loadClaim failed:", claimErr);
      setMyClaim(data?.[0] || null);
    }
    loadClaim();
    return () => {
      cancelled = true;
    };
  }, [user, claimsTick]);

  const signIn = useCallback(async (email, password) => {
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      return { error: formatAuthError(signInErr) };
    }
    return {};
  }, []);

  const signUp = useCallback(async (email, password) => {
    const emailRedirectTo = getAuthEmailRedirectTo();
    const { error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (signUpErr) {
      return { error: formatAuthError(signUpErr) };
    }
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /** Send the "set a new password" email. Deliberately reports success even for an unknown
   *  address — telling a stranger which emails have accounts here is a free roster leak. */
  const requestPasswordReset = useCallback(async (email) => {
    const redirectTo = getPasswordResetRedirectTo();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined
    );
    if (resetErr) {
      return { error: formatAuthError(resetErr) };
    }
    return {};
  }, []);

  /** Finish recovery: the link already put a session in place, so this is a plain user update. */
  const updatePassword = useCallback(async (password) => {
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      return { error: formatAuthError(updateErr) };
    }
    setRecovery({ active: false, error: null });
    clearAuthUrlFragment();
    return {};
  }, []);

  /** Leave recovery without changing anything (also clears a stale-link error). */
  const dismissRecovery = useCallback(() => {
    // Bail out when nothing is set, so callers can fire this on every modal close
    // without handing React a fresh object (and a re-render) each time.
    setRecovery((prev) => (prev.active || prev.error ? { active: false, error: null } : prev));
    clearAuthUrlFragment();
  }, []);

  const submitClaim = useCallback(
    async (playerId, message) => {
      if (!user) return { error: "Sign in first" };
      const { error: insertErr } = await supabase.from("player_claims").insert({
        user_id: user.id,
        player_id: playerId,
        message: message?.trim() || null,
        status: "pending",
      });
      if (insertErr) return { error: insertErr.message };
      refreshClaim();
      return {};
    },
    [user, refreshClaim]
  );

  const cancelClaim = useCallback(async () => {
    if (!myClaim || myClaim.status !== "pending") return { error: "No pending claim" };
    const { error: updateErr } = await supabase
      .from("player_claims")
      .update({ status: "cancelled", decided_at: new Date().toISOString() })
      .eq("id", myClaim.id);
    if (updateErr) return { error: updateErr.message };
    refreshClaim();
    return {};
  }, [myClaim, refreshClaim]);

  const isAdmin = !!currentPlayer?.is_admin;
  const isLinked = !!currentPlayer;
  const isSignedIn = !!user;

  return useMemo(
    () => ({
      user,
      currentPlayer,
      isAdmin,
      isLinked,
      isSignedIn,
      authLoading,
      myClaim,
      signIn,
      signUp,
      signOut,
      recovery,
      requestPasswordReset,
      updatePassword,
      dismissRecovery,
      submitClaim,
      cancelClaim,
      refreshClaim,
    }),
    [
      user,
      currentPlayer,
      isAdmin,
      isLinked,
      isSignedIn,
      authLoading,
      myClaim,
      signIn,
      signUp,
      signOut,
      recovery,
      requestPasswordReset,
      updatePassword,
      dismissRecovery,
      submitClaim,
      cancelClaim,
      refreshClaim,
    ]
  );
}
