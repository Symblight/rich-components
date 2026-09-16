import { reconcileChunk } from "./streamHelpers.js";

/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxMessageChunk } from "../types/adapter.js" */

/**
 * The batching/flush-interval accumulator — coalesces N chunks targeting the same messageId into
 * one `onFlush` call, keyed by messageId so concurrent streams for different messages don't share
 * (or corrupt) each other's batching window.
 * @param {{flushInterval?: number, onFlush: (messages: ChxMessage[], conversationId?: string) => void}} options
 */
export function createChunkBuffer({ flushInterval = 16, onFlush }) {
  /** @type {Map<string, {accumulator: ChxMessage[], timer: ReturnType<typeof setTimeout> | null, conversationId?: string}>} */
  const batches = new Map();

  /**
   * @param {ChxMessageChunk} chunk
   * @param {ChxMessage[]} messages
   * @param {string} [userId]
   * @param {string} [replyToId]
   * @param {string} [conversationId] - stamped once, at batch creation, and handed back to onFlush —
   *   only the first chunk for a given messageId can create a shell, see getOrCreateMessage
   */
  function push(chunk, messages, userId, replyToId, conversationId) {
    let batch = batches.get(chunk.messageId);
    if (!batch) batch = { accumulator: messages, timer: null, conversationId };
    batch.accumulator = reconcileChunk(batch.accumulator, chunk, userId, replyToId, conversationId);
    batches.set(chunk.messageId, batch);
    if (!batch.timer) batch.timer = setTimeout(() => flush(chunk.messageId), flushInterval);
  }

  /** @param {string} messageId */
  function flush(messageId) {
    const batch = batches.get(messageId);
    if (!batch) return;
    if (batch.timer) clearTimeout(batch.timer);
    batches.delete(messageId);
    onFlush(batch.accumulator, batch.conversationId);
  }

  function flushAll() {
    for (const messageId of [...batches.keys()]) flush(messageId);
  }

  return { push, flush, flushAll };
}
