/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxMessageChunk, ChxMessageEnvelope } from "../types/adapter.js" */

/** @param {ReadableStream<ChxMessageChunk | ChxMessageEnvelope>} stream */
async function* readChunks(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Reads a `sendMessage`/`regenerate` stream to completion, feeding every ingested chunk into
 * `buffer`. Throws if the stream closes without an explicit finish/abort chunk — treated as a
 * disconnect, propagating to #deliver's existing failure path.
 * @param {ReadableStream<ChxMessageChunk | ChxMessageEnvelope>} stream
 * @param {{
 *   getMessages: () => ChxMessage[],
 *   getUserId: () => string | undefined,
 *   buffer: ReturnType<typeof import("./streamDeltaBuffer.js").createChunkBuffer>,
 *   ingest: (item: ChxMessageChunk | ChxMessageEnvelope) => ChxMessageChunk | null,
 *   replyToId?: string,
 * }} options
 */
export async function processStream(stream, { getMessages, getUserId, buffer, ingest, replyToId }) {
  let sawTerminalChunk = false;
  try {
    for await (const item of readChunks(stream)) {
      const chunk = ingest(item);
      if (!chunk) continue; // duplicate eventId — silently skipped
      if (chunk.kind === "finish" || chunk.kind === "abort") sawTerminalChunk = true;
      buffer.push(chunk, getMessages(), getUserId(), replyToId);
    }
  } finally {
    // must run on every exit path, not just a clean loop completion, or a chunk pushed just before
    // a mid-read error stays stranded on the buffer's own flush-interval timer instead of committed
    buffer.flushAll();
  }
  if (!sawTerminalChunk) {
    throw new Error("Stream ended without a finish/abort chunk — treated as a disconnect");
  }
}
