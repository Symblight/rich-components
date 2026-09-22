/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxChatAdapter } from "../types/adapter.js" */

/**
 * @typedef {Object} ConversationPageState
 * @property {string} [cursor]
 * @property {boolean} hasMore
 * @property {boolean} loading
 * @property {AbortController} [loadAbort]
 */

/**
 * Owns pagination state (cursor/hasMore/in-flight) and the prepend-merge for older history, scoped
 * per conversation (`conversationId`, `undefined` for a single-conversation chx-chat — behaves exactly
 * as a single global state in that case). A real `ReactiveController` so `hostDisconnected()` can abort
 * every in-flight fetch. See `PaginationSentinelController.js` for the sentinel-watching half that
 * triggers `loadMore()`.
 * @implements {ReactiveController}
 */
export class PaginationController {
  /** @type {ReactiveControllerHost} */
  #host;
  /** @type {() => ChxChatAdapter | undefined} */
  #getAdapter;
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** @type {(messages: ChxMessage[], conversationId?: string) => void} */
  #applyMessages;
  /** @type {() => string | undefined} */
  #getConversationId;
  /** @type {Map<string | undefined, ConversationPageState>} */
  #state = new Map();
  /** @type {Set<string | undefined>} loadInitial() has been dispatched at least once — see hasVisited/forget */
  #visited = new Set();

  /**
   * @param {ReactiveControllerHost} host
   * @param {{
   *   getAdapter: () => ChxChatAdapter | undefined,
   *   getMessages: () => ChxMessage[],
   *   applyMessages: (messages: ChxMessage[], conversationId?: string) => void,
   *   getConversationId?: () => string | undefined,
   * }} options
   */
  constructor(host, { getAdapter, getMessages, applyMessages, getConversationId }) {
    this.#host = host;
    this.#getAdapter = getAdapter;
    this.#getMessages = getMessages;
    this.#applyMessages = applyMessages;
    this.#getConversationId = getConversationId ?? (() => undefined);
    host.addController(this);
  }

