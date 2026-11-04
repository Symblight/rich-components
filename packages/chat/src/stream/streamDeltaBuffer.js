import { reconcileChunk } from "./streamHelpers.js";

/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxMessageChunk } from "../types/adapter.js" */

/**
 * Coalesces chunks into one flush per interval, across messages: a replay of N messages costs one
 * pass over the history, not N. Chunks apply in arrival order, each with its own `replyToId` and
 * `conversationId`.
 *
 * Reconciliation runs against `getMessages()` at flush time, not a snapshot taken when the batch
 * opened — an open-time snapshot let two in-flight messages clobber each other's commit. `onFlush`
 * must apply its array synchronously, or the next flush re-seeds from stale state.
 *
 * `onFlush` runs once per conversation touched, with the same array holding every chunk. A flush
 * reports the conversation the reconciled message actually belongs to, not the caller's — `onChunk`
 * can carry any conversation, and an adapter that never attributes a new message falls back to the
 * active conversation.
 * @param {{
 *   flushInterval?: number,
 *   getMessages: () => ChxMessage[],
 *   getUserId?: () => string | undefined,
 *   onFlush: (messages: ChxMessage[], conversationId?: string) => void,
 * }} options
 */
export function createChunkBuffer({ flushInterval = 16, getMessages, getUserId, onFlush }) {
  /** @type {{chunk: ChxMessageChunk, replyToId?: string, conversationId?: string}[]} */
  let pending = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  /**
   * @param {ChxMessageChunk} chunk
   * @param {{replyToId?: string, conversationId?: string}} [options] - only consulted when this chunk
   *   creates a shell (getOrCreateMessage); which conversation the flush *targets* is derived from
   *   the message itself, see commit()
   */
  function push(chunk, { replyToId, conversationId } = {}) {
    pending.push({ chunk, replyToId, conversationId });
    timer ??= setTimeout(flushAll, flushInterval);
  }

  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  /** @param {typeof pending} entries */
  function commit(entries) {
    const userId = getUserId?.();
    let messages = getMessages();
    /** message id → the caller's target, for a message nothing else attributes @type {Map<string, string | undefined>} */
    const touched = new Map();
    for (const { chunk, replyToId, conversationId } of entries) {
      messages = reconcileChunk(messages, chunk, userId, replyToId, conversationId);
      if (!touched.has(chunk.messageId)) touched.set(chunk.messageId, conversationId);
    }
    // the reconciled message is the authority on which conversation this write is for — the caller
    // only knows on the send path, and `subscribe`'s onChunk can carry any conversation at all.
    // From the tail: a message being streamed into was almost always just appended
    /** @type {Set<string | undefined>} */
    const conversations = new Set();
    for (let i = messages.length - 1; i >= 0 && touched.size > 0; i--) {
      const { id, conversationId } = messages[i];
      if (!touched.has(id)) continue;
      conversations.add(conversationId ?? touched.get(id));
      touched.delete(id);
    }
    for (const conversationId of conversations) onFlush(messages, conversationId);
  }

  /** Commits one message's chunks now; the others stay pending. @param {string} messageId */
  function flush(messageId) {
    const entries = pending.filter((entry) => entry.chunk.messageId === messageId);
    if (entries.length === 0) return;
    pending = pending.filter((entry) => entry.chunk.messageId !== messageId);
    if (pending.length === 0) stopTimer();
    commit(entries);
  }

  function flushAll() {
    stopTimer();
    if (pending.length === 0) return;
    const entries = pending;
    pending = []; // before replaying — an onFlush that pushes again opens a fresh batch
    commit(entries);
  }

  return { push, flush, flushAll };
}
