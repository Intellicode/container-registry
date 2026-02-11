/**
 * Health check endpoints for liveness and readiness probes.
 * These endpoints do not require authentication and are designed
 * for Kubernetes health checks and load balancer integration.
 */

import { Hono } from "hono";

/**
 * Health check status for individual components.
 */
export interface HealthCheckResult {
  status: "ok" | string;
}

/**
 * Readiness check response structure.
 */
export interface ReadinessResponse {
  status: "ready" | "not ready";
  checks: {
    storage: string;
  };
}

/**
 * Liveness check response structure.
 */
export interface LivenessResponse {
  status: "healthy";
}

/**
 * Options for creating health routes.
 */
export interface HealthRoutesOptions {
  /** Root directory for storage health check */
  storageRootDirectory: string;
}

/**
 * Checks if the storage is accessible by verifying the directory exists
 * and is readable/writable.
 */
async function checkStorageHealth(rootDirectory: string): Promise<HealthCheckResult> {
  try {
    // Check if directory exists
    const stat = await Deno.stat(rootDirectory);
    if (!stat.isDirectory) {
      return { status: "error: not a directory" };
    }

    // Try to create a temporary file to verify write access
    const testFile = `${rootDirectory}/.health-check-${Date.now()}`;
    try {
      await Deno.writeTextFile(testFile, "health-check");
      await Deno.remove(testFile);
    } catch (writeError) {
      return { 
        status: `error: ${writeError instanceof Error ? writeError.message : "write failed"}` 
      };
    }

    return { status: "ok" };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { status: "error: storage directory not found" };
    }
    if (error instanceof Deno.errors.PermissionDenied) {
      return { status: "error: permission denied" };
    }
    return { 
      status: `error: ${error instanceof Error ? error.message : "unknown error"}` 
    };
  }
}

/**
 * Creates health check routes.
 * These routes should be mounted without authentication middleware.
 */
export function createHealthRoutes(options: HealthRoutesOptions): Hono {
  const app = new Hono();

  /**
   * GET /health - Liveness probe
   * Returns 200 OK if the server is running.
   * This is a fast check with no dependencies.
   */
  app.get("/", (c) => {
    const response: LivenessResponse = {
      status: "healthy",
    };
    return c.json(response, 200);
  });

  /**
   * GET /health/ready - Readiness probe
   * Returns 200 OK if the service is ready to serve traffic.
   * Verifies storage is accessible.
   */
  app.get("/ready", async (c) => {
    const storageCheck = await checkStorageHealth(options.storageRootDirectory);
    
    const allHealthy = storageCheck.status === "ok";
    
    const response: ReadinessResponse = {
      status: allHealthy ? "ready" : "not ready",
      checks: {
        storage: storageCheck.status,
      },
    };

    return c.json(response, allHealthy ? 200 : 503);
  });

  return app;
}
