/**
 * Access Control Service
 *
 * Implements repository-level access control with wildcard pattern matching.
 * Supports fine-grained permissions (pull, push, delete) at the repository level.
 */

import type { AccessControlConfig } from "../config.ts";

export type Permission = "pull" | "push" | "delete";

/**
 * Access control service for validating repository permissions
 */
export class AccessControlService {
  private compiledPatterns: Map<string, RegExp> = new Map();

  constructor(private config: AccessControlConfig) {
    // Pre-compile all patterns for performance
    for (const rule of config.rules) {
      if (!this.compiledPatterns.has(rule.repository)) {
        this.compiledPatterns.set(
          rule.repository,
          this.compilePattern(rule.repository),
        );
      }
    }
  }

  /**
   * Checks if a user has permission to perform an action on a repository
   */
  checkPermission(
    username: string,
    repository: string,
    permission: Permission,
  ): boolean {
    // If access control is disabled, allow all
    if (!this.config.enabled) {
      return true;
    }

    // Admin users bypass all access checks
    if (this.config.adminUsers.includes(username)) {
      return true;
    }

    // Evaluate rules in order, first match wins
    for (const rule of this.config.rules) {
      if (this.matchesPattern(repository, rule.repository)) {
        // Check if user is in the rule's user list
        if (rule.users.includes("*") || rule.users.includes(username)) {
          // Check if permission is granted
          return rule.permissions.includes(permission);
        }
      }
    }

    // No matching rule found, apply default policy
    return this.config.defaultPolicy === "allow";
  }

  /**
   * Compiles a glob-style pattern into a RegExp
   */
  private compilePattern(pattern: string): RegExp {
    // Escape special regex characters except * and /
    let regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&");

    // Replace double-star with a placeholder to distinguish from single-star
    regexPattern = regexPattern.replace(/\*\*/g, "DOUBLESTAR");

    // Replace single star with pattern that matches anything except /
    regexPattern = regexPattern.replace(/\*/g, "[^/]+");

    // Replace double-star placeholder with pattern that matches anything including /
    regexPattern = regexPattern.replace(/DOUBLESTAR/g, ".*");

    // Anchor to start and end
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Checks if a repository name matches a pattern
   */
  private matchesPattern(repository: string, pattern: string): boolean {
    const regex = this.compiledPatterns.get(pattern);
    if (!regex) {
      // Pattern not pre-compiled, compile on the fly
      return this.compilePattern(pattern).test(repository);
    }
    return regex.test(repository);
  }

  /**
   * Gets the access control configuration
   */
  getConfig(): AccessControlConfig {
    return this.config;
  }

  /**
   * Checks if access control is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Creates an AccessControlService instance
 */
export function createAccessControlService(
  config: AccessControlConfig,
): AccessControlService {
  return new AccessControlService(config);
}
