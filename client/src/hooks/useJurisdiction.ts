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
import { normaliseCounty } from "@/lib/jurisdictionUtils";

const STORAGE_KEY = "custody_jurisdiction";
const AUTH_USER_ID_STORAGE_KEY = "custody-atlas:auth-user-id";
const EXPIRY_DAYS = 90;

interface StoredEntry {
  jurisdiction: Jurisdiction;
  savedAt: number; // Unix ms
  userId?: string;
}

interface ParsedStoredEntry {
  entry: StoredEntry;
  shouldClearStorage: boolean;
}

function getActiveUserIdFromSession(): string | null {
  try {
    return sessionStorage.getItem(AUTH_USER_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseStoredJurisdiction(raw: string, activeUserId: string | null): ParsedStoredEntry | null {
  const parsed = JSON.parse(raw);

  // ── Normalise legacy format ─────────────────────────────────────────────
  // Old entries were stored as plain Jurisdiction objects (no envelope/user).
  let entry: StoredEntry;
  let shouldClearStorage = false;
  if (parsed && typeof parsed === "object" && "savedAt" in parsed && "jurisdiction" in parsed) {
    entry = parsed as StoredEntry;
  } else {
    shouldClearStorage = true;
    entry = { jurisdiction: parsed as Jurisdiction, savedAt: Date.now() };
  }

  return { entry, shouldClearStorage };
}

function readFromStorage(): Jurisdiction | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const activeUserId = getActiveUserIdFromSession();
    const parsed = parseStoredJurisdiction(raw, activeUserId);
    if (!parsed) return null;
    const { entry, shouldClearStorage } = parsed;
    if (shouldClearStorage) {
      localStorage.removeItem(STORAGE_KEY);
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

    // Trim state + normalise county sentinel/placeholder values.
    return { ...j, state: j.state.trim(), county: normaliseCounty(j.county) };
  } catch {
    return null;
  }
}

function writeToStorage(j: Jurisdiction): void {
  try {
    const userId = getActiveUserIdFromSession();
    const entry: StoredEntry = { jurisdiction: j, savedAt: Date.now(), ...(userId ? { userId } : {}) };
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
