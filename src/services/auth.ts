/**
 * Authentication Service
 *
 * Implements htpasswd file parsing and credential validation with bcrypt hashing.
 * Supports HTTP Basic Authentication for the container registry.
 */

import { decodeBase64 } from "@std/encoding/base64";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

/**
 * Authentication service for validating credentials against htpasswd file
 */
export class AuthService {
  private credentials: Map<string, string> = new Map();

  /**
   * Creates a new AuthService instance
   * @param htpasswdPath - Optional path to htpasswd file to load
   */
  constructor(private htpasswdPath?: string) {}

  /**
   * Loads and parses htpasswd file from disk
   * @throws Error if file cannot be read or is malformed
   */
  async loadHtpasswdFile(): Promise<void> {
    if (!this.htpasswdPath) {
      throw new Error("htpasswd file path not configured");
    }

    try {
      const content = await Deno.readTextFile(this.htpasswdPath);
      this.parseHtpasswd(content);
    } catch (error) {
      throw new Error(
        `Failed to load htpasswd file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Parses htpasswd file content into memory
   * Format: username:$2y$10$hash...
   * @param content - Raw htpasswd file content
   */
  parseHtpasswd(content: string): void {
    this.credentials.clear();
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const parts = trimmed.split(":");
      if (parts.length < 2) {
        console.warn(`Skipping malformed htpasswd line: ${trimmed}`);
        continue;
      }

      const username = parts[0];
      const hashedPassword = parts.slice(1).join(":"); // Handle edge case where password contains ':'

      // Validate bcrypt hash format (starts with $2y$, $2a$, or $2b$)
      if (!/^\$2[ayb]\$/.test(hashedPassword)) {
        console.warn(
          `Skipping user '${username}': password not in bcrypt format`,
        );
        continue;
      }

      this.credentials.set(username, hashedPassword);
    }
  }

  /**
   * Validates username and password against stored credentials
   * Uses bcrypt for secure password comparison (constant-time)
   * @param username - Username to validate
   * @param password - Plain text password to validate
   * @returns true if credentials are valid, false otherwise
   */
  async validateCredentials(
    username: string,
    password: string,
  ): Promise<boolean> {
    const hashedPassword = this.credentials.get(username);

    if (!hashedPassword) {
      // User not found - perform dummy compare to prevent timing attacks
      await bcrypt.compare(
        password,
        "$2y$10$invalidhashinvalidhashinvalidhashinvalidhashinvalidhash",
      );
      return false;
    }

    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      console.error(`Error validating credentials: ${error}`);
      return false;
    }
  }

  /**
   * Parses Basic Auth header and returns credentials
   * @param authHeader - Authorization header value (e.g., "Basic dXNlcm5hbWU6cGFzc3dvcmQ=")
   * @returns Object with username and password, or null if invalid
   */
  static parseBasicAuth(
    authHeader: string,
  ): { username: string; password: string } | null {
    // Check if header starts with "Basic "
    if (!authHeader.startsWith("Basic ")) {
      return null;
    }

    try {
      // Extract and decode base64 credentials
      const base64Credentials = authHeader.slice(6); // Remove "Basic " prefix
      const bytes = decodeBase64(base64Credentials);
      const credentials = new TextDecoder().decode(bytes);

      // Split on first colon (password might contain colons)
      const colonIndex = credentials.indexOf(":");
      if (colonIndex === -1) {
        return null;
      }

      const username = credentials.slice(0, colonIndex);
      const password = credentials.slice(colonIndex + 1);

      // Validate that username is not empty
      if (!username) {
        return null;
      }

      return { username, password };
    } catch (error) {
      // Base64 decoding failed
      return null;
    }
  }

  /**
   * Gets the number of loaded credentials (for testing/debugging)
   */
  getCredentialCount(): number {
    return this.credentials.size;
  }
}

/**
 * Creates and initializes an AuthService instance
 * @param htpasswdPath - Path to htpasswd file
 * @returns Initialized AuthService
 */
export async function createAuthService(
  htpasswdPath?: string,
): Promise<AuthService> {
  const service = new AuthService(htpasswdPath);
  if (htpasswdPath) {
    await service.loadHtpasswdFile();
  }
  return service;
}
