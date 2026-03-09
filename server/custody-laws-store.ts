/**
 * Custody Laws Data Store
 *
 * Abstracts all access to the custody law dataset.
 * Currently backed by a local JSON file — designed to be swapped for a
 * database implementation without changes to the callers.
 *
 * To migrate to a database:
 * 1. Replace `loadFromFile()` with a DB query function using the same return shape
 * 2. Update `getCustodyLaw()` and `listStates()` to call the DB
 * 3. The `CustodyLawRecord` type in shared/schema.ts defines the required shape
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { CustodyLawRecord } from "@shared/schema";

type LawsMap = Record<string, CustodyLawRecord>;

let _cache: LawsMap | null = null;

function loadFromFile(): LawsMap {
  if (_cache) return _cache;
  const filePath = join(process.cwd(), "data", "custody_laws.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as LawsMap;
  _cache = raw;
  return raw;
}

/**
 * Retrieve custody law data for a given state name.
 * Returns null if the state is not in the dataset (unsupported state).
 */
export function getCustodyLaw(stateName: string): CustodyLawRecord | null {
  const laws = loadFromFile();
  return laws[stateName] ?? null;
}

/**
 * Return a sorted list of all supported state names.
 */
export function listStates(): string[] {
  return Object.keys(loadFromFile()).sort();
}

/**
 * Return the full map (used for AI context building).
 */
export function getAllLaws(): LawsMap {
  return loadFromFile();
}
