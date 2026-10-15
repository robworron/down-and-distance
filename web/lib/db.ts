import "server-only";

import { Pool } from "pg";

// One shared pool per server process. "server-only" makes the build fail
// if a Client Component ever imports this file, so the URL can't leak.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
