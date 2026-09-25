import { createChunkBuffer } from "../../stream/streamDeltaBuffer.js";
import { processStream } from "../../stream/processStream.js";

/** @import { ReactiveControllerHost } from "lit" */
/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxMessageChunk, ChxMessageEnvelope } from "../../types/adapter.js" */

/**
 * The only Lit-aware piece of the streaming design — pure batching/reconciliation logic lives in
 * src/stream/, this just glues it to a host's lifecycle.
 */
export class StreamController {
  /** @type {Set<string>} */
  #seenEventIds;
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
    this.#seenEventIds = new Set();
    this.#buffer = createChunkBuffer({
      flushInterval: chunkBatchIntervalMs,
      getMessages,
      getUserId,
      onFlush: onMessagesChange,
    });
    host.addController(this);
  }

  /**
   * Normalizes a bare chunk or an envelope, dropping an already-seen eventId — the same unwrap
   * step both `applyChunk` (subscribe's onChunk) and `deliverStream` (sendMessage/regenerate's
   * stream) go through, so a duplicate is caught identically regardless of transport.
   * @param {ChxMessageChunk | ChxMessageEnvelope} item
   * @returns {ChxMessageChunk | null}
   */
  #ingest(item) {
    const envelope = "chunk" in item ? item : { chunk: item };
    if (envelope.eventId) {
      if (this.#seenEventIds.has(envelope.eventId)) return null;
      this.#seenEventIds.add(envelope.eventId);
    }
    return envelope.chunk;
  }

  /** @param {ChxMessageChunk | ChxMessageEnvelope} item */
  applyChunk(item) {
    const chunk = this.#ingest(item);
    if (!chunk) return;
    this.#buffer.push(chunk);
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

  /** Flushes any buffered chunks before the host goes away, so a debounced batch isn't lost. */
  hostDisconnected() {
    this.#buffer.flushAll();
  }
}
