import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

/** Source of truth for "who am I right now":
 *  - `user`         : the Supabase auth.User, or null when signed out.
 *  - `currentPlayer`: the row in `players` linked via `auth_user_id = user.id`, or null
 *                     (signed out / not yet linked by admin).
 *  - `isAdmin`      : `currentPlayer.is_admin === true`.
 */
export function useAuthSession() {
  const [user, setUser] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState(null);

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
  }, [user]);

  const signIn = useCallback(async (email, password) => {
    setError(null);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      setError(signInErr.message);
      return { error: signInErr.message };
    }
    return {};
  }, []);

  const signUp = useCallback(async (email, password) => {
    setError(null);
    const { error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      setError(signUpErr.message);
      return { error: signUpErr.message };
    }
    return {};
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase.auth.signOut();
  }, []);

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
      error,
      signIn,
      signUp,
      signOut,
    }),
    [
      user,
      currentPlayer,
      isAdmin,
      isLinked,
      isSignedIn,
      authLoading,
      error,
      signIn,
      signUp,
      signOut,
    ]
  );
}
