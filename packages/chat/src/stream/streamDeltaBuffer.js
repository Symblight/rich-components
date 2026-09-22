import { reconcileChunk } from "./streamHelpers.js";

/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxMessageChunk } from "../types/adapter.js" */

/**
 * The batching/flush-interval accumulator — coalesces N chunks targeting the same messageId into
 * one `onFlush` call, keyed by messageId so concurrent streams for different messages don't share
 * each other's batching window.
 *
 * Chunks are held, not applied, until their batch flushes; reconciliation then runs against
 * whatever `getMessages()` returns at that moment. Accumulating against a snapshot taken when the
 * batch opened is what let two in-flight messages clobber each other — the later flush committed a
 * full array that predated the earlier one, silently dropping its message. Any number of streams
 * can now interleave freely, which is the ordinary case for a messenger, not just an agent turn.
 *
 * `onFlush` must apply its array synchronously before returning, or the next flush re-seeds from
 * state that is already behind.
 *
 * A flush reports the conversation its own message belongs to, so a chunk arriving for a
 * backgrounded conversation updates that conversation's cache without re-rendering the one on
 * screen. An adapter that sends neither an explicit target nor `chunk.conversationId` for an
 * unseen message leaves it unattributed, and the host falls back to the active conversation.
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
   *   creation — only the first chunk for a given messageId can create a shell, see
   *   getOrCreateMessage. Which conversation the flush *targets* is derived from the message
   *   itself, not from this, see flush()
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
