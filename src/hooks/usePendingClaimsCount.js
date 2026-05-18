import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * For admins: count of `player_claims` rows with status `pending`.
 */
async function fetchPendingClaimsCount() {
  const { count: n, error } = await supabase
    .from("player_claims")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    console.error("pending claims count:", error);
    return null;
  }
  return typeof n === "number" ? n : 0;
}

export function usePendingClaimsCount(isAdmin) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    const nextCount = await fetchPendingClaimsCount();
    if (nextCount != null) setCount(nextCount);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    async function load() {
      const nextCount = await fetchPendingClaimsCount();
      if (!cancelled && nextCount != null) setCount(nextCount);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    function onFocus() {
      if (isAdmin) refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isAdmin, refresh]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [isAdmin, refresh]);

  return [isAdmin ? count : 0, refresh];
}
