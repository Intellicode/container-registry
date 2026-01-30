import { assertEquals } from "@std/assert";
import { createApp } from "./src/app.ts";

Deno.test("GET /v2/ returns 200 OK", async () => {
  const app = createApp();
  const response = await app.request("/v2/");

  assertEquals(response.status, 200);
});

Deno.test("GET /v2/ returns Docker-Distribution-API-Version header", async () => {
  const app = createApp();
  const response = await app.request("/v2/");

  assertEquals(
    response.headers.get("Docker-Distribution-API-Version"),
    "registry/2.0",
  );
});

Deno.test("GET /v2/ returns empty JSON object", async () => {
  const app = createApp();
  const response = await app.request("/v2/");
  const body = await response.json();

  assertEquals(body, {});
});
