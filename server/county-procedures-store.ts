/**
 * County Procedures Data Store
 *
 * Abstracts all access to the county-level court procedure dataset.
 * Currently backed by a local JSON file — designed to be swapped for a
 * database implementation without changes to the callers.
 *
 * SEPARATION OF CONCERNS
 * ──────────────────────
 * This store handles LOCAL COURT PROCEDURE data (how to navigate a specific
 * court), which is distinct from the STATE LAW data in custody-laws-store.ts
 * (what the law actually says).
 *
 * State law  →  custody_laws.json    →  custody-laws-store.ts
 * County proc →  county_procedures.json → county-procedures-store.ts  ← you are here
 *
 * County records are OPTIONAL.  When no record exists for a given county the
 * caller receives null and the app degrades gracefully to state-law-only display.
 *
 * JSON key format:  "{State}|{County}"
 *   e.g. "Georgia|Fulton", "California|Los Angeles"
 *
 * To add a new county:
 *   1. Add an entry to data/county_procedures.json with the "{State}|{County}" key
 *   2. Populate only the fields for which verified information is available
 *   3. Leave all other fields absent (they are all optional in CountyProcedureRecord)
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { CountyProcedureRecord } from "@shared/schema";

type ProceduresMap = Record<string, CountyProcedureRecord>;

let _cache: ProceduresMap | null = null;

function loadFromFile(): ProceduresMap {
  if (_cache) return _cache;
  const filePath = join(process.cwd(), "data", "county_procedures.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as ProceduresMap;

  // Strip the _schema_reference documentation key — it is not a real record
  const { _schema_reference: _, ...procedures } = raw as any;
  _cache = procedures;
  return _cache!;
}

/**
 * Retrieve county procedure data for a specific state + county combination.
 * Returns null when no record exists (expected — most counties have no entry yet).
 *
 * Lookup is case-insensitive so "georgia|fulton" matches "Georgia|Fulton".
 */
export function getCountyProcedure(
  stateName: string,
  countyName: string
): CountyProcedureRecord | null {
  const procedures = loadFromFile();

  // Primary lookup: exact casing
  const keyExact = `${stateName}|${countyName}`;
  if (procedures[keyExact]) return procedures[keyExact];

  // Fallback: case-insensitive scan
  const keyLower = keyExact.toLowerCase();
  const match = Object.entries(procedures).find(
    ([k]) => k.toLowerCase() === keyLower
  );
  return match ? match[1] : null;
}

/**
 * Return all county keys currently in the dataset.
 * Useful for admin tooling or data completeness checks.
 */
export function listCounties(): string[] {
  return Object.keys(loadFromFile()).sort();
}
