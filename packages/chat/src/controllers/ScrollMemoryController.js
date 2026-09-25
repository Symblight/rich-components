/** @import { ChxMessageList } from "../components/message-list/message-list.js" */

/**
 * Remembers where the reader was in each conversation, so switching away and back lands on the same
 * scroll offset instead of the virtualizer's bottom-anchored default. Off entirely while
 * `getEnabled()` is false (`chx-chat.restoreScrollPosition`).
 *
 * No host: the capture is tied to `activeConversationId` actually changing, which only
 * `willUpdate(changedProperties)` can see — a `ReactiveController`'s own `hostUpdate()` gets no
 * arguments. So `chx-chat` drives this with two one-line calls, the same shape
 * `ReadTrackingController.syncReadStates()` has in `chx-message-list`.
 */
export class ScrollMemoryController {
  /** @type {() => ChxMessageList | null | undefined} */
  #getMessageListElement;
  /** @type {() => boolean} */
  #getEnabled;
  /** conversationId -> chx-message-list scroll offset. @type {Map<string, number | undefined>} */
  #offsets = new Map();
  #pendingRestore = false;

  /**
   * @param {{
   *   getMessageListElement: () => ChxMessageList | null | undefined,
   *   getEnabled: () => boolean,
   * }} config
   */
  constructor(config) {
    this.#getMessageListElement = config.getMessageListElement;
    this.#getEnabled = config.getEnabled;
  }

  /**
   * Captures the conversation being left and arms the restore for the one being entered. Called
   * from `willUpdate` on an `activeConversationId` change, before the new conversation renders.
   * @param {string | undefined} previousConversationId
   */
  handleConversationChange(previousConversationId) {
    if (!this.#getEnabled()) {
      this.#pendingRestore = false;
      return;
    }
    if (previousConversationId !== undefined) {
      this.#offsets.set(
        previousConversationId,
        this.#getMessageListElement()?.list?.getScrollOffset(),
      );
    }
    this.#pendingRestore = true;
  }

  /**
   * Restores the armed conversation's remembered offset once its messages have actually rendered —
   * awaiting `chx-message-list`'s own `updateComplete` first, since its render (and
   * `chx-infinity-scroll`'s underneath it) happens on a separate microtask from `chx-chat`'s. A
   * conversation with no remembered offset (first visit) is left alone: the virtualizer's own
   * bottom-anchored default is already the right resting place for it. Called from `updated`, and
   * deliberately not awaited there.
   * @param {string | undefined} conversationId
   */
  async restoreIfPending(conversationId) {
    if (!this.#pendingRestore) return;
    this.#pendingRestore = false;
    const offset = conversationId === undefined ? undefined : this.#offsets.get(conversationId);
    if (offset === undefined) return;
    const list = this.#getMessageListElement();
    await list?.updateComplete;
    list?.list?.scrollToOffset(offset);
  }

  /** Drops one conversation's remembered offset — its cache was cleared. @param {string} conversationId */
  forget(conversationId) {
    this.#offsets.delete(conversationId);
  }

  /** Drops every remembered offset. */
  forgetAll() {
    this.#offsets.clear();
  }
}
