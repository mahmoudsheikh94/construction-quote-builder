// Load .env.local for CLI scripts run via tsx. Next.js and Vitest load it
// automatically; standalone tsx does not, so entry-point scripts import this
// FIRST (before any module that constructs a Supabase client).
import { config } from "dotenv";
config({ path: ".env.local" });
