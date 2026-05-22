/** Where the user was sent from when hitting a login redirect. */
export type RedirectFrom = {
  pathname?: string;
  search?: string;
  hash?: string;
};

/**
 * Resolve a safe in-app path for post-login navigation.
 * Rejects absolute URLs (e.g. "http://...") which break history.replaceState.
 */
export function getSafeRedirectPath(
  state: unknown,
  fallback = '/'
): string {
  const from = (state as { from?: RedirectFrom })?.from;
  if (!from || typeof from.pathname !== 'string') {
    return fallback;
  }

  const pathname = from.pathname.trim();
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('://')) {
    return fallback;
  }

  if (pathname === '/login' || pathname === '/admin/login') {
    return fallback;
  }

  const search = typeof from.search === 'string' ? from.search : '';
  const hash = typeof from.hash === 'string' ? from.hash : '';
  return `${pathname}${search}${hash}`;
}
