/**
 * Configuration management for the container registry.
 * Loads configuration from environment variables with sensible defaults.
 */

export interface ServerConfig {
  host: string;
  port: number;
}

export interface StorageConfig {
  rootDirectory: string;
}

export interface LogConfig {
  level: "debug" | "info" | "warn" | "error";
}

export interface RegistryConfig {
  server: ServerConfig;
  storage: StorageConfig;
  log: LogConfig;
}

/**
 * Loads configuration from environment variables with defaults.
 */
export function loadConfig(): RegistryConfig {
  return {
    server: {
      host: Deno.env.get("REGISTRY_HOST") ?? "0.0.0.0",
      port: parseInt(Deno.env.get("REGISTRY_PORT") ?? "15000", 10),
    },
    storage: {
      rootDirectory: Deno.env.get("REGISTRY_STORAGE_PATH") ?? "./data",
    },
    log: {
      level: parseLogLevel(Deno.env.get("REGISTRY_LOG_LEVEL")),
    },
  };
}

function parseLogLevel(
  level: string | undefined,
): "debug" | "info" | "warn" | "error" {
  switch (level?.toLowerCase()) {
    case "debug":
      return "debug";
    case "warn":
      return "warn";
    case "error":
      return "error";
    case "info":
    default:
      return "info";
  }
}

/** Global configuration instance */
let config: RegistryConfig | null = null;

/**
 * Gets the current configuration, loading it if necessary.
 */
export function getConfig(): RegistryConfig {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

/**
 * Resets the configuration (useful for testing).
 */
export function resetConfig(): void {
  config = null;
}
