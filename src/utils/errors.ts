/**
 * OCI-compliant error response utilities.
 */

import {
  type ErrorCode,
  ErrorCodes,
  ErrorStatusCodes,
  type OCIErrorResponse,
} from "../types/errors.ts";

/**
 * Creates an OCI-compliant JSON error response.
 *
 * @param code - The OCI error code
 * @param message - Human-readable error message
 * @param detail - Optional additional error details
 * @returns Response object with proper status code and error payload
 */
export function ociError(
  code: ErrorCode,
  message: string,
  detail?: unknown,
): Response {
  const statusCode = ErrorStatusCodes[code];
  const body: OCIErrorResponse = {
    errors: [
      {
        code,
        message,
        ...(detail !== undefined && { detail }),
      },
    ],
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

// Convenience functions for common errors

/**
 * Returns a BLOB_UNKNOWN error response.
 *
 * @param digest - The blob digest that was not found
 * @returns 404 error response
 */
export function blobUnknown(digest: string): Response {
  return ociError(
    ErrorCodes.BLOB_UNKNOWN,
    `blob ${digest} not found`,
    { digest },
  );
}

/**
 * Returns a BLOB_UPLOAD_INVALID error response.
 *
 * @param message - Description of what's invalid
 * @param detail - Optional additional details
 * @returns 400 error response
 */
export function blobUploadInvalid(
  message: string,
  detail?: unknown,
): Response {
  return ociError(ErrorCodes.BLOB_UPLOAD_INVALID, message, detail);
}

/**
 * Returns a BLOB_UPLOAD_UNKNOWN error response.
 *
 * @param uuid - The upload session UUID that was not found
 * @returns 404 error response
 */
export function blobUploadUnknown(uuid: string): Response {
  return ociError(
    ErrorCodes.BLOB_UPLOAD_UNKNOWN,
    `blob upload session ${uuid} not found`,
    { uuid },
  );
}

/**
 * Returns a DIGEST_INVALID error response.
 *
 * @param digest - The invalid digest
 * @param reason - Optional reason why it's invalid
 * @returns 400 error response
 */
export function digestInvalid(digest: string, reason?: string): Response {
  return ociError(
    ErrorCodes.DIGEST_INVALID,
    reason ? `invalid digest ${digest}: ${reason}` : `invalid digest ${digest}`,
    { digest },
  );
}

/**
 * Returns a MANIFEST_BLOB_UNKNOWN error response.
 *
 * @param digest - The blob digest referenced by manifest but not found
 * @returns 404 error response
 */
export function manifestBlobUnknown(digest: string): Response {
  return ociError(
    ErrorCodes.MANIFEST_BLOB_UNKNOWN,
    `manifest references unknown blob ${digest}`,
    { digest },
  );
}

/**
 * Returns a MANIFEST_INVALID error response.
 *
 * @param message - Description of what's invalid
 * @param detail - Optional additional details
 * @returns 400 error response
 */
export function manifestInvalid(message: string, detail?: unknown): Response {
  return ociError(ErrorCodes.MANIFEST_INVALID, message, detail);
}

/**
 * Returns a MANIFEST_UNKNOWN error response.
 *
 * @param reference - The manifest reference (tag or digest) that was not found
 * @returns 404 error response
 */
export function manifestUnknown(reference: string): Response {
  return ociError(
    ErrorCodes.MANIFEST_UNKNOWN,
    `manifest ${reference} not found`,
    { reference },
  );
}

/**
 * Returns a NAME_INVALID error response.
 *
 * @param name - The invalid repository name
 * @param reason - Optional reason why it's invalid
 * @returns 400 error response
 */
export function nameInvalid(name: string, reason?: string): Response {
  return ociError(
    ErrorCodes.NAME_INVALID,
    reason
      ? `invalid repository name ${name}: ${reason}`
      : `invalid repository name ${name}`,
    { name },
  );
}

/**
 * Returns a NAME_UNKNOWN error response.
 *
 * @param name - The repository name that was not found
 * @returns 404 error response
 */
export function nameUnknown(name: string): Response {
  return ociError(
    ErrorCodes.NAME_UNKNOWN,
    `repository ${name} not found`,
    { name },
  );
}

/**
 * Returns a SIZE_INVALID error response.
 *
 * @param message - Description of the size issue
 * @param detail - Optional additional details
 * @returns 400 error response
 */
export function sizeInvalid(message: string, detail?: unknown): Response {
  return ociError(ErrorCodes.SIZE_INVALID, message, detail);
}

/**
 * Returns an UNAUTHORIZED error response.
 *
 * @param message - Optional custom message (defaults to generic message)
 * @returns 401 error response
 */
export function unauthorized(
  message = "authentication required",
): Response {
  return ociError(ErrorCodes.UNAUTHORIZED, message);
}

/**
 * Returns a DENIED error response.
 *
 * @param message - Description of what was denied
 * @param detail - Optional additional details
 * @returns 403 error response
 */
export function denied(message: string, detail?: unknown): Response {
  return ociError(ErrorCodes.DENIED, message, detail);
}

/**
 * Returns an UNSUPPORTED error response.
 *
 * @param message - Description of what's unsupported
 * @param detail - Optional additional details
 * @returns 415 error response
 */
export function unsupported(message: string, detail?: unknown): Response {
  return ociError(ErrorCodes.UNSUPPORTED, message, detail);
}

/**
 * Returns a TOOMANYREQUESTS error response.
 *
 * @param message - Optional custom message
 * @returns 429 error response
 */
export function tooManyRequests(
  message = "too many requests",
): Response {
  return ociError(ErrorCodes.TOOMANYREQUESTS, message);
}

/**
 * Returns a MANIFEST_UNACCEPTABLE error response.
 *
 * @param message - Description of why the manifest is not acceptable
 * @param detail - Optional additional details
 * @returns 406 error response
 */
export function manifestUnacceptable(
  message: string,
  detail?: unknown,
): Response {
  return ociError(ErrorCodes.MANIFEST_UNACCEPTABLE, message, detail);
}
