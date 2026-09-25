import { reconcileChunk } from "./streamHelpers.js";

/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxMessageChunk } from "../types/adapter.js" */

/**
 * Coalesces N chunks per messageId into one `onFlush` call, keyed by messageId so concurrent
 * streams for different messages don't share a batching window.
 *
 * Reconciliation runs against `getMessages()` at flush time, not a snapshot taken when the batch
 * opened — an open-time snapshot let two in-flight messages clobber each other's commit. `onFlush`
 * must apply its array synchronously, or the next flush re-seeds from stale state.
 *
 * A flush reports the conversation the reconciled message actually belongs to, not the caller's —
 * `onChunk` can carry any conversation, and an adapter that never attributes a new message falls
 * back to the active conversation.
 * @param {{
 *   flushInterval?: number,
 *   getMessages: () => ChxMessage[],
 *   getUserId?: () => string | undefined,
 *   onFlush: (messages: ChxMessage[], conversationId?: string) => void,
 * }} options
 */
export function createChunkBuffer({ flushInterval = 16, getMessages, getUserId, onFlush }) {
  /** @type {Map<string, {chunks: ChxMessageChunk[], timer: ReturnType<typeof setTimeout> | null, replyToId?: string, conversationId?: string}>} */
  const batches = new Map();

  /**
   * @param {ChxMessageChunk} chunk
   * @param {{replyToId?: string, conversationId?: string}} [options] - stamped once, at batch
   *   creation, since only the first chunk for a messageId can create a shell (getOrCreateMessage);
   *   which conversation the flush *targets* is derived from the message itself, see flush()
   */
  function push(chunk, { replyToId, conversationId } = {}) {
    let batch = batches.get(chunk.messageId);
    if (!batch) {
      batch = { chunks: [], timer: null, replyToId, conversationId };
      batches.set(chunk.messageId, batch);
    }
    batch.chunks.push(chunk);
    if (!batch.timer) batch.timer = setTimeout(() => flush(chunk.messageId), flushInterval);
  }

  /** @param {string} messageId */
  function flush(messageId) {
    const batch = batches.get(messageId);
    if (!batch) return;
    if (batch.timer) clearTimeout(batch.timer);
    batches.delete(messageId); // before replaying — an onFlush that pushes again opens a fresh batch
    const userId = getUserId?.();
    let messages = getMessages();
    for (const chunk of batch.chunks) {
      messages = reconcileChunk(messages, chunk, userId, batch.replyToId, batch.conversationId);
    }
    // the reconciled message is the authority on which conversation this write is for — the caller
    // only knows on the send path, and `subscribe`'s onChunk can carry any conversation at all.
    // Searching from the tail: a message being streamed into was almost always just appended
    const target = messages.findLast((m) => m.id === messageId);
    onFlush(messages, target?.conversationId ?? batch.conversationId);
  }

  function flushAll() {
    for (const messageId of [...batches.keys()]) flush(messageId);
  }

  return { push, flush, flushAll };
}
