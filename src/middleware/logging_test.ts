/**
 * Tests for structured logging middleware.
 */

import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import { Hono } from "hono";
import {
  createLoggingMiddleware,
  generateRequestId,
  getLogger,
  Logger,
  resetLogger,
} from "./logging.ts";
import type { LogConfig } from "../config.ts";

Deno.test("generateRequestId - returns unique IDs", () => {
  const id1 = generateRequestId();
  const id2 = generateRequestId();
  
  assertEquals(typeof id1, "string");
  assertEquals(typeof id2, "string");
  // IDs should be 8 characters (first segment of UUID)
  assertEquals(id1.length, 8);
  assertEquals(id2.length, 8);
  // IDs should be different
  assertEquals(id1 !== id2, true);
});

Deno.test("Logger - respects log levels", async (t) => {
  await t.step("debug level logs everything", () => {
    const config: LogConfig = { level: "debug", format: "json" };
    const logger = new Logger(config);
    
    // Capture console output
    const logs: string[] = [];
    const originalDebug = console.debug;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.debug = (msg: string) => logs.push(msg);
    console.info = (msg: string) => logs.push(msg);
    console.warn = (msg: string) => logs.push(msg);
    console.error = (msg: string) => logs.push(msg);
    
    try {
      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");
      
      assertEquals(logs.length, 4);
    } finally {
      console.debug = originalDebug;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });

  await t.step("info level filters debug", () => {
    const config: LogConfig = { level: "info", format: "json" };
    const logger = new Logger(config);
    
    const logs: string[] = [];
    const originalDebug = console.debug;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.debug = (msg: string) => logs.push(msg);
    console.info = (msg: string) => logs.push(msg);
    console.warn = (msg: string) => logs.push(msg);
    console.error = (msg: string) => logs.push(msg);
    
    try {
      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");
      
      assertEquals(logs.length, 3); // debug should be filtered
    } finally {
      console.debug = originalDebug;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });

  await t.step("error level only logs errors", () => {
    const config: LogConfig = { level: "error", format: "json" };
    const logger = new Logger(config);
    
    const logs: string[] = [];
    const originalDebug = console.debug;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.debug = (msg: string) => logs.push(msg);
    console.info = (msg: string) => logs.push(msg);
    console.warn = (msg: string) => logs.push(msg);
    console.error = (msg: string) => logs.push(msg);
    
    try {
      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");
      
      assertEquals(logs.length, 1); // only error should be logged
    } finally {
      console.debug = originalDebug;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });
});

Deno.test("Logger - JSON format outputs valid JSON", () => {
  const config: LogConfig = { level: "info", format: "json" };
  const logger = new Logger(config);
  
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (msg: string) => logs.push(msg);
  
  try {
    logger.info("test message", { extra: "data" });
    
    assertEquals(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assertEquals(parsed.level, "info");
    assertEquals(parsed.message, "test message");
    assertEquals(parsed.extra, "data");
    assertMatch(parsed.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally {
    console.info = originalInfo;
  }
});

Deno.test("Logger - pretty format outputs human-readable", () => {
  const config: LogConfig = { level: "info", format: "pretty" };
  const logger = new Logger(config);
  
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (msg: string) => logs.push(msg);
  
  try {
    logger.info("test message");
    
    assertEquals(logs.length, 1);
    assertStringIncludes(logs[0], "INFO");
    assertStringIncludes(logs[0], "test message");
  } finally {
    console.info = originalInfo;
  }
});

Deno.test("Logger - includes request ID when set", () => {
  const config: LogConfig = { level: "info", format: "json" };
  const logger = new Logger(config);
  const requestLogger = logger.withRequestId("abc123");
  
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (msg: string) => logs.push(msg);
  
  try {
    requestLogger.info("test message");
    
    const parsed = JSON.parse(logs[0]);
    assertEquals(parsed.request_id, "abc123");
  } finally {
    console.info = originalInfo;
  }
});

Deno.test("Logger - sanitizes sensitive data", () => {
  const config: LogConfig = { level: "info", format: "json" };
  const logger = new Logger(config);
  
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (msg: string) => logs.push(msg);
  
  try {
    logger.info("test message", {
      username: "alice",
      password: "secret123",
      token: "jwt-token",
      api_key: "key123",
    });
    
    const parsed = JSON.parse(logs[0]);
    assertEquals(parsed.username, "alice");
    assertEquals(parsed.password, "[REDACTED]");
    assertEquals(parsed.token, "[REDACTED]");
    assertEquals(parsed.api_key, "[REDACTED]");
  } finally {
    console.info = originalInfo;
  }
});

Deno.test("Logger - sanitizes nested sensitive data", () => {
  const config: LogConfig = { level: "info", format: "json" };
  const logger = new Logger(config);
  
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (msg: string) => logs.push(msg);
  
  try {
    logger.info("test message", {
      user: {
        name: "alice",
        auth: {
          password: "secret",
        },
      },
    });
    
    const parsed = JSON.parse(logs[0]);
    assertEquals(parsed.user.name, "alice");
    assertEquals(parsed.user.auth.password, "[REDACTED]");
  } finally {
    console.info = originalInfo;
  }
});

Deno.test("getLogger - returns singleton", () => {
  resetLogger();
  
  const config: LogConfig = { level: "info", format: "json" };
  const logger1 = getLogger(config);
  const logger2 = getLogger();
  
  assertEquals(logger1, logger2);
  
  resetLogger();
});

Deno.test("createLoggingMiddleware - adds X-Request-ID header", async () => {
  resetLogger();
  
  const config: LogConfig = { level: "error", format: "json" }; // error level to reduce noise
  const app = new Hono();
  
  app.use("*", createLoggingMiddleware(config));
  app.get("/test", (c) => c.text("ok"));
  
  const res = await app.request("/test");
  const requestId = res.headers.get("X-Request-ID");
  
  assertEquals(res.status, 200);
  assertEquals(typeof requestId, "string");
  assertEquals(requestId!.length, 8);
  
  resetLogger();
});

Deno.test("createLoggingMiddleware - logs request completion", async () => {
  resetLogger();
  
  const logs: string[] = [];
  const originalInfo = console.info;
  const originalDebug = console.debug;
  console.info = (msg: string) => logs.push(msg);
  console.debug = (msg: string) => logs.push(msg);
  
  try {
    const config: LogConfig = { level: "info", format: "json" };
    const app = new Hono();
    
    app.use("*", createLoggingMiddleware(config));
    app.get("/test", (c) => c.text("ok"));
    
    await app.request("/test");
    
    // Should have at least one log (request completed)
    assertEquals(logs.length >= 1, true);
    
    // Check the last log is the completion log
    const lastLog = JSON.parse(logs[logs.length - 1]);
    assertEquals(lastLog.message, "request completed");
    assertEquals(lastLog.method, "GET");
    assertEquals(lastLog.path, "/test");
    assertEquals(lastLog.status, 200);
    assertEquals(typeof lastLog.duration_ms, "number");
  } finally {
    console.info = originalInfo;
    console.debug = originalDebug;
    resetLogger();
  }
});

Deno.test("createLoggingMiddleware - logs errors with error level", async () => {
  resetLogger();
  
  const logs: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  console.error = (msg: string) => logs.push(msg);
  console.warn = (msg: string) => logs.push(msg);
  console.info = (msg: string) => logs.push(msg);
  console.debug = (msg: string) => logs.push(msg);
  
  try {
    const config: LogConfig = { level: "info", format: "json" };
    const app = new Hono();
    
    app.use("*", createLoggingMiddleware(config));
    app.get("/error", () => {
      throw new Error("Test error");
    });
    
    // Need to catch the error from the app
    app.onError((_err, c) => {
      return c.text("Error", 500);
    });
    
    await app.request("/error");
    
    // Should have an error log
    const errorLogs = logs.filter(log => {
      try {
        const parsed = JSON.parse(log);
        return parsed.level === "error" || parsed.message?.includes("error");
      } catch {
        return false;
      }
    });
    
    assertEquals(errorLogs.length >= 1, true);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
    console.debug = originalDebug;
    resetLogger();
  }
});

Deno.test("createLoggingMiddleware - logs 4xx with warn level", async () => {
  resetLogger();
  
  const logs: string[] = [];
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  console.warn = (msg: string) => logs.push(msg);
  console.info = (msg: string) => logs.push(msg);
  console.debug = (msg: string) => logs.push(msg);
  
  try {
    const config: LogConfig = { level: "info", format: "json" };
    const app = new Hono();
    
    app.use("*", createLoggingMiddleware(config));
    app.get("/notfound", (c) => c.text("Not Found", 404));
    
    await app.request("/notfound");
    
    // Should have a warn log for 404
    const warnLogs = logs.filter(log => {
      try {
        const parsed = JSON.parse(log);
        return parsed.level === "warn";
      } catch {
        return false;
      }
    });
    
    assertEquals(warnLogs.length >= 1, true);
    const parsed = JSON.parse(warnLogs[0]);
    assertEquals(parsed.status, 404);
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
    console.debug = originalDebug;
    resetLogger();
  }
});

Deno.test("createLoggingMiddleware - captures user agent", async () => {
  resetLogger();
  
  const logs: string[] = [];
  const originalInfo = console.info;
  const originalDebug = console.debug;
  console.info = (msg: string) => logs.push(msg);
  console.debug = (msg: string) => logs.push(msg);
  
  try {
    const config: LogConfig = { level: "info", format: "json" };
    const app = new Hono();
    
    app.use("*", createLoggingMiddleware(config));
    app.get("/test", (c) => c.text("ok"));
    
    await app.request("/test", {
      headers: {
        "User-Agent": "docker/24.0.0",
      },
    });
    
    // Check completion log has user agent
    const lastLog = JSON.parse(logs[logs.length - 1]);
    assertEquals(lastLog.user_agent, "docker/24.0.0");
  } finally {
    console.info = originalInfo;
    console.debug = originalDebug;
    resetLogger();
  }
});

Deno.test("createLoggingMiddleware - captures client IP from x-forwarded-for", async () => {
  resetLogger();
  
  const logs: string[] = [];
  const originalInfo = console.info;
  const originalDebug = console.debug;
  console.info = (msg: string) => logs.push(msg);
  console.debug = (msg: string) => logs.push(msg);
  
  try {
    const config: LogConfig = { level: "info", format: "json" };
    const app = new Hono();
    
    app.use("*", createLoggingMiddleware(config));
    app.get("/test", (c) => c.text("ok"));
    
    await app.request("/test", {
      headers: {
        "X-Forwarded-For": "192.168.1.100, 10.0.0.1",
      },
    });
    
    // Check completion log has client IP (first from x-forwarded-for)
    const lastLog = JSON.parse(logs[logs.length - 1]);
    assertEquals(lastLog.client_ip, "192.168.1.100");
  } finally {
    console.info = originalInfo;
    console.debug = originalDebug;
    resetLogger();
  }
});

Deno.test("Logger - pretty format with request info", () => {
  const config: LogConfig = { level: "info", format: "pretty" };
  const logger = new Logger(config, "abc123");
  
  const logs: string[] = [];
  const originalInfo = console.info;
  console.info = (msg: string) => logs.push(msg);
  
  try {
    logger.info("request completed", {
      method: "GET",
      path: "/v2/myimage/manifests/latest",
      status: 200,
      duration_ms: 45,
    });
    
    assertEquals(logs.length, 1);
    assertStringIncludes(logs[0], "[abc123]");
    assertStringIncludes(logs[0], "GET");
    assertStringIncludes(logs[0], "/v2/myimage/manifests/latest");
    assertStringIncludes(logs[0], "200");
    assertStringIncludes(logs[0], "45ms");
  } finally {
    console.info = originalInfo;
  }
});
