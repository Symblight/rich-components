/** @import { ChxMessage } from "../types/message.js" */
/** @import { ChxChatStatus } from "../types/adapter.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & import("lit").LitElement} Host
 */

/**
 * Owns which turns are in flight for `chx-chat` and everything derived from that: the abort
 * controllers, the last failed delivery, the public `status`/`busy` state, and the two ways a turn
 * is stopped (`stop()` for the active conversation, `cancel(messageId)` for one delivery anywhere).
 * `chx-delivery-start`/`chx-delivery-end` are dispatched from here too.
 *
 * Host-bound for two reasons, both load-bearing: the delivery map is a plain `Map`, not a reactive
 * property, so every mutation has to kick `requestUpdate()` by hand or the composer's stop button
 * never repaints; and the two events are dispatched on the chat element itself.
 * @implements {ReactiveController}
 */
export class DeliveryController {
  /** @type {Host} */
  #host;
  /** @type {() => string | undefined} */
  #getActiveConversationId;
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** messageId/replyId -> in-flight delivery, tagged with the conversation it belongs to.
   *  @type {Map<string, {controller: AbortController, conversationId: string | undefined}>} */
  #active = new Map();
  /** Drives `status: "error"`; cleared when that conversation starts a new delivery.
   *  @type {{conversationId: string | undefined} | null} */
  #lastError = null;

  /**
   * @param {Host} host
   * @param {{
   *   getActiveConversationId: () => string | undefined,
   *   getMessages: () => ChxMessage[],
   * }} config
   */
  constructor(host, config) {
    this.#host = host;
    host.addController(this);
    this.#getActiveConversationId = config.getActiveConversationId;
    this.#getMessages = config.getMessages;
  }

  /** Aborts everything still running — the chat is leaving the document. */
  hostDisconnected() {
    for (const { controller } of this.#active.values()) controller.abort();
  }

  /**
   * The active conversation's turn state, derived — nothing assigns it. `submitted` is the window
   * between a send and its first chunk (`isWaitingForReply`), `streaming` is a reply shell filling
   * in, `error` is a delivery that failed without being cancelled, cleared by the next send.
   * A backgrounded conversation's own delivery never shows up here, same rule `isWaitingForReply`
   * follows.
   * @returns {ChxChatStatus}
   */
  get status() {
    if (this.#hasActive()) return this.isWaitingForReply() ? "submitted" : "streaming";
    // the null check has to be explicit: `undefined` is a real conversationId here (the
    // single-conversation case), so optional chaining would read "error" for every idle chat
    if (this.#lastError && this.#lastError.conversationId === this.#getActiveConversationId()) {
      return "error";
    }
    return "ready";
  }

  /** `status` narrowed to the one bit the composer needs. @returns {boolean} */
  get busy() {
    const status = this.status;
    return status === "submitted" || status === "streaming";
  }

  /**
   * True while at least one in-flight delivery *for the active conversation* hasn't produced its
   * reply shell yet — the "waiting for a reply, no message to attach a status to yet" window. A
   * backgrounded conversation's own in-flight delivery is deliberately excluded: its streaming
   * indicator belongs to whichever chat is actually showing it. Derived fresh on each read, not
   * tracked incrementally — the map holds 0-1 deliveries per conversation in the normal case, so
   * the scan is cheap.
   * @returns {boolean}
   */
  isWaitingForReply() {
    const activeConversationId = this.#getActiveConversationId();
    const messages = this.#getMessages();
    for (const [deliveryId, delivery] of this.#active) {
      if (delivery.conversationId !== activeConversationId) continue;
      if (!messages.some((message) => message.replyToId === deliveryId)) return true;
    }
    return false;
  }

  /**
   * Registers a delivery. The one place that happens — `chx-chat`'s `#deliver` and
   * `#deliverRegenerate` both come through here.
   * @param {string} deliveryId
   * @param {AbortController} controller
   * @param {string} [conversationId]
   */
  track(deliveryId, controller, conversationId) {
    this.#active.set(deliveryId, { controller, conversationId });
    if (this.#lastError && this.#lastError.conversationId === conversationId) {
      this.#lastError = null;
    }
    this.#host.requestUpdate(); // see the class doc — the map is not reactive
    this.#emit("chx-delivery-start", { messageId: deliveryId, conversationId });
  }

  /**
   * The counterpart to `track` — same requestUpdate reasoning. Idempotent: an abort settles the
   * delivery here right away, and the stream's own unwind lands here again later, whenever the
   * adapter gets around to it, if ever.
   * @param {string} deliveryId
   * @param {"completed" | "cancelled" | "failed"} outcome
   * @param {string} [conversationId]
   */
  untrack(deliveryId, outcome, conversationId) {
    if (!this.#active.delete(deliveryId)) return;
    if (outcome === "failed") this.#lastError = { conversationId };
    this.#host.requestUpdate();
    this.#emit("chx-delivery-end", { messageId: deliveryId, conversationId, outcome });
  }

  /**
   * Aborts every in-flight delivery for the active conversation — what the composer's stop button
   * reaches through `chx-stop`. A backgrounded conversation's delivery is deliberately left alone;
   * use `cancel(messageId)` for that.
   *
   * Aborting only stops this client reading the stream. An agent transport has to react to the
   * signal itself — send ACP's `session/cancel`, answer any outstanding `session/request_permission`
   * — or the agent keeps working with nothing listening. See `src/docs/agentic.md`.
   *
   * Which is why the delivery is settled here rather than left to the stream to unwind: an adapter
   * that returns from its `start()` on abort without closing the stream leaves the read pending
   * forever, and waiting on that would strand the composer in its stop state. Trailing chunks from
   * a well-behaved adapter still land — settling is about this chat's own turn state, nothing else.
   */
  stopActive() {
    const activeConversationId = this.#getActiveConversationId();
    for (const [deliveryId, delivery] of [...this.#active]) {
      if (delivery.conversationId !== activeConversationId) continue;
      delivery.controller.abort();
      this.untrack(deliveryId, "cancelled", delivery.conversationId);
    }
  }

  /**
   * Aborts one in-flight `sendMessage`/`regenerate` delivery, backgrounded conversations included.
   * A no-op if nothing is currently in flight for that id.
   * @param {string} deliveryId
   */
  cancel(deliveryId) {
    const delivery = this.#active.get(deliveryId);
    if (!delivery) return;
    delivery.controller.abort();
    this.untrack(deliveryId, "cancelled", delivery.conversationId); // see stopActive()
  }

  /** @returns {boolean} */
  #hasActive() {
    const activeConversationId = this.#getActiveConversationId();
    for (const delivery of this.#active.values()) {
      if (delivery.conversationId === activeConversationId) return true;
    }
    return false;
  }

  /** @param {string} type @param {unknown} detail */
  #emit(type, detail) {
    this.#host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}
