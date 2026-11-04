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
    this.#pendingRestore = true;
    if (!this.#config.getEnabled() || previousConversationId === undefined) return;
    const position = this.#config.getViewport().positionToSave();
    // `null`: left mid-switch, what's on screen says nothing about this conversation
    if (position !== null) this.#offsets.set(previousConversationId, position);
  }

  /** Shows the armed conversation at its saved offset, or the bottom without one. Call from `updated`, after the list got its messages, unawaited. @param {string | undefined} conversationId */
  async restoreIfPending(conversationId) {
    if (!this.#pendingRestore) return;
    this.#pendingRestore = false;
    const saved = this.#config.getEnabled() && conversationId !== undefined;
    await this.#config
      .getViewport()
      .showPosition(saved ? this.#offsets.get(conversationId) : undefined);
  }

  /** @param {string} conversationId */
  forget(conversationId) {
    this.#offsets.delete(conversationId);
  }

  forgetAll() {
    this.#offsets.clear();
  }
}
