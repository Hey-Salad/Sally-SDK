import type { WorkerBindings } from "../types.js";

/**
 * Access is required unless local development opts out explicitly.
 * Production always requires auth, including when the local flag is also set.
 */
export function accessAuthRequired(bindings: WorkerBindings): boolean {
  if (bindings.SALLY_ENV === "production") {
    return true;
  }

  return !(
    bindings.SALLY_ENV === "development" && bindings.ALLOW_INSECURE_LOCAL_DEV === "true"
  );
}
