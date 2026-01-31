/**
 * Error handling middleware for the OCI registry.
 *
 * This file provides error handling utilities for the registry.
 * The main error handling is configured using Hono's onError() in app.ts,
 * but this middleware can also be used directly in routes if needed.
 */

import type { Context, Next } from "hono";
import { RegistryError } from "../types/errors.ts";

/**
 * Determines if the application is running in development mode.
 * In development, we can include more error details.
 */
export function isDevelopment(): boolean {
  return Deno.env.get("DENO_ENV") === "development" ||
    Deno.env.get("NODE_ENV") === "development";
}

/**
 * Error handling middleware that catches and formats all errors.
 *
 * Note: For application-level error handling, use Hono's onError() instead.
 * This middleware is useful for route-specific error handling.
 */
export async function errorHandler(c: Context, next: Next): Promise<Response | void> {
  try {
    await next();
  } catch (error) {
    // Log the full error server-side for debugging
    console.error("Error handling request:", error);

    // Handle known registry errors
    if (error instanceof RegistryError) {
      c.status(error.statusCode as any);
      return c.json(error.toResponse());
    }

    // Handle unexpected errors - return generic 500 error
    // Never expose stack traces or internal error details to clients
    const body = {
      errors: [
        {
          code: "UNSUPPORTED",
          message: "internal server error",
          detail: isDevelopment() ? String(error) : undefined,
        },
      ],
    };

    c.status(500);
    return c.json(body);
  }
}
