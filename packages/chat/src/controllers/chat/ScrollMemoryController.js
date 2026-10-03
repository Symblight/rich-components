/** @import { ChxViewportApi } from "../../types/api.js" */

/**
 * @typedef {{
 *   getViewport: () => ChxViewportApi,
 *   getEnabled: () => boolean,
 * }} ScrollMemoryConfig
 */

/**
 * Remembers each conversation's scroll offset across switches. No host: the capture is tied to
 * `activeConversationId` changing, which only `willUpdate(changedProperties)` can see.
 */
export class ScrollMemoryController {
  /** @type {ScrollMemoryConfig} */
  #config;
  /** @type {Map<string, number | undefined>} */
  #offsets = new Map();
  #pendingRestore = false;

  /** @param {ScrollMemoryConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** Captures the conversation being left and arms the restore. Call from `willUpdate`. @param {string | undefined} previousConversationId */
  handleConversationChange(previousConversationId) {
    if (!this.#config.getEnabled()) {
      this.#pendingRestore = false;
      return;
    }
    if (previousConversationId !== undefined) {
      this.#offsets.set(previousConversationId, this.#config.getViewport().getScrollOffset());
    }
    this.#pendingRestore = true;
  }

  /** Restores the armed offset; a first visit keeps the bottom-anchored default. Call from `updated`, unawaited. @param {string | undefined} conversationId */
  async restoreIfPending(conversationId) {
    if (!this.#pendingRestore) return;
    this.#pendingRestore = false;
    const offset = conversationId === undefined ? undefined : this.#offsets.get(conversationId);
    if (offset === undefined) return;
    await this.#config.getViewport().scrollToOffset(offset);
  }

  /** @param {string} conversationId */
  forget(conversationId) {
    this.#offsets.delete(conversationId);
  }

  forgetAll() {
    this.#offsets.clear();
  }
}
