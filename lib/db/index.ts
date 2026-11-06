import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the owner backend.");
}

declare global {
  var __rentalHousePool: Pool | undefined;
}

export const pool =
  globalThis.__rentalHousePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__rentalHousePool = pool;
}

export const db = drizzle(pool, { schema });
