/**
 * Structured logging middleware for the container registry.
 * Provides JSON-formatted logs with request tracing for production use.
 */

import type { Context, Next } from "hono";
import type { LogConfig } from "../config.ts";

/**
 * Log levels with numeric priority for filtering.
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Base log entry structure for all log messages.
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  request_id?: string;
  [key: string]: unknown;
}

/**
 * Request-specific log entry with HTTP details.
 */
export interface RequestLogEntry extends LogEntry {
  method: string;
  path: string;
  status?: number;
  duration_ms?: number;
  user?: string;
  client_ip?: string;
  user_agent?: string;
  bytes_received?: number;
  bytes_sent?: number;
}

/**
 * Generates a unique request ID.
 */
export function generateRequestId(): string {
  return crypto.randomUUID().split("-")[0];
}

/**
 * Logger class for structured logging.
 */
export class Logger {
  private config: LogConfig;
  private requestId?: string;

  constructor(config: LogConfig, requestId?: string) {
    this.config = config;
    this.requestId = requestId;
  }

  /**
   * Creates a child logger with a request ID for request-scoped logging.
   */
  withRequestId(requestId: string): Logger {
    return new Logger(this.config, requestId);
  }

  /**
   * Checks if the given level should be logged based on configured level.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Formats and outputs a log entry.
   */
  private log(level: LogLevel, message: string, extra: Record<string, unknown> = {}): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(this.requestId && { request_id: this.requestId }),
      ...this.sanitize(extra),
    };

    const output = this.format(entry);
    
    // Use appropriate console method based on level
    switch (level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }

  /**
   * Formats a log entry based on configured format.
   */
  private format(entry: LogEntry): string {
    if (this.config.format === "pretty") {
      return this.formatPretty(entry);
    }
    return JSON.stringify(entry);
  }

  /**
   * Formats a log entry in human-readable format for development.
   */
  private formatPretty(entry: LogEntry): string {
    const { timestamp, level, message, request_id, method, path, status, duration_ms, ...rest } = entry as RequestLogEntry;
    
    const levelPadded = level.toUpperCase().padEnd(5);
    const reqId = request_id ? `[${request_id}]` : "";
    
    // Build request info string if HTTP fields are present
    let requestInfo = "";
    if (method && path) {
      requestInfo = ` ${method} ${path}`;
      if (status !== undefined) {
        requestInfo += ` ${status}`;
      }
      if (duration_ms !== undefined) {
        requestInfo += ` ${duration_ms}ms`;
      }
    }

    // Build extra fields string
    const extraFields = Object.entries(rest)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");

    return `${timestamp} ${levelPadded} ${reqId}${requestInfo} ${message}${extraFields ? ` ${extraFields}` : ""}`.trim();
  }

  /**
   * Sanitizes log data to mask sensitive information.
   */
  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ["password", "token", "authorization", "secret", "key", "credential"];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        result[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  debug(message: string, extra: Record<string, unknown> = {}): void {
    this.log("debug", message, extra);
  }

  info(message: string, extra: Record<string, unknown> = {}): void {
    this.log("info", message, extra);
  }

  warn(message: string, extra: Record<string, unknown> = {}): void {
    this.log("warn", message, extra);
  }

  error(message: string, extra: Record<string, unknown> = {}): void {
    this.log("error", message, extra);
  }
}

/**
 * Global logger instance.
 */
let globalLogger: Logger | null = null;

/**
 * Gets or creates the global logger instance.
 */
export function getLogger(config?: LogConfig): Logger {
  if (!globalLogger && config) {
    globalLogger = new Logger(config);
  }
  if (!globalLogger) {
    // Fallback to default config
    globalLogger = new Logger({ level: "info", format: "json" });
  }
  return globalLogger;
}

/**
 * Resets the global logger (useful for testing).
 */
export function resetLogger(): void {
  globalLogger = null;
}

/**
 * Extracts the client IP from a request.
 */
function getClientIp(c: Context): string | undefined {
  // Check common proxy headers first
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = c.req.header("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Hono doesn't directly expose the socket IP, return undefined
  return undefined;
}

/**
 * Extracts the authenticated user from context.
 */
function getUser(c: Context): string | undefined {
  // Check for token payload (JWT auth)
  const tokenPayload = c.get("tokenPayload");
  if (tokenPayload?.sub) {
    return tokenPayload.sub as string;
  }

  // Check for username set by auth middleware
  const username = c.get("username");
  if (username) {
    return username as string;
  }

  // Try to parse from Basic auth header (don't log password)
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const colonIndex = decoded.indexOf(":");
      if (colonIndex > 0) {
        return decoded.slice(0, colonIndex);
      }
    } catch {
      // Ignore decoding errors
    }
  }

  return undefined;
}

/**
 * Creates structured logging middleware.
 * Generates request IDs and logs request start/completion with timing.
 */
export function createLoggingMiddleware(config: LogConfig) {
  const logger = getLogger(config);

  return async (c: Context, next: Next) => {
    const requestId = generateRequestId();
    const requestLogger = logger.withRequestId(requestId);
    const startTime = performance.now();

    // Store logger and request ID in context for use by other middleware/routes
    c.set("logger", requestLogger);
    c.set("requestId", requestId);

    // Extract request details
    const method = c.req.method;
    const path = c.req.path;
    const userAgent = c.req.header("user-agent");
    const clientIp = getClientIp(c);

    // Log request start (debug level)
    requestLogger.debug("request started", {
      method,
      path,
      client_ip: clientIp,
      user_agent: userAgent,
    });

    try {
      await next();
    } catch (error) {
      // Log error
      const durationMs = Math.round(performance.now() - startTime);
      requestLogger.error("request error", {
        method,
        path,
        duration_ms: durationMs,
        client_ip: clientIp,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Calculate duration
    const durationMs = Math.round(performance.now() - startTime);
    const status = c.res.status;
    const user = getUser(c);

    // Add X-Request-ID header to response
    c.header("X-Request-ID", requestId);

    // Determine log level based on status
    const logLevel: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const message = status >= 500 ? "request error" : status >= 400 ? "request failed" : "request completed";

    // Log request completion
    requestLogger[logLevel](message, {
      method,
      path,
      status,
      duration_ms: durationMs,
      user,
      client_ip: clientIp,
      user_agent: userAgent,
    });
  };
}
