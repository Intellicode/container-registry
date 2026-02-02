/**
 * OCI Distribution Specification error types.
 * Based on https://github.com/opencontainers/distribution-spec/blob/main/spec.md#error-codes
 */

/**
 * OCI error codes as defined in the specification.
 */
export const ErrorCodes = {
  BLOB_UNKNOWN: "BLOB_UNKNOWN",
  BLOB_UPLOAD_INVALID: "BLOB_UPLOAD_INVALID",
  BLOB_UPLOAD_UNKNOWN: "BLOB_UPLOAD_UNKNOWN",
  DIGEST_INVALID: "DIGEST_INVALID",
  MANIFEST_BLOB_UNKNOWN: "MANIFEST_BLOB_UNKNOWN",
  MANIFEST_INVALID: "MANIFEST_INVALID",
  MANIFEST_UNKNOWN: "MANIFEST_UNKNOWN",
  NAME_INVALID: "NAME_INVALID",
  NAME_UNKNOWN: "NAME_UNKNOWN",
  SIZE_INVALID: "SIZE_INVALID",
  UNAUTHORIZED: "UNAUTHORIZED",
  DENIED: "DENIED",
  UNSUPPORTED: "UNSUPPORTED",
  TOOMANYREQUESTS: "TOOMANYREQUESTS",
  MANIFEST_UNACCEPTABLE: "MANIFEST_UNACCEPTABLE",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes for each error type.
 */
export const ErrorStatusCodes = {
  [ErrorCodes.BLOB_UNKNOWN]: 404,
  [ErrorCodes.BLOB_UPLOAD_INVALID]: 400,
  [ErrorCodes.BLOB_UPLOAD_UNKNOWN]: 404,
  [ErrorCodes.DIGEST_INVALID]: 400,
  [ErrorCodes.MANIFEST_BLOB_UNKNOWN]: 404,
  [ErrorCodes.MANIFEST_INVALID]: 400,
  [ErrorCodes.MANIFEST_UNKNOWN]: 404,
  [ErrorCodes.NAME_INVALID]: 400,
  [ErrorCodes.NAME_UNKNOWN]: 404,
  [ErrorCodes.SIZE_INVALID]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.DENIED]: 403,
  [ErrorCodes.UNSUPPORTED]: 415,
  [ErrorCodes.TOOMANYREQUESTS]: 429,
  [ErrorCodes.MANIFEST_UNACCEPTABLE]: 406,
} as const;

export type ErrorStatusCode = (typeof ErrorStatusCodes)[ErrorCode];

/**
 * Single error entry in an OCI error response.
 */
export interface OCIErrorEntry {
  code: ErrorCode;
  message: string;
  detail?: unknown;
}

/**
 * OCI error response format.
 */
export interface OCIErrorResponse {
  errors: OCIErrorEntry[];
}

/**
 * Custom error class for OCI registry errors.
 */
export class RegistryError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: ErrorStatusCode;
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
    this.statusCode = ErrorStatusCodes[code];
    this.detail = detail;
  }

  /**
   * Converts the error to an OCI error response format.
   */
  toResponse(): OCIErrorResponse {
    return {
      errors: [
        {
          code: this.code,
          message: this.message,
          ...(this.detail !== undefined && { detail: this.detail }),
        },
      ],
    };
  }
}
