import { validate } from "@std/uuid";

/**
 * Shared validation utilities for OCI Distribution Specification compliance.
 */

/**
 * Repository name validation regex pattern.
 * Each component must match [a-z0-9]+([._-][a-z0-9]+)*
 */
const REPOSITORY_COMPONENT_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/**
 * Error message for invalid repository name.
 */
export const REPOSITORY_NAME_ERROR_MESSAGE =
  "repository name must match [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*";

/**
 * Validates repository name according to OCI distribution spec.
 * Format: [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*
 *
 * @param name - Repository name to validate
 * @returns true if valid, false otherwise
 */
export function validateRepositoryName(name: string): boolean {
  if (!name) {
    return false;
  }

  const components = name.split("/");
  for (const component of components) {
    if (!component) {
      return false;
    }
    // Each component must match [a-z0-9]+([._-][a-z0-9]+)*
    if (!REPOSITORY_COMPONENT_PATTERN.test(component)) {
      return false;
    }
    // Reject path traversal
    if (component === "." || component === "..") {
      return false;
    }
  }

  // Additional safety: ensure no backslashes or other path separators
  if (name.includes("\\") || name.includes("\0")) {
    return false;
  }

  return true;
}

/**
 * Validates UUID format to prevent path traversal attacks.
 * UUID must be a valid UUID format.
 *
 * @param uuid - UUID string to validate
 * @returns true if valid UUID format, false otherwise
 */
export function isValidUUID(uuid: string): boolean {
  return validate(uuid);
}

/**
 * Validates tag name according to OCI distribution spec.
 * Format: [a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}
 *
 * @param tag - Tag name to validate
 * @returns true if valid, false otherwise
 */
export function validateTagName(tag: string): boolean {
  if (!tag || tag.length > 128) {
    return false;
  }

  if (!/^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/.test(tag)) {
    return false;
  }

  // Reject path traversal
  if (
    tag.includes("..") ||
    tag.includes("/") ||
    tag.includes("\\") ||
    tag.includes("\0")
  ) {
    return false;
  }

  return true;
}
