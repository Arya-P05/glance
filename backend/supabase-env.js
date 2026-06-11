/** Supabase env vars — accepts both backend and Next.js-style names in .env */
export function supabaseUrl() {
  const value = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  }
  return value;
}

export function supabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  return value;
}
