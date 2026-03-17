/**
 * Shared helpers for rendering jurisdiction labels consistently.
 *
 * The string "General" / "general" is used as a sentinel county value
 * in state-only flows (CustodyMapPage, CustodyLawsStatePage) to signal
 * "no specific county — statewide context". These helpers normalise that
 * so UI components never render "General County, Georgia".
 *
 * Also guards against literal template placeholders (e.g. "{State}", "County")
 * that could appear from malformed URL params or stale session data.
 */

/**
 * Sentinel/placeholder county values that should be treated as "no county".
 * Checked case-insensitively after trimming whitespace.
 */
const INVALID_COUNTY_PATTERNS = /^(general|\{state\}|\{county\}|county|none|n\/a|undefined|null)$/i;

/**
 * Returns true when county is absent, empty, or a known sentinel/placeholder
 * that means "state-level context only".
 */
export function isStateOnlyCounty(county?: string | null): boolean {
  if (!county) return true;
  const trimmed = county.trim();
  return trimmed === "" || INVALID_COUNTY_PATTERNS.test(trimmed);
}

/**
 * Normalises a raw county string from storage or URL params.
 * Returns the trimmed county if it's a real county name, or "" if it's a
 * sentinel/placeholder so downstream code can use a simple falsy check.
 */
export function normaliseCounty(county?: string | null): string {
  if (isStateOnlyCounty(county)) return "";
  return county!.trim();
}

/**
 * Formats a jurisdiction pair for display.
 *
 * Examples:
 *   county="Fulton",  state="Georgia"   → "Fulton County, Georgia"
 *   county=undefined, state="Georgia"   → "Georgia"
 *   county="General", state="Georgia"   → "Georgia"
 *   county="{State}", state="Georgia"   → "Georgia"
 *   county="Fulton",  state=undefined   → "Fulton County"
 *   county=undefined, state=undefined   → ""
 */
export function formatJurisdictionLabel(
  state?: string | null,
  county?: string | null
): string {
  const stateOnly = isStateOnlyCounty(county);
  const trimmedState = state?.trim() || "";
  const trimmedCounty = county?.trim() || "";
  if (!stateOnly && trimmedState && trimmedCounty) return `${trimmedCounty} County, ${trimmedState}`;
  if (!stateOnly && trimmedCounty) return `${trimmedCounty} County`;
  if (trimmedState) return trimmedState;
  return "";
}
