import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

process.on('SIGTERM', () => {
  pool.end().catch((err) => console.error('Error closing pool on SIGTERM:', err));
});

export const db = drizzle(pool, { schema });

export * from "./schema";
