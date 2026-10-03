import { ContextEvent } from "@lit/context";

import { chatApiContext } from "../../context/chat-api-context.js";
import { CHAT_API_DEFAULTS } from "../../api/chat-api-defaults.js";

/** @import { ReactiveController, ReactiveControllerHost } from "lit" */
/** @import { ChxChatApi, ChxChatNamespace } from "../../types/api.js" */
/** @import { ChatApiRegistry } from "../../context/chat-api-context.js" */

/**
 * Connects a consumer's own Lit element to the nearest `<chx-chat>`: its API namespaces plus
 * reactive state that re-renders the host when — and only when — something it read changes.
 * @implements {ReactiveController}
 */
export class ChatController {
  /** @type {ReactiveControllerHost & HTMLElement} */
  #host;
  /** @type {ChatApiRegistry | undefined} */
  #registry;
  /** @type {(() => void) | undefined} */
  #unsubscribe;
  /** Namespaces read since the last update finished. @type {Set<ChxChatNamespace>} */
  #reads = new Set();
  /** Namespaces read during the last full update cycle. @type {Set<ChxChatNamespace>} */
  #tracked = new Set();

  /** @param {ReactiveControllerHost & HTMLElement} host */
  constructor(host) {
    this.#host = host;
    host.addController(this);
  }

  hostConnected() {
    this.#request();
    // a host defined before chx-chat loses its first request — ask again once chx-chat exists
    if (!this.#registry) {
      customElements.whenDefined("chx-chat").then(() => {
        if (!this.#registry && this.#host.isConnected) this.#request();
      });
    }
  }

  hostDisconnected() {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#setRegistry(undefined);
  }

  hostUpdated() {
    this.#tracked = this.#reads;
    this.#reads = new Set();
  }

  /** Whether a `<chx-chat>` was found. */
  get connected() {
    return !!this.#registry;
  }

  /** @param {ChxChatNamespace} ns */
  isAvailable(ns) {
    this.#reads.add(ns);
    return !!this.#registry?.isAvailable(ns);
  }

  get delivery() {
    return this.#facade("delivery");
  }

  get store() {
    return this.#facade("store");
  }

  get presence() {
    return this.#facade("presence");
  }

  get viewport() {
    return this.#facade("viewport");
  }

  get input() {
    return this.#facade("input");
  }

  get attachments() {
    return this.#facade("attachments");
  }

  /** @returns {import("../../types/adapter.js").ChxChatStatus} */
  get status() {
    return this.#read("delivery").getStatus();
  }

  get busy() {
    return this.#read("delivery").isBusy();
  }

  get messages() {
    return this.#read("store").getMessages();
  }

  get hasMore() {
    return this.#read("store").hasMore();
  }

  get loading() {
    return this.#read("store").isLoading();
  }

  get typing() {
    return this.#read("presence").isTyping();
  }

  get awayFromBottom() {
    return this.#read("viewport").isAwayFromBottom();
  }

  get files() {
    return this.#read("attachments").getFiles();
  }

  /**
   * @template {ChxChatNamespace} N
   * @param {N} ns
   * @returns {ChxChatApi[N]}
   */
  #facade(ns) {
    return this.#registry?.facades[ns] ?? CHAT_API_DEFAULTS[ns];
  }

  /**
   * Tracked, warning-free read — reactive getters run before an owner may have mounted.
   * @template {ChxChatNamespace} N
   * @param {N} ns
   * @returns {ChxChatApi[N]}
   */
  #read(ns) {
    this.#reads.add(ns);
    return this.#registry?.current(ns) ?? CHAT_API_DEFAULTS[ns];
  }

  #request() {
    this.#host.dispatchEvent(
      new ContextEvent(
        chatApiContext,
        this.#host,
        (registry, unsubscribe) => {
          if (unsubscribe !== this.#unsubscribe) {
            this.#unsubscribe?.();
            this.#unsubscribe = unsubscribe;
          }
          this.#setRegistry(registry);
        },
        true,
      ),
    );
  }

  /** @param {ChatApiRegistry | undefined} registry */
  #setRegistry(registry) {
    if (registry === this.#registry) return;
    this.#registry?.removeEventListener("change", this.#onChange);
    this.#registry = registry;
    registry?.addEventListener("change", this.#onChange);
    this.#host.requestUpdate();
  }

  /** @param {Event} event */
  #onChange = (event) => {
    const { namespace } = /** @type {CustomEvent<{namespace: ChxChatNamespace}>} */ (event).detail;
    if (this.#tracked.has(namespace) || this.#reads.has(namespace)) this.#host.requestUpdate();
  };
}