  /**
   * @param {string | undefined} conversationId
   * @returns {ConversationPageState}
   */
  #stateFor(conversationId) {
    let entry = this.#state.get(conversationId);
    if (!entry) {
      entry = { hasMore: true, loading: false }; // optimistic hasMore until a listMessages result says otherwise
      this.#state.set(conversationId, entry);
    }
    return entry;
  }

  /** Whether older history can still be loaded for the active conversation — pushed down to `chx-infinity-scroll`'s `hasMore`. */
  get hasMore() {
    return this.#stateFor(this.#getConversationId()).hasMore;
  }

  /** Whether a page fetch is in flight for the active conversation — pushed down to `chx-infinity-scroll`'s `loading`. */
  get loading() {
    return this.#stateFor(this.#getConversationId()).loading;
  }

  /**
   * Whether `loadInitial()` has ever been dispatched for `conversationId` — see `forget()`/chx-chat's
   * `refresh()`.
   * @param {string | undefined} conversationId
   */
  hasVisited(conversationId) {
    return this.#visited.has(conversationId);
  }

  /**
   * Mutates in-flight/exhausted state for one conversation and re-renders the host so the new values
   * reach the list (only meaningful when that conversation is the active one, but cheap enough to
   * always trigger — matches the previous unconditional `requestUpdate()`).
   * @param {string | undefined} conversationId
   * @param {{loading?: boolean, hasMore?: boolean}} patch
   */
  #setState(conversationId, patch) {
    Object.assign(this.#stateFor(conversationId), patch);
    this.#host.requestUpdate();
  }

  /**
   * Prepends an older page into `conversationId`'s own slice of `messages`, deduped by id — other
   * conversations' entries are left exactly where they are; cross-conversation ordering in the
   * underlying array is otherwise irrelevant, everything downstream filters by `conversationId`
   * before rendering.
   * @param {ChxMessage[]} messages
   * @param {ChxMessage[]} incoming
   * @param {string | undefined} conversationId
   * @returns {ChxMessage[]}
   */
  #mergeHistory(messages, incoming, conversationId) {
    const stamped = incoming.map((message) =>
      message.conversationId === conversationId ? message : { ...message, conversationId },
    );
    const existingIds = new Set(messages.map((message) => message.id));
    const deduped = stamped.filter((message) => !existingIds.has(message.id));
    const firstOwnIndex = messages.findIndex(
      (message) => message.conversationId === conversationId,
    );
    if (firstOwnIndex === -1) return [...messages, ...deduped];
    return [...messages.slice(0, firstOwnIndex), ...deduped, ...messages.slice(firstOwnIndex)];
  }

  /**
   * Replaces `conversationId`'s own slice of `messages` wholesale with `incoming` — other
   * conversations' cached entries are left untouched.
   * @param {ChxMessage[]} messages
   * @param {ChxMessage[]} incoming
   * @param {string | undefined} conversationId
   * @returns {ChxMessage[]}
   */
  #replaceConversation(messages, incoming, conversationId) {
    const stamped = incoming.map((message) =>
      message.conversationId === conversationId ? message : { ...message, conversationId },
    );
    const others = messages.filter((message) => message.conversationId !== conversationId);
    return [...others, ...stamped];
  }

  /**
   * Initial page for one conversation — called once per conversation, either from chx-chat's own
   * `conversationId` switch (a cache miss, see `hasVisited`) or `refresh()` (after `forget()` clears
   * the visited mark). No-op if `adapter.listMessages` is unset or already loading. Never silently
   * retried on its own after a failure — see `forget()`/chx-chat's `refresh()`.
   * @param {string | undefined} [conversationId] defaults to the currently active conversation
   */
  async loadInitial(conversationId = this.#getConversationId()) {
    const adapter = this.#getAdapter();
    const entry = this.#stateFor(conversationId);
    if (!adapter?.listMessages || entry.loading) return;
    this.#visited.add(conversationId);
    this.#setState(conversationId, { loading: true });
    const controller = new AbortController();
    entry.loadAbort = controller;
    try {
      const result = await adapter.listMessages({ conversationId, signal: controller.signal });
      entry.cursor = result.cursor;
      this.#setState(conversationId, { hasMore: result.hasMore ?? false });
      this.#applyMessages(
        this.#replaceConversation(this.#getMessages(), result.messages, conversationId),
        conversationId,
      );
    } catch (error) {
      if (!controller.signal.aborted) throw error; // a genuine adapter error still propagates
    } finally {
      this.#setState(conversationId, { loading: false });
    }
  }

  /**
   * Fetches one older page for the active conversation and merges it in. No-op if unset, already
   * loading, or hasMore is false.
   */
  async loadMore() {
    const conversationId = this.#getConversationId();
    const adapter = this.#getAdapter();
    const entry = this.#stateFor(conversationId);
    if (!adapter?.listMessages || entry.loading || !entry.hasMore) return;
    this.#setState(conversationId, { loading: true });
    const controller = new AbortController();
    entry.loadAbort = controller;
    try {
      const result = await adapter.listMessages({
        conversationId,
        cursor: entry.cursor,
        direction: "backward",
        signal: controller.signal,
      });
      entry.cursor = result.cursor;
      this.#setState(conversationId, { hasMore: result.hasMore ?? false });
      this.#applyMessages(
        this.#mergeHistory(this.#getMessages(), result.messages, conversationId),
        conversationId,
      );
    } catch (error) {
      if (!controller.signal.aborted) throw error; // a genuine adapter error still propagates
    } finally {
      this.#setState(conversationId, { loading: false });
    }
  }

  /**
   * Drops cached pagination state for a conversation so the next `loadInitial()` re-fetches from
   * scratch — the mechanism behind chx-chat's `refresh()`. Does not touch `#getMessages()`'s own
   * cached array; the caller is responsible for clearing that conversation's messages too.
   * @param {string | undefined} conversationId
   */
  forget(conversationId) {
    this.#visited.delete(conversationId);
    this.#state.delete(conversationId);
  }

  /** Drops cached pagination state for every conversation at once — the "clear everything" half of chx-chat's `cache.clear()`. */
  forgetAll() {
    this.#visited.clear();
    this.#state.clear();
  }

  /** Aborts every in-flight fetch, across every conversation — a disconnected host must not later call applyMessages. */
  hostDisconnected() {
    for (const entry of this.#state.values()) entry.loadAbort?.abort();
  }
}
