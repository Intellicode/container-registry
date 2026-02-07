/**
 * Shared pagination utilities for OCI Distribution Specification endpoints.
 */

import { getConfig } from "../config.ts";

/**
 * Parsed pagination parameters.
 */
export interface PaginationParams {
  /** Maximum number of items to return */
  limit: number;
  /** Last item from previous page (exclusive) */
  last?: string;
}

/**
 * Parses and validates pagination query parameters.
 *
 * @param nParam - The 'n' query parameter (limit)
 * @param lastParam - The 'last' query parameter (cursor)
 * @returns Validated pagination parameters with enforced limits
 */
export function parsePaginationParams(
  nParam: string | undefined,
  lastParam: string | undefined,
): PaginationParams {
  const config = getConfig();
  let limit: number;

  if (nParam) {
    const parsed = parseInt(nParam, 10);
    if (isNaN(parsed) || parsed <= 0) {
      limit = config.pagination.defaultLimit;
    } else {
      // Enforce maximum limit
      limit = Math.min(parsed, config.pagination.maxLimit);
    }
  } else {
    limit = config.pagination.defaultLimit;
  }

  return {
    limit,
    last: lastParam,
  };
}

/**
 * Builds the Link header value for pagination.
 *
 * @param basePath - Base URL path for the endpoint
 * @param limit - Current page limit
 * @param lastItem - Last item in current page (for cursor)
 * @returns Link header value with rel="next"
 */
export function buildPaginationLink(
  basePath: string,
  limit: number,
  lastItem: string,
): string {
  const params = new URLSearchParams({
    n: limit.toString(),
    last: lastItem,
  });
  const linkUrl = `${basePath}?${params.toString()}`;
  return `<${linkUrl}>; rel="next"`;
}

/**
 * Result of applying pagination to a list.
 */
export interface PaginatedResult<T> {
  /** Items for current page */
  items: T[];
  /** Whether there are more items after this page */
  hasMore: boolean;
}

/**
 * Applies pagination logic to a fetched list.
 * Expects the list to have one extra item if there are more results.
 *
 * @param items - Items fetched (with one extra to detect more)
 * @param limit - Page limit
 * @returns Paginated result with items trimmed and hasMore flag
 */
export function applyPagination<T>(
  items: T[],
  limit: number,
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const paginatedItems = hasMore ? items.slice(0, limit) : items;

  return {
    items: paginatedItems,
    hasMore,
  };
}
