/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxChatAdapter } from "../types/adapter.js" */

/**
 * Owns pagination state (cursor/hasMore/in-flight) and the prepend-merge for older history.
 * A real `ReactiveController` so `hostDisconnected()` can abort an in-flight fetch. See
 * `PaginationSentinelController.js` for the sentinel-watching half that triggers `loadMore()`.
 * @implements {ReactiveController}
 */
export class PaginationController {
  #getAdapter;
  #getMessages;
  #applyMessages;
  /** @type {string | undefined} */
  #cursor; // opaque, from the last listMessages result — undefined before the first call
  #hasMore = true; // optimistic until a listMessages result says otherwise
  #loading = false; // in-flight guard, shared by loadInitial() and loadMore()
  /** @type {AbortController | undefined} */
  #loadInitialAbort;
  /** @type {AbortController | undefined} */
  #loadMoreAbort;

  /**
   * @param {ReactiveControllerHost} host
   * @param {{
   *   getAdapter: () => ChxChatAdapter | undefined,
   *   getMessages: () => ChxMessage[],
   *   applyMessages: (messages: ChxMessage[]) => void,
   * }} options
   */
  constructor(host, { getAdapter, getMessages, applyMessages }) {
    this.#getAdapter = getAdapter;
    this.#getMessages = getMessages;
    this.#applyMessages = applyMessages;
    host.addController(this);
  }

  /**
   * Prepends an older page, deduped by id.
   * @param {ChxMessage[]} messages
   * @param {ChxMessage[]} incoming
   * @returns {ChxMessage[]}
   */
  #mergeHistory(messages, incoming) {
    const existingIds = new Set(messages.map((message) => message.id));
    const deduped = incoming.filter((message) => !existingIds.has(message.id));
    return [...deduped, ...messages];
  }

  /**
   * Initial page, called once on connect. No-op if `adapter.listMessages` is unset. Shares
   * `#loading` with `loadMore()` — otherwise the pagination sentinel can fire `chx-load-more` while
   * this is still in flight and re-fetch the same page with a stale cursor.
   */
  async loadInitial() {
    const adapter = this.#getAdapter();
    if (!adapter?.listMessages || this.#loading) return;
    this.#loading = true;
    const controller = new AbortController();
    this.#loadInitialAbort = controller;
    try {
      const result = await adapter.listMessages({ signal: controller.signal });
      this.#cursor = result.cursor;
      this.#hasMore = result.hasMore ?? false;
      this.#applyMessages(result.messages);
    } catch (error) {
      if (!controller.signal.aborted) throw error; // a genuine adapter error still propagates
    } finally {
      this.#loading = false;
    }
  }

  /** Fetches one older page and merges it in. No-op if unset, already loading, or hasMore is false. */
  async loadMore() {
    const adapter = this.#getAdapter();
    if (!adapter?.listMessages || this.#loading || !this.#hasMore) return;
    this.#loading = true;
    const controller = new AbortController();
    this.#loadMoreAbort = controller;
    try {
      const result = await adapter.listMessages({
        cursor: this.#cursor,
        direction: "backward",
        signal: controller.signal,
      });
      this.#cursor = result.cursor;
      this.#hasMore = result.hasMore ?? false;
      this.#applyMessages(this.#mergeHistory(this.#getMessages(), result.messages));
    } catch (error) {
      if (!controller.signal.aborted) throw error; // a genuine adapter error still propagates
    } finally {
      this.#loading = false;
    }
  }

  /** Aborts any in-flight fetch — a disconnected host must not later call applyMessages. */
  hostDisconnected() {
    this.#loadInitialAbort?.abort();
    this.#loadMoreAbort?.abort();
  }
}
