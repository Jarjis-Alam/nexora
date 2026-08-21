import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/placement_os",
});

export const db = drizzle(pool, { schema });

export default db;
