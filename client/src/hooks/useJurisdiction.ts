/**
 * useJurisdiction
 *
 * Persists the user's detected/entered jurisdiction for the lifetime of the
 * browser tab session (sessionStorage). Cleared only when the user explicitly
 * chooses "Change Location" — never automatically.
 *
 * Priority when reading:
 *   1. URL query params (direct links always take precedence)
 *   2. sessionStorage (remembered from earlier in the session)
 *   3. null  →  show the location picker
 *
 * Usage:
 *   const { jurisdiction, setJurisdiction, clearJurisdiction } = useJurisdiction();
 *   const { jurisdiction } = useJurisdiction(urlParamJurisdiction); // URL takes priority
 */

import { useState } from "react";
import type { Jurisdiction } from "@shared/schema";

const STORAGE_KEY = "custody_jurisdiction";

function readFromStorage(): Jurisdiction | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Jurisdiction) : null;
  } catch {
    return null;
  }
}

function writeToStorage(j: Jurisdiction): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(j));
  } catch {
    // sessionStorage may be unavailable in private/restricted contexts — fail silently
  }
}

function clearStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

interface UseJurisdictionResult {
  jurisdiction: Jurisdiction | null;
  setJurisdiction: (j: Jurisdiction) => void;
  clearJurisdiction: () => void;
}

/**
 * @param override - If provided (e.g. from URL params), it is used immediately
 *                   and also saved to sessionStorage so other pages can read it.
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
