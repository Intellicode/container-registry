/**
 * Stream utilities for reading and transforming streams.
 */

import { concat } from "@std/bytes";

/**
 * Converts a ReadableStream to a Uint8Array by collecting all chunks.
 *
 * Note: This buffers the entire stream content in memory.
 * For very large streams, consider using streaming approaches instead.
 *
 * @param stream - Input stream to read
 * @returns Complete content as a single Uint8Array
 */
export async function streamToUint8Array(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks = await Array.fromAsync(stream);
  return concat(chunks);
}

/**
 * Creates a ReadableStream from a Uint8Array.
 *
 * @param data - Data to convert to a stream
 * @returns ReadableStream that yields the data
 */
export function uint8ArrayToStream(
  data: Uint8Array,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

/**
 * Creates a limited ReadableStream that reads up to a specified number of bytes.
 *
 * @param reader - Reader from the source stream (caller must manage lock)
 * @param bytesToRead - Maximum number of bytes to read
 * @param onCancel - Optional callback when stream is cancelled
 * @returns ReadableStream limited to the specified bytes
 */
export function createLimitedStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  bytesToRead: number,
  onCancel?: () => Promise<void>,
): ReadableStream<Uint8Array> {
  let remainingBytes = bytesToRead;
  let lockReleased = false;

  return new ReadableStream({
    async pull(controller) {
      try {
        if (remainingBytes <= 0) {
          if (!lockReleased) {
            lockReleased = true;
            reader.releaseLock();
          }
          controller.close();
          return;
        }

        const { done, value } = await reader.read();
        if (done) {
          if (!lockReleased) {
            lockReleased = true;
            reader.releaseLock();
          }
          controller.close();
          return;
        }

        const toEnqueue = value.slice(
          0,
          Math.min(value.length, remainingBytes),
        );
        controller.enqueue(toEnqueue);
        remainingBytes -= toEnqueue.length;

        if (remainingBytes <= 0) {
          if (!lockReleased) {
            lockReleased = true;
            reader.releaseLock();
          }
          controller.close();
        }
      } catch (error) {
        if (!lockReleased) {
          lockReleased = true;
          reader.releaseLock();
        }
        controller.error(error);
      }
    },
    async cancel() {
      if (!lockReleased) {
        lockReleased = true;
        reader.releaseLock();
      }
      if (onCancel) {
        await onCancel();
      }
    },
  });
}
