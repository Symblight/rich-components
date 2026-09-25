import { DEFAULT_CONVERSATION_ID } from "../constants.js";

/** @import { ChxConversation } from "../types/conversation.js" */

/**
 * Decides whether a `chx-chat` is running in single- or multi-conversation mode, and what follows
 * from that: which conversation id message routing keys off, and whether the chat is in the empty
 * state. Both latches are one-way, which is the whole reason this is stateful rather than a pair of
 * pure functions — see `refresh()`.
 *
 * Reads are pulled through callbacks rather than pushed in, deliberately: `effectiveConversationId`
 * is read from `#applyMessages`, which a streamed chunk can reach outside the update cycle, and a
 * pushed snapshot taken in `willUpdate` would be stale there.
 */
export class ConversationModeController {
  /** @type {() => boolean} */
  #getConversationsPresent;
  /** @type {() => ChxConversation[] | undefined} */
  #getConversations;
  /** @type {() => ChxConversation[] | undefined} */
  #getInitialConversations;
  /** @type {() => string | undefined} */
  #getInitialActiveConversationId;
  /** @type {() => string | undefined} */
  #getActiveConversationId;

  #usesConversations = false;
  /** Latched separately from `#usesConversations`: true once the `conversations` collection is
   *  actually being maintained (a bound sidebar, or a non-empty app-provided array). Only then does
   *  a missing entry mean "removed" — see `isEmptyState`. */
  #tracksConversations = false;

  /**
   * @param {{
   *   getConversationsPresent: () => boolean,
   *   getConversations: () => ChxConversation[] | undefined,
   *   getInitialConversations: () => ChxConversation[] | undefined,
   *   getInitialActiveConversationId: () => string | undefined,
   *   getActiveConversationId: () => string | undefined,
   * }} config
   */
  constructor(config) {
    this.#getConversationsPresent = config.getConversationsPresent;
    this.#getConversations = config.getConversations;
    this.#getInitialConversations = config.getInitialConversations;
    this.#getInitialActiveConversationId = config.getInitialActiveConversationId;
    this.#getActiveConversationId = config.getActiveConversationId;
  }

  /**
   * Latches multi-conversation mode on the moment any conversation signal appears — a bound
   * `<chx-conversations>`, conversations data, or an `activeConversationId`. Never flips back, so
   * once a chat is conversation-driven, clearing or removing every conversation lands in the empty
   * state rather than reverting to the single-conversation default. Call it from `connectedCallback`
   * and `willUpdate`, to catch late-arriving signals.
   */
  refresh() {
    // A sidebar owns the collection outright; an app-provided one only counts once it's non-empty,
    // since `[]` is also what a chat driven by activeConversationId alone carries.
    if (this.#getConversationsPresent() || (this.#getConversations()?.length ?? 0) > 0) {
      this.#tracksConversations = true;
    }
    if (this.#usesConversations) return;
    if (
      this.#tracksConversations ||
      this.#getInitialConversations() !== undefined ||
      this.#getInitialActiveConversationId() !== undefined ||
      this.#getActiveConversationId() != null
    ) {
      this.#usesConversations = true;
    }
  }

  /**
   * The conversation id message routing/rendering keys off: the (string) active conversation in
   * multi-conversation mode, the `DEFAULT_CONVERSATION_ID` sentinel in single-conversation mode, or
   * `null` in the empty state. Internal only — never stored on a message or sent to an adapter.
   * @returns {string | symbol | null}
   */
  get effectiveConversationId() {
    if (!this.#usesConversations) return DEFAULT_CONVERSATION_ID;
    return this.isEmptyState ? null : (this.#getActiveConversationId() ?? null);
  }

  /**
   * True when a conversation-driven chat has no usable active conversation — the active one was
   * cleared/removed, or points at a conversation no longer in `conversations` (bulk-removed). The
   * single-conversation flavor never hits this (it isn't conversation-driven). The membership check
   * is gated on the tracking latch: `conversations` is optional picker metadata, so an app switching
   * `activeConversationId` without ever populating it must not read as "that conversation doesn't
   * exist" — only a maintained collection can say that.
   * @returns {boolean}
   */
  get isEmptyState() {
    if (!this.#usesConversations) return false;
    const id = this.#getActiveConversationId();
    if (id == null) return true;
    if (!this.#tracksConversations) return false;
    return !this.#getConversations()?.some((conversation) => conversation.id === id);
  }
}
