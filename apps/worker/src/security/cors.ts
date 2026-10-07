/**
 * Reflect an Origin only when it is listed exactly in ALLOWED_ORIGINS.
 * A configured "*" is ignored so a wildcard cannot be reintroduced by config.
 */
export function matchAllowedOrigin(requestOrigin: string, configured: string | undefined): string | undefined {
  if (!requestOrigin) {
    return undefined;
  }

  const allowed = (configured ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");

  return allowed.includes(requestOrigin) ? requestOrigin : undefined;
}
