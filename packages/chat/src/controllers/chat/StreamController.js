import { createChunkBuffer } from "../../stream/streamDeltaBuffer.js";
import { processStream } from "../../stream/processStream.js";

/** @import { ReactiveControllerHost } from "lit" */
/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxMessageChunk, ChxMessageEnvelope } from "../../types/adapter.js" */

/** Glues the pure batching/reconciliation in `src/stream/` to a host's lifecycle. */
export class StreamController {
  /** @type {Set<string>} */
  #seenEventIds = new Set();
  /** @type {ReturnType<typeof createChunkBuffer>} */
  #buffer;

  /**
   * @param {ReactiveControllerHost} host
   * @param {{
   *   getMessages: () => ChxMessage[],
   *   getUserId: () => string | undefined,
   *   onMessagesChange: (messages: ChxMessage[], conversationId?: string) => void,
   *   chunkBatchIntervalMs?: number,
   * }} options
   */
  constructor(host, { getMessages, getUserId, onMessagesChange, chunkBatchIntervalMs }) {
    this.#buffer = createChunkBuffer({
      flushInterval: chunkBatchIntervalMs,
      getMessages,
      getUserId,
      onFlush: onMessagesChange,
    });
    host.addController(this);
  }

  /** Unwraps an envelope and drops an already-seen `eventId`, the same for both transports.
   *  @param {ChxMessageChunk | ChxMessageEnvelope} item @returns {ChxMessageChunk | null} */
  #ingest(item) {
    const envelope = "chunk" in item ? item : { chunk: item };
    if (envelope.eventId) {
      if (this.#seenEventIds.has(envelope.eventId)) return null;
      this.#seenEventIds.add(envelope.eventId);
    }
    const { chunk } = envelope;
    if (!chunk.messageId) {
      console.error('[chx-chat] chunk missing required "messageId"', chunk);
    } else if (
      chunk.kind !== "finish" &&
      chunk.kind !== "abort" &&
      !("partId" in chunk && chunk.partId)
    ) {
      console.error('[chx-chat] chunk missing required "partId"', chunk);
    }
    return chunk;
  }

  /** `adapter.subscribe`'s `onChunk`. @param {ChxMessageChunk | ChxMessageEnvelope} item */
  applyChunk(item) {
    const chunk = this.#ingest(item);
    if (chunk) this.#buffer.push(chunk);
  }

  /**
   * @param {ReadableStream<ChxMessageChunk | ChxMessageEnvelope>} stream
   * @param {{replyToId?: string, conversationId?: string}} [options]
   */
  async deliverStream(stream, { replyToId, conversationId } = {}) {
    await processStream(stream, {
      buffer: this.#buffer,
      ingest: (item) => this.#ingest(item),
      replyToId,
      conversationId,
    });
  }

  /** Flushes buffered chunks so a debounced batch isn't lost. */
  hostDisconnected() {
    this.#buffer.flushAll();
  }
}
