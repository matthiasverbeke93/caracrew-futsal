import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * For admins: count of `player_claims` rows with status `pending`.
 */
export function usePendingClaimsCount(isAdmin) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAdmin) {
      setCount(0);
      return;
    }
    const { count: n, error } = await supabase
      .from("player_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) {
      console.error("pending claims count:", error);
      return;
    }
    setCount(typeof n === "number" ? n : 0);
  }, [isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return [count, refresh];
}
