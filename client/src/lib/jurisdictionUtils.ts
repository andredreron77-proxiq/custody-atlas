/**
 * Shared helpers for rendering jurisdiction labels consistently.
 *
 * The string "General" / "general" is used as a sentinel county value
 * in state-only flows (CustodyMapPage, CustodyLawsStatePage) to signal
 * "no specific county — statewide context". These helpers normalise that
 * so UI components never render "General County, Georgia".
 */

/** Returns true when county is absent or is the state-only sentinel. */
export function isStateOnlyCounty(county?: string | null): boolean {
  return !county || county.toLowerCase() === "general";
}

/**
 * Formats a jurisdiction pair for display.
 *
 * Examples:
 *   county="Fulton",  state="Georgia"   → "Fulton County, Georgia"
 *   county=undefined, state="Georgia"   → "Georgia"
 *   county="General", state="Georgia"   → "Georgia"
 *   county="Fulton",  state=undefined   → "Fulton County"
 *   county=undefined, state=undefined   → ""
 */
export function formatJurisdictionLabel(
  state?: string | null,
  county?: string | null
): string {
  const stateOnly = isStateOnlyCounty(county);
  if (!stateOnly && state && county) return `${county} County, ${state}`;
  if (!stateOnly && county) return `${county} County`;
  if (state) return state;
  return "";
}
