import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getAuthEmailRedirectTo } from "../utils/authRedirect";

/** Source of truth for "who am I right now":
 *  - `user`         : the Supabase auth.User, or null when signed out.
 *  - `currentPlayer`: the row in `players` linked via `auth_user_id = user.id`, or null
 *                     when signed out or not linked yet (claim pending or awaiting admin).
 *  - `isAdmin`      : `currentPlayer.is_admin === true`.
 */
export function useAuthSession() {
  const [user, setUser] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [myClaim, setMyClaim] = useState(null);
  const [claimsTick, setClaimsTick] = useState(0);

  const refreshClaim = useCallback(() => setClaimsTick((n) => n + 1), []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
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
      return { error: signInErr.message };
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
      return { error: signUpErr.message };
    }
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
      submitClaim,
      cancelClaim,
      refreshClaim,
    ]
  );
}
