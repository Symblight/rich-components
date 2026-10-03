import { DEFAULT_CONVERSATION_ID } from "../../constants.js";

/** @import { ChxConversation } from "../../types/conversation.js" */

/**
 * @typedef {{
 *   getConversationsPresent: () => boolean,
 *   getConversations: () => ChxConversation[] | undefined,
 *   getInitialConversations: () => ChxConversation[] | undefined,
 *   getInitialActiveConversationId: () => string | undefined,
 *   getActiveConversationId: () => string | undefined,
 * }} ConversationModeConfig
 */

/**
 * Single- vs multi-conversation mode and what follows from it: the routing id and the empty state.
 * Both latches are one-way. Reads are pulled live — a streamed chunk can reach `#applyMessages`
 * outside the update cycle, where a snapshot taken in `willUpdate` would be stale.
 */
export class ConversationModeController {
  /** @type {ConversationModeConfig} */
  #config;
  #usesConversations = false;
  /** Only a maintained collection can say an active id was removed — see `isEmptyState`. */
  #tracksConversations = false;

  /** @param {ConversationModeConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** Latches multi-conversation mode on the first conversation signal. Call from `connectedCallback` and `willUpdate`. */
  refresh() {
    const config = this.#config;
    // `[]` is also what a chat driven by activeConversationId alone carries, so only non-empty counts
    if (config.getConversationsPresent() || (config.getConversations()?.length ?? 0) > 0) {
      this.#tracksConversations = true;
    }
    if (this.#usesConversations) return;
    if (
      this.#tracksConversations ||
      config.getInitialConversations() !== undefined ||
      config.getInitialActiveConversationId() !== undefined ||
      config.getActiveConversationId() != null
    ) {
      this.#usesConversations = true;
    }
  }

  /**
   * The id routing keys off: the active conversation, `DEFAULT_CONVERSATION_ID` in
   * single-conversation mode, or `null` in the empty state. Never stored or sent to an adapter.
   * @returns {string | symbol | null}
   */
  get effectiveConversationId() {
    if (!this.#usesConversations) return DEFAULT_CONVERSATION_ID;
    return this.isEmptyState ? null : (this.#config.getActiveConversationId() ?? null);
  }

  /** A conversation-driven chat with no usable active conversation (cleared, or removed from a tracked collection). */
  get isEmptyState() {
    if (!this.#usesConversations) return false;
    const id = this.#config.getActiveConversationId();
    if (id == null) return true;
    if (!this.#tracksConversations) return false;
    return !this.#config.getConversations()?.some((conversation) => conversation.id === id);
  }
}
