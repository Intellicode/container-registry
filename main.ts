/**
 * Container Registry - Entry Point
 *
 * A lightweight, self-hosted Docker container registry implementing
 * the OCI Distribution Specification.
 */

import { createApp } from "./src/app.ts";
import { getConfig } from "./src/config.ts";

if (import.meta.main) {
  const config = getConfig();
  const { app } = await createApp();

  console.log(
    `Container Registry starting on ${config.server.host}:${config.server.port}`,
  );

  Deno.serve(
    {
      hostname: config.server.host,
      port: config.server.port,
    },
    app.fetch,
  );
}
