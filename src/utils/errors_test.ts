/**
 * Unit tests for OCI error utilities.
 */

import { assertEquals } from "@std/assert";
import { ErrorCodes, ErrorStatusCodes } from "../types/errors.ts";
import {
  blobUnknown,
  blobUploadInvalid,
  blobUploadUnknown,
  denied,
  digestInvalid,
  manifestBlobUnknown,
  manifestInvalid,
  manifestUnknown,
  nameInvalid,
  nameUnknown,
  ociError,
  sizeInvalid,
  tooManyRequests,
  unauthorized,
  unsupported,
} from "./errors.ts";

Deno.test("ociError - creates proper error response", async () => {
  const response = ociError(
    ErrorCodes.BLOB_UNKNOWN,
    "test error message",
    { some: "detail" },
  );

  assertEquals(response.status, 404);
  assertEquals(
    response.headers.get("Content-Type"),
    "application/json",
  );

  const body = await response.json();
  assertEquals(body, {
    errors: [
      {
        code: "BLOB_UNKNOWN",
        message: "test error message",
        detail: { some: "detail" },
      },
    ],
  });
});

Deno.test("ociError - works without detail", async () => {
  const response = ociError(ErrorCodes.UNAUTHORIZED, "auth required");

  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.errors[0].code, "UNAUTHORIZED");
  assertEquals(body.errors[0].message, "auth required");
  assertEquals(body.errors[0].detail, undefined);
});

Deno.test("blobUnknown - returns 404", async () => {
  const digest = "sha256:abc123";
  const response = blobUnknown(digest);

  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.errors[0].code, "BLOB_UNKNOWN");
  assertEquals(body.errors[0].detail, { digest });
});

Deno.test("blobUploadInvalid - returns 400", async () => {
  const response = blobUploadInvalid("upload failed");

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.errors[0].code, "BLOB_UPLOAD_INVALID");
});

Deno.test("blobUploadUnknown - returns 404", async () => {
  const uuid = "test-uuid-123";
  const response = blobUploadUnknown(uuid);

  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.errors[0].code, "BLOB_UPLOAD_UNKNOWN");
  assertEquals(body.errors[0].detail, { uuid });
});

Deno.test("digestInvalid - returns 400", async () => {
  const digest = "invalid-digest";
  const response = digestInvalid(digest, "malformed");

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.errors[0].code, "DIGEST_INVALID");
  assertEquals(body.errors[0].detail, { digest });
});

Deno.test("manifestBlobUnknown - returns 404", async () => {
  const digest = "sha256:def456";
  const response = manifestBlobUnknown(digest);

  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.errors[0].code, "MANIFEST_BLOB_UNKNOWN");
});

Deno.test("manifestInvalid - returns 400", async () => {
  const response = manifestInvalid("invalid schema");

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.errors[0].code, "MANIFEST_INVALID");
});

Deno.test("manifestUnknown - returns 404", async () => {
  const reference = "latest";
  const response = manifestUnknown(reference);

  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.errors[0].code, "MANIFEST_UNKNOWN");
  assertEquals(body.errors[0].detail, { reference });
});

Deno.test("nameInvalid - returns 400", async () => {
  const name = "INVALID-NAME";
  const response = nameInvalid(name, "uppercase not allowed");

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.errors[0].code, "NAME_INVALID");
  assertEquals(body.errors[0].detail, { name });
});

Deno.test("nameUnknown - returns 404", async () => {
  const name = "myapp/myimage";
  const response = nameUnknown(name);

  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.errors[0].code, "NAME_UNKNOWN");
  assertEquals(body.errors[0].detail, { name });
});

Deno.test("sizeInvalid - returns 400", async () => {
  const response = sizeInvalid("size mismatch");

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.errors[0].code, "SIZE_INVALID");
});

Deno.test("unauthorized - returns 401", async () => {
  const response = unauthorized();

  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.errors[0].code, "UNAUTHORIZED");
  assertEquals(body.errors[0].message, "authentication required");
});

Deno.test("denied - returns 403", async () => {
  const response = denied("access denied");

  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.errors[0].code, "DENIED");
});

Deno.test("unsupported - returns 415", async () => {
  const response = unsupported("media type not supported");

  assertEquals(response.status, 415);
  const body = await response.json();
  assertEquals(body.errors[0].code, "UNSUPPORTED");
});

Deno.test("tooManyRequests - returns 429", async () => {
  const response = tooManyRequests();

  assertEquals(response.status, 429);
  const body = await response.json();
  assertEquals(body.errors[0].code, "TOOMANYREQUESTS");
});

Deno.test("all error codes have correct status codes", () => {
  assertEquals(ErrorStatusCodes[ErrorCodes.BLOB_UNKNOWN], 404);
  assertEquals(ErrorStatusCodes[ErrorCodes.BLOB_UPLOAD_INVALID], 400);
  assertEquals(ErrorStatusCodes[ErrorCodes.BLOB_UPLOAD_UNKNOWN], 404);
  assertEquals(ErrorStatusCodes[ErrorCodes.DIGEST_INVALID], 400);
  assertEquals(ErrorStatusCodes[ErrorCodes.MANIFEST_BLOB_UNKNOWN], 404);
  assertEquals(ErrorStatusCodes[ErrorCodes.MANIFEST_INVALID], 400);
  assertEquals(ErrorStatusCodes[ErrorCodes.MANIFEST_UNKNOWN], 404);
  assertEquals(ErrorStatusCodes[ErrorCodes.NAME_INVALID], 400);
  assertEquals(ErrorStatusCodes[ErrorCodes.NAME_UNKNOWN], 404);
  assertEquals(ErrorStatusCodes[ErrorCodes.SIZE_INVALID], 400);
  assertEquals(ErrorStatusCodes[ErrorCodes.UNAUTHORIZED], 401);
  assertEquals(ErrorStatusCodes[ErrorCodes.DENIED], 403);
  assertEquals(ErrorStatusCodes[ErrorCodes.UNSUPPORTED], 415);
  assertEquals(ErrorStatusCodes[ErrorCodes.TOOMANYREQUESTS], 429);
});
