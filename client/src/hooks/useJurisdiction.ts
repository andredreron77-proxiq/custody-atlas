/**
 * useJurisdiction
 *
 * Persists the user's detected/entered jurisdiction across browser sessions
 * using localStorage (survives tab closes and browser restarts).
 * Cleared only when the user explicitly chooses "Change Location" — never
 * automatically.  A soft 90-day expiry is applied so very stale location
 * data is eventually discarded without forcing re-entry on every visit.
 *
 * Priority when reading:
 *   1. URL query params (direct links always take precedence)
 *   2. localStorage (remembered from any earlier session)
 *   3. null  →  show the location picker
 *
 * Usage:
 *   const { jurisdiction, setJurisdiction, clearJurisdiction } = useJurisdiction();
 *   const { jurisdiction } = useJurisdiction(urlParamJurisdiction); // URL takes priority
 */

import { useState } from "react";
import type { Jurisdiction } from "@shared/schema";

const STORAGE_KEY = "custody_jurisdiction";
const EXPIRY_DAYS = 90;

interface StoredEntry {
  jurisdiction: Jurisdiction;
  savedAt: number; // Unix ms
}

function readFromStorage(): Jurisdiction | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // ── Normalise legacy format ─────────────────────────────────────────────
    // Old entries were stored as plain Jurisdiction objects (no savedAt).
    // Detect by checking for our envelope key.
    let entry: StoredEntry;
    if ("savedAt" in parsed && "jurisdiction" in parsed) {
      entry = parsed as StoredEntry;
    } else {
      // Treat as legacy — wrap it with a sentinel savedAt so it stays valid
      // for one session then gets refreshed by the next write.
      entry = { jurisdiction: parsed as Jurisdiction, savedAt: Date.now() };
    }

    // ── Soft expiry ─────────────────────────────────────────────────────────
    const ageMs = Date.now() - entry.savedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > EXPIRY_DAYS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const j = entry.jurisdiction;
    // Discard corrupt entries with no usable state.
    if (!j?.state?.trim()) return null;

    // Trim state whitespace. County sentinel values ("General", "general", etc.)
    // are kept as-is — display components are sentinel-aware.
    return { ...j, state: j.state.trim() };
  } catch {
    return null;
  }
}

function writeToStorage(j: Jurisdiction): void {
  try {
    const entry: StoredEntry = { jurisdiction: j, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage may be unavailable in private/restricted contexts — fail silently.
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

interface UseJurisdictionResult {
  jurisdiction: Jurisdiction | null;
  setJurisdiction: (j: Jurisdiction) => void;
  clearJurisdiction: () => void;
}

/**
 * @param override - If provided (e.g. from URL params), it is used immediately
 *                   and also saved to localStorage so other pages can read it.
 */
export function useJurisdiction(override?: Jurisdiction | null): UseJurisdictionResult {
  const [jurisdiction, setJurisdictionState] = useState<Jurisdiction | null>(() => {
    if (override) {
      writeToStorage(override);
      return override;
    }
    return readFromStorage();
  });

  const setJurisdiction = (j: Jurisdiction) => {
    writeToStorage(j);
    setJurisdictionState(j);
  };

  const clearJurisdiction = () => {
    clearStorage();
    setJurisdictionState(null);
  };

  return { jurisdiction, setJurisdiction, clearJurisdiction };
}
