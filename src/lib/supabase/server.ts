// Server-only Supabase clients. Never import this module from browser code.
import { createClient } from "@supabase/supabase-js";

function requiredEnvironment(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Privileged server-only client. Service-role requests bypass RLS and therefore
 * belong only in validated route handlers, server actions, and seed scripts.
 */
export function createServerSupabaseClient() {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

/**
 * RLS-respecting server client for a request that has already supplied a
 * verified Supabase access token. Route handlers should pass the bearer token
 * through this client rather than use the service role for user-scoped reads.
 */
export function createServerSessionSupabaseClient(accessToken: string) {
  if (!accessToken) throw new Error("A Supabase access token is required for a session client.");
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );
}
