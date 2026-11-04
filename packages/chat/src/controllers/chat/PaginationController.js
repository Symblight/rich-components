import { validateMessages } from "../../utils/validate-messages.js";
/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxChatAdapter } from "../../types/adapter.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 * @typedef {{cursor?: string, hasMore: boolean, loading: boolean, loadAbort?: AbortController}} PageState
 * @typedef {{
 *   getAdapter: () => ChxChatAdapter | undefined,
 *   getMessages: () => ChxMessage[],
 *   applyMessages: (messages: ChxMessage[], conversationId?: string) => void,
 *   getConversationId?: () => string | undefined,
 * }} PaginationConfig
 */

/**
 * Cursor/hasMore/in-flight state and history merging, per conversation (`undefined` for a
 * single-conversation chat). Host-bound so a disconnect aborts every in-flight fetch.
 * @implements {ReactiveController}
 */
export class PaginationController {
  /** @type {ReactiveControllerHost} */
  #host;
  /** @type {PaginationConfig} */
  #config;
  /** @type {Map<string | undefined, PageState>} */
  #state = new Map();
  /** `loadInitial()` dispatched at least once — see `hasVisited`/`forget`. @type {Set<string | undefined>} */
  #visited = new Set();

  /** @param {ReactiveControllerHost} host @param {PaginationConfig} config */
  constructor(host, config) {
    this.#host = host;
    this.#config = config;
    host.addController(this);
  }

  /** Older history left for the active conversation. */
  get hasMore() {
    return this.hasMoreFor(this.#activeId());
  }

  /** A page fetch in flight for the active conversation. */
  get loading() {
    return this.isLoadingFor(this.#activeId());
  }

  /** @param {string | undefined} conversationId */
  hasMoreFor(conversationId) {
    return this.#state.get(conversationId)?.hasMore ?? true;
  }

  /** @param {string | undefined} conversationId */
  isLoadingFor(conversationId) {
    return this.#state.get(conversationId)?.loading ?? false;
  }

  /** @param {string | undefined} conversationId */
  hasVisited(conversationId) {
    return this.#visited.has(conversationId);
  }

  /**
   * First page for one conversation, replacing its cached slice. Never retried on its own after a
   * failure — `forget()` + a new call (chx-chat's `store.refresh()`) does that.
   * @param {string | undefined} [conversationId]
   */
  async loadInitial(conversationId = this.#activeId()) {
    if (!this.#config.getAdapter()?.listMessages || this.#stateFor(conversationId).loading) return;
    this.#visited.add(conversationId);
    await this.#fetchPage(conversationId, {}, (messages, incoming) => [
      ...messages.filter((message) => message.conversationId !== conversationId),
      ...incoming,
    ]);
  }

  /** One older page for the active conversation, prepended to its slice. */
  async loadMore() {
    const conversationId = this.#activeId();
    const entry = this.#stateFor(conversationId);
    if (!this.#config.getAdapter()?.listMessages || entry.loading || !entry.hasMore) return;
    await this.#fetchPage(
      conversationId,
      { cursor: entry.cursor, direction: "backward" },
      (messages, incoming) => {
        const existingIds = new Set(messages.map((message) => message.id));
        const deduped = incoming.filter((message) => !existingIds.has(message.id));
        // other conversations stay where they are — everything downstream filters by conversation
        const firstOwn = messages.findIndex((message) => message.conversationId === conversationId);
        if (firstOwn === -1) return [...messages, ...deduped];
        return [...messages.slice(0, firstOwn), ...deduped, ...messages.slice(firstOwn)];
      },
    );
  }

  /** Drops a conversation's page state; its cached messages are the caller's to clear. @param {string | undefined} conversationId */
  forget(conversationId) {
    this.#visited.delete(conversationId);
    this.#state.delete(conversationId);
  }

  forgetAll() {
    this.#visited.clear();
    this.#state.clear();
  }

  /** A disconnected host must not later call `applyMessages`. */
  hostDisconnected() {
    for (const entry of this.#state.values()) entry.loadAbort?.abort();
  }

  /**
   * @param {string | undefined} conversationId
   * @param {{cursor?: string, direction?: "backward"}} request
   * @param {(messages: ChxMessage[], incoming: ChxMessage[]) => ChxMessage[]} merge
   */
  async #fetchPage(conversationId, request, merge) {
    const adapter = /** @type {ChxChatAdapter & {listMessages: Function}} */ (
      this.#config.getAdapter()
    );
    const entry = this.#stateFor(conversationId);
    const controller = new AbortController();
    entry.loadAbort = controller;
    this.#setState(conversationId, { loading: true });
    try {
      const result = await adapter.listMessages({
        conversationId,
        ...request,
        signal: controller.signal,
      });
      entry.cursor = result.cursor;
      this.#setState(conversationId, { hasMore: result.hasMore ?? false });
      validateMessages(result.messages);
      const incoming = result.messages.map((message) =>
        message.conversationId === conversationId ? message : { ...message, conversationId },
      );
      this.#config.applyMessages(merge(this.#config.getMessages(), incoming), conversationId);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      this.#setState(conversationId, { loading: false });
    }
  }

  #activeId() {
    return this.#config.getConversationId?.();
  }

  /** @param {string | undefined} conversationId @returns {PageState} */
  #stateFor(conversationId) {
    let entry = this.#state.get(conversationId);
    if (!entry) {
      entry = { hasMore: true, loading: false }; // optimistic until a result says otherwise
      this.#state.set(conversationId, entry);
    }
    return entry;
  }

  /** @param {string | undefined} conversationId @param {{loading?: boolean, hasMore?: boolean}} patch */
  #setState(conversationId, patch) {
    Object.assign(this.#stateFor(conversationId), patch);
    this.#host.requestUpdate();
  }
}
