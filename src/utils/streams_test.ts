/**
 * Tests for stream utilities.
 */

import { assertEquals } from "@std/assert";
import {
  createLimitedStream,
  streamToUint8Array,
  uint8ArrayToStream,
} from "./streams.ts";

Deno.test("streamToUint8Array - converts simple stream", async () => {
  const data = new TextEncoder().encode("hello world");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  const result = await streamToUint8Array(stream);
  assertEquals(new TextDecoder().decode(result), "hello world");
});

Deno.test("streamToUint8Array - handles chunked stream", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello "));
      controller.enqueue(new TextEncoder().encode("world"));
      controller.close();
    },
  });

  const result = await streamToUint8Array(stream);
  assertEquals(new TextDecoder().decode(result), "hello world");
});

Deno.test("streamToUint8Array - handles empty stream", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  const result = await streamToUint8Array(stream);
  assertEquals(result.length, 0);
});

Deno.test("streamToUint8Array - handles large data", async () => {
  const size = 1024 * 1024; // 1MB
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send in chunks
      const chunkSize = 64 * 1024;
      for (let i = 0; i < size; i += chunkSize) {
        controller.enqueue(data.slice(i, Math.min(i + chunkSize, size)));
      }
      controller.close();
    },
  });

  const result = await streamToUint8Array(stream);
  assertEquals(result.length, size);
  assertEquals(result[0], 0);
  assertEquals(result[size - 1], (size - 1) % 256);
});

Deno.test("uint8ArrayToStream - creates stream from Uint8Array", async () => {
  const data = new TextEncoder().encode("test data");
  const stream = uint8ArrayToStream(data);

  const result = await streamToUint8Array(stream);
  assertEquals(new TextDecoder().decode(result), "test data");
});

Deno.test("uint8ArrayToStream - handles empty array", async () => {
  const data = new Uint8Array(0);
  const stream = uint8ArrayToStream(data);

  const result = await streamToUint8Array(stream);
  assertEquals(result.length, 0);
});

Deno.test("createLimitedStream - limits bytes read", async () => {
  const data = new TextEncoder().encode("hello world");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  const reader = stream.getReader();
  const limitedStream = createLimitedStream(reader, 5);

  const result = await streamToUint8Array(limitedStream);
  assertEquals(new TextDecoder().decode(result), "hello");
});

Deno.test("createLimitedStream - handles multiple chunks", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("aaa"));
      controller.enqueue(new TextEncoder().encode("bbb"));
      controller.enqueue(new TextEncoder().encode("ccc"));
      controller.close();
    },
  });

  const reader = stream.getReader();
  const limitedStream = createLimitedStream(reader, 5);

  const result = await streamToUint8Array(limitedStream);
  assertEquals(new TextDecoder().decode(result), "aaabb");
});

Deno.test("createLimitedStream - handles exact chunk boundary", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("aaa"));
      controller.enqueue(new TextEncoder().encode("bbb"));
      controller.close();
    },
  });

  const reader = stream.getReader();
  const limitedStream = createLimitedStream(reader, 3);

  const result = await streamToUint8Array(limitedStream);
  assertEquals(new TextDecoder().decode(result), "aaa");
});

Deno.test("createLimitedStream - handles stream shorter than limit", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hi"));
      controller.close();
    },
  });

  const reader = stream.getReader();
  const limitedStream = createLimitedStream(reader, 100);

  const result = await streamToUint8Array(limitedStream);
  assertEquals(new TextDecoder().decode(result), "hi");
});

Deno.test("createLimitedStream - zero limit returns empty", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello"));
      controller.close();
    },
  });

  const reader = stream.getReader();
  const limitedStream = createLimitedStream(reader, 0);

  const result = await streamToUint8Array(limitedStream);
  assertEquals(result.length, 0);
});
