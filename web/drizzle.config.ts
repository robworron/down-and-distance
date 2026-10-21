import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load web/.env.local the way Next does.
loadEnvConfig(process.cwd());

// Drizzle only reads the database: dbt creates every table, and
// `npm run db:pull` mirrors the marts schema into drizzle/schema.ts.
// Never run drizzle-kit push, generate or migrate here.
export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schemaFilter: ["marts"],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
