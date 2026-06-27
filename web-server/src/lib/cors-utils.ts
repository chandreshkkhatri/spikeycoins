/**
 * Check if the request origin is allowed under the current CORS configuration.
 *
 * @param origin The Request origin header value (or undefined)
 * @param opts Options including allowed origins list and production flag
 */
export function isOriginAllowed(
  origin: string | undefined,
  opts: { allowedOrigins: string[]; isProduction: boolean }
): boolean {
  // Allow requests with no origin (like mobile apps, curl, or same-origin requests)
  if (!origin) return true;

  // In development, allow localhost on any port
  if (!opts.isProduction && origin.includes("localhost")) {
    return true;
  }

  // Check if origin is explicitly in the allowed origins list
  return opts.allowedOrigins.indexOf(origin) !== -1;
}
