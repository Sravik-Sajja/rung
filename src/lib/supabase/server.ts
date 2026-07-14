// Server-only creator for the privileged Supabase client; never import in browser code.
import { createClient } from "@supabase/supabase-js";

// Import this only from server-side code after Supabase configuration is supplied.
export function createServerSupabaseClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
