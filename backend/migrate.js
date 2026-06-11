/**
 * Apply pending Supabase migrations using the Supabase CLI.
 *
 * Requires your database password in .env:
 *   SUPABASE_DB_PASSWORD=...
 * Find it at: Supabase Dashboard → Project Settings → Database → Database password
 *
 * Usage:
 *   npm run migrate
 *   npm run migrate -- --dry-run
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabaseUrl } from "./supabase-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, "..");

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function projectRef(supabaseUrl) {
  const match = String(supabaseUrl || "").match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) throw new Error(`Cannot parse project ref from SUPABASE_URL: ${supabaseUrl}`);
  return match[1];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const password = env("SUPABASE_DB_PASSWORD");
  const ref = projectRef(supabaseUrl());

  const dbUrl = `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;

  console.log(`Project: ${ref}\n`);

  const cmd = dryRun
    ? `supabase db push --db-url "${dbUrl}" --dry-run`
    : `supabase db push --db-url "${dbUrl}"`;

  execSync(cmd, { stdio: "inherit", cwd: PROJECT_DIR });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
