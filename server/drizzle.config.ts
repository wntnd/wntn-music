import { defineConfig } from "drizzle-kit";
import { SUPABASE_CA } from "./src/db/supabase-ca";

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  // Supabase's root CA is not in any public trust store; see src/db/supabase-ca.ts
  dbCredentials: { url: process.env.DATABASE_URL ?? "", ssl: { ca: SUPABASE_CA } },
});
