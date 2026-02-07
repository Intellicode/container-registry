import { resolve } from "@std/path";

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
  uploadTimeout: number; // seconds, default 1 hour
  cleanupInterval: number; // seconds, default 5 minutes
}

export interface LogConfig {
  level: "debug" | "info" | "warn" | "error";
}

export interface TokenAuthConfig {
  realm: string;
  service: string;
  issuer: string;
  publicKey: string;
}

export interface AuthConfig {
  type: "none" | "basic" | "token";
  realm: string;
  htpasswd?: string;
  token?: TokenAuthConfig;
}

export interface PaginationConfig {
  defaultLimit: number;
  maxLimit: number;
}

export interface AccessRule {
  repository: string; // Pattern with wildcards: "myorg/*", "*"
  users: string[]; // Usernames or groups, "*" for all users
  permissions: ("pull" | "push" | "delete")[]; // Allowed actions
}

export interface AccessControlConfig {
  enabled: boolean;
  defaultPolicy: "allow" | "deny";
  adminUsers: string[]; // Users who bypass all access checks
  rules: AccessRule[];
}

export interface RegistryConfig {
  server: ServerConfig;
  storage: StorageConfig;
  log: LogConfig;
  auth: AuthConfig;
  pagination: PaginationConfig;
  access: AccessControlConfig;
}

function parsePort(portValue: string | undefined, defaultPort: number): number {
  const parsed = parseInt(portValue ?? "", 10);
  if (isNaN(parsed) || parsed < 0 || parsed > 65535) {
    return defaultPort;
  }
  return parsed;
}

/**
 * Loads configuration from environment variables with defaults.
 */
export function loadConfig(): RegistryConfig {
  return {
    server: {
      host: Deno.env.get("REGISTRY_HOST") ?? "0.0.0.0",
      port: parsePort(Deno.env.get("REGISTRY_PORT"), 15000),
    },
    storage: {
      rootDirectory: resolve(Deno.env.get("REGISTRY_STORAGE_PATH") ?? "./data"),
      uploadTimeout: parsePositiveInt(
        Deno.env.get("REGISTRY_UPLOAD_TIMEOUT"),
        3600, // 1 hour default
      ),
      cleanupInterval: parsePositiveInt(
        Deno.env.get("REGISTRY_UPLOAD_CLEANUP_INTERVAL"),
        300, // 5 minutes default
      ),
    },
    log: {
      level: parseLogLevel(Deno.env.get("REGISTRY_LOG_LEVEL")),
    },
    auth: {
      type: parseAuthType(Deno.env.get("REGISTRY_AUTH_TYPE")),
      realm: Deno.env.get("REGISTRY_AUTH_REALM") ?? "Registry",
      htpasswd: Deno.env.get("REGISTRY_AUTH_HTPASSWD"),
      token: parseTokenConfig(),
    },
    pagination: {
      defaultLimit: parsePositiveInt(
        Deno.env.get("REGISTRY_PAGINATION_DEFAULT_LIMIT"),
        100,
      ),
      maxLimit: parsePositiveInt(
        Deno.env.get("REGISTRY_PAGINATION_MAX_LIMIT"),
        1000,
      ),
    },
    access: parseAccessControlConfig(),
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

function parseAuthType(type: string | undefined): "none" | "basic" | "token" {
  switch (type?.toLowerCase()) {
    case "basic":
      return "basic";
    case "token":
      return "token";
    case "none":
    default:
      return "none";
  }
}

function parseTokenConfig(): TokenAuthConfig | undefined {
  const authType = Deno.env.get("REGISTRY_AUTH_TYPE");
  if (authType?.toLowerCase() !== "token") {
    return undefined;
  }

  const realm = Deno.env.get("REGISTRY_AUTH_TOKEN_REALM");
  const service = Deno.env.get("REGISTRY_AUTH_TOKEN_SERVICE");
  const issuer = Deno.env.get("REGISTRY_AUTH_TOKEN_ISSUER");
  const publicKey = Deno.env.get("REGISTRY_AUTH_TOKEN_PUBLICKEY");

  if (!realm || !service || !issuer || !publicKey) {
    throw new Error(
      "Token auth requires REGISTRY_AUTH_TOKEN_REALM, REGISTRY_AUTH_TOKEN_SERVICE, REGISTRY_AUTH_TOKEN_ISSUER, and REGISTRY_AUTH_TOKEN_PUBLICKEY",
    );
  }

  return {
    realm,
    service,
    issuer,
    publicKey,
  };
}

function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
): number {
  const parsed = parseInt(value ?? "", 10);
  if (isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

function parseAccessControlConfig(): AccessControlConfig {
  const enabled =
    Deno.env.get("REGISTRY_ACCESS_CONTROL_ENABLED")?.toLowerCase() === "true";
  const configPath = Deno.env.get("REGISTRY_ACCESS_CONTROL_CONFIG");

  if (!enabled || !configPath) {
    // Access control disabled - allow all by default
    return {
      enabled: false,
      defaultPolicy: "allow",
      adminUsers: [],
      rules: [],
    };
  }

  const resolvedConfigPath = resolve(configPath);

  try {
    const configContent = Deno.readTextFileSync(resolvedConfigPath);
    const config = JSON.parse(configContent);

    return {
      enabled: true,
      defaultPolicy: config.defaultPolicy === "allow" ? "allow" : "deny",
      adminUsers: Array.isArray(config.adminUsers) ? config.adminUsers : [],
      rules: Array.isArray(config.rules) ? config.rules : [],
    };
  } catch (error) {
    console.error(`Failed to load access control config: ${error}`);
    throw new Error(
      `Failed to load access control config from ${resolvedConfigPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
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
