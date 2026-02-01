/**
 * Error handling middleware for the OCI registry.
 *
 * This file provides error handling utilities for the registry.
 * The main error handling is configured using Hono's onError() in app.ts.
 */

/**
 * Determines if the application is running in development mode.
 * In development, we can include more error details.
 */
export function isDevelopment(): boolean {
  return Deno.env.get("DENO_ENV") === "development" ||
    Deno.env.get("NODE_ENV") === "development";
}
