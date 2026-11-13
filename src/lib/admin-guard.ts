/**
 * Evaluates whether access to the founder command panel is permitted.
 *
 * The founder command panel is an unauthenticated demo surface intended solely
 * for local development and demonstration environments. In production builds,
 * all requests to /admin are refused with an HTTP 404 status.
 *
 * @param env - The runtime environment string, defaulting to `process.env.NODE_ENV`.
 * @returns An object containing the appropriate HTTP status (200 or 404) and an `allowed` boolean flag.
 */
export function handleAdminRequest(env: string = process.env.NODE_ENV ?? 'development'): {
  status: 200 | 404;
  allowed: boolean;
} {
  if (env === 'production') {
    return { status: 404, allowed: false };
  }
  return { status: 200, allowed: true };
}
