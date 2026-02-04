/**
 * Upload session cleanup service.
 * Manages periodic cleanup of expired upload sessions.
 */

import { join } from "@std/path";

/**
 * Configuration for the upload cleanup service.
 */
export interface UploadCleanupConfig {
  rootDirectory: string;
  uploadTimeout: number; // seconds
  cleanupInterval: number; // seconds
}

/**
 * Represents an upload session with metadata.
 */
interface UploadSession {
  uuid: string;
  startedAt: Date;
  path: string;
}

/**
 * Upload cleanup service that periodically removes expired upload sessions.
 */
export class UploadCleanupService {
  private intervalId: number | null = null;
  private config: UploadCleanupConfig;

  constructor(config: UploadCleanupConfig) {
    this.config = config;
  }

  /**
   * Start the cleanup service.
   */
  start(): void {
    if (this.intervalId !== null) {
      console.warn("Upload cleanup service already running");
      return;
    }

    console.log(
      `Starting upload cleanup service (timeout: ${this.config.uploadTimeout}s, interval: ${this.config.cleanupInterval}s)`,
    );

    // Run cleanup immediately on startup to clean up sessions from previous runs
    this.cleanup().catch((error) => {
      console.error("Error during initial cleanup:", error);
    });

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.cleanup().catch((error) => {
        console.error("Error during periodic cleanup:", error);
      });
    }, this.config.cleanupInterval * 1000);
  }

  /**
   * Stop the cleanup service.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Upload cleanup service stopped");
    }
  }

  /**
   * Perform cleanup of expired upload sessions.
   */
  private async cleanup(): Promise<void> {
    try {
      const sessions = await this.listUploadSessions();
      const now = new Date();
      const timeoutMs = this.config.uploadTimeout * 1000;
      let cleanedCount = 0;

      for (const session of sessions) {
        const age = now.getTime() - session.startedAt.getTime();
        
        if (age > timeoutMs) {
          try {
            await Deno.remove(session.path, { recursive: true });
            console.log(
              `Cleaned expired upload session: ${session.uuid} (age: ${Math.floor(age / 1000)}s)`,
            );
            cleanedCount++;
          } catch (error) {
            console.error(
              `Failed to clean upload session ${session.uuid}:`,
              error,
            );
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`Upload cleanup completed: ${cleanedCount} sessions removed`);
      }
    } catch (error) {
      console.error("Error during upload cleanup:", error);
    }
  }

  /**
   * List all upload sessions with their metadata.
   */
  private async listUploadSessions(): Promise<UploadSession[]> {
    const uploadsDir = join(this.config.rootDirectory, "uploads");
    const sessions: UploadSession[] = [];

    try {
      // Check if uploads directory exists
      try {
        await Deno.stat(uploadsDir);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          // No uploads directory yet, return empty list
          return [];
        }
        throw error;
      }

      // Read all upload session directories
      for await (const entry of Deno.readDir(uploadsDir)) {
        if (!entry.isDirectory) {
          continue;
        }

        const sessionPath = join(uploadsDir, entry.name);
        const startedAtPath = join(sessionPath, "startedat");

        try {
          // Read startedat timestamp
          const startedAtContent = await Deno.readTextFile(startedAtPath);
          const startedAt = new Date(startedAtContent.trim());

          // Validate timestamp
          if (isNaN(startedAt.getTime())) {
            console.warn(
              `Invalid startedat timestamp in session ${entry.name}, skipping`,
            );
            continue;
          }

          sessions.push({
            uuid: entry.name,
            startedAt,
            path: sessionPath,
          });
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            // Missing startedat file, assume session is corrupted and should be cleaned
            console.warn(
              `Upload session ${entry.name} missing startedat file, will be cleaned`,
            );
            sessions.push({
              uuid: entry.name,
              startedAt: new Date(0), // Very old timestamp to ensure cleanup
              path: sessionPath,
            });
          } else {
            console.error(
              `Error reading session ${entry.name}:`,
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error("Error listing upload sessions:", error);
    }

    return sessions;
  }

  /**
   * Get statistics about upload sessions.
   */
  async getStats(): Promise<{
    total: number;
    expired: number;
  }> {
    const sessions = await this.listUploadSessions();
    const now = new Date();
    const timeoutMs = this.config.uploadTimeout * 1000;

    const expired = sessions.filter((session) => {
      const age = now.getTime() - session.startedAt.getTime();
      return age > timeoutMs;
    }).length;

    return {
      total: sessions.length,
      expired,
    };
  }
}

/**
 * Create and start the upload cleanup service.
 */
export function createUploadCleanupService(
  config: UploadCleanupConfig,
): UploadCleanupService {
  const service = new UploadCleanupService(config);
  service.start();
  return service;
}
