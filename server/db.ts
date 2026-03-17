/**
 * server/db.ts
 *
 * Drizzle ORM connection to the Replit-provisioned PostgreSQL database.
 * Used for the public_questions SEO repository (and any future server-only tables).
 *
 * Supabase (auth, private questions, documents) is handled separately via
 * server/lib/supabaseAdmin.ts.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
