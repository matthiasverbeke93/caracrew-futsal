import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWeeklyDigest } from "./digest.ts";

const ALLOWED_SEASON_SLUGS = new Set(["2526", "2627"]);
const DEFAULT_SEASON_SLUG = "2526";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const toRaw = Deno.env.get("DIGEST_TO_EMAIL") || "";
  const fromEmail =
    Deno.env.get("DIGEST_FROM_EMAIL") || "Caracrew digest <onboarding@resend.dev>";
  const rawEnvSeason = (Deno.env.get("DIGEST_SEASON_SLUG") || DEFAULT_SEASON_SLUG).trim();
  const envSeason = ALLOWED_SEASON_SLUGS.has(rawEnvSeason) ? rawEnvSeason : DEFAULT_SEASON_SLUG;
  const appUrl =
    Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || "https://www.lzvcup.be";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "Server misconfigured (Supabase keys)" });
  }
  if (!resendKey) {
    return json(500, { error: "RESEND_API_KEY is not set on the Edge Function" });
  }

  const toList = toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!toList.length) {
    return json(500, { error: "DIGEST_TO_EMAIL is not set on the Edge Function" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "Missing or invalid Authorization" });
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    return json(401, { error: "Not signed in" });
  }

  const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: player, error: playerErr } = await supabaseService
    .from("players")
    .select("is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (playerErr) {
    return json(500, { error: playerErr.message });
  }
  if (!player?.is_admin) {
    return json(403, { error: "Admin only" });
  }

  let bodySeason: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.season_slug === "string") {
      const t = body.season_slug.trim();
      bodySeason = t || undefined;
    }
  } catch {
    /* empty body */
  }

  let seasonSlug = envSeason;
  if (bodySeason !== undefined) {
    if (!ALLOWED_SEASON_SLUGS.has(bodySeason)) {
      return json(400, { error: "Invalid season_slug" });
    }
    seasonSlug = bodySeason;
  }

  try {
    const { resendBody } = await sendWeeklyDigest(supabaseService, {
      seasonSlug,
      appUrl,
      fromEmail,
      toList,
      resendKey,
    });
    return json(200, { ok: true, season_slug: seasonSlug, resend: resendBody });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});
