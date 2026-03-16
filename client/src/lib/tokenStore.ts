/**
 * client/src/lib/tokenStore.ts
 *
 * Module-level access token store.
 * Updated by useCurrentUser() via onAuthStateChange.
 * Read by apiRequest() to attach Bearer tokens to API calls.
 */

let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}
