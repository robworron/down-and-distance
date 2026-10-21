import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// One shared pool per server process. "server-only" makes the build fail
// if a Client Component ever imports this file, so the URL can't leak.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Drizzle sends typed queries through the pool. In development it logs every
// query's SQL and parameters, so any number on a page can be traced to them.
export const db = drizzle({
  client: pool,
  logger: process.env.NODE_ENV === "development",
});
