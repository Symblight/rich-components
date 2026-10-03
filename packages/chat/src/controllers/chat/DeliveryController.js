import { reconcileMessages } from "../../utils/messages.js";
import { finalizeStreamingParts } from "../../stream/streamHelpers.js";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxChatStatus, ChxChatAdapter } from "../../types/adapter.js" */
/** @import { StreamController } from "./StreamController.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & import("lit").LitElement} Host
 */

/**
 * Owns delivery for `chx-chat`: sending a turn (`deliver`), `retry`/`regenerate`, which turns are in
 * flight, the derived `status`/`busy`, and the two ways a turn is stopped (`stop(conversationId)`
 * for a whole conversation, `cancel(messageId)` for one delivery anywhere).
 * `chx-delivery-start`/`chx-delivery-end`/`chx-send-error` are dispatched from here too.
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
  /** @type {() => ChxChatAdapter | undefined} */
  #getAdapter;
  /** @type {() => string | undefined} */
  #getUserId;
  /** @type {(messages: ChxMessage[], conversationId?: string) => void} */
  #applyMessages;
  /** @type {StreamController} */
  #stream;
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
   *   getAdapter: () => ChxChatAdapter | undefined,
   *   getUserId: () => string | undefined,
   *   applyMessages: (messages: ChxMessage[], conversationId?: string) => void,
   *   stream: StreamController,
   * }} config
   */
  constructor(host, config) {
    this.#host = host;
    host.addController(this);
    this.#getActiveConversationId = config.getActiveConversationId;
    this.#getMessages = config.getMessages;
    this.#getAdapter = config.getAdapter;
    this.#getUserId = config.getUserId;
    this.#applyMessages = config.applyMessages;
    this.#stream = config.stream;
  }

  /** Aborts everything still running — the chat is leaving the document. */
  hostDisconnected() {
    for (const { controller } of this.#active.values()) controller.abort();
  }

  /**
   * The active conversation's turn state, derived — nothing assigns it. `submitted` is the window
   * between a send and its first chunk, `streaming` is a reply shell filling in, `error` is a
   * delivery that failed without being cancelled, cleared by the next send.
   * @returns {ChxChatStatus}
   */
  get status() {
    return this.statusFor(this.#getActiveConversationId());
  }

  /** `status` narrowed to the one bit the composer needs. @returns {boolean} */
  get busy() {
    return this.busyFor(this.#getActiveConversationId());
  }

  /** @param {string | undefined} conversationId @returns {ChxChatStatus} */
  statusFor(conversationId) {
    if (this.#hasActive(conversationId)) {
      return this.#isWaitingForReply(conversationId) ? "submitted" : "streaming";
    }
    // explicit null check: `undefined` is a real conversationId (the single-conversation case)
    if (this.#lastError && this.#lastError.conversationId === conversationId) return "error";
    return "ready";
  }

  /** @param {string | undefined} conversationId @returns {boolean} */
  busyFor(conversationId) {
    const status = this.statusFor(conversationId);
    return status === "submitted" || status === "streaming";
  }

  /**
   * True while an in-flight delivery for the active conversation has no reply shell yet. A
   * backgrounded conversation's delivery is excluded — its indicator belongs to whichever chat shows it.
   * @returns {boolean}
   */
  isWaitingForReply() {
    return this.#isWaitingForReply(this.#getActiveConversationId());
  }

  /** @param {string | undefined} conversationId */
  #isWaitingForReply(conversationId) {
    const messages = this.#getMessages();
    for (const [deliveryId, delivery] of this.#active) {
      if (delivery.conversationId !== conversationId) continue;
      if (!messages.some((message) => message.replyToId === deliveryId)) return true;
    }
    return false;
  }

  /**
   * Registers a delivery. The one place that happens — `deliver` and `#deliverRegenerate` both
   * come through here.
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
   * Aborts every in-flight delivery for `conversationId` (default: the active one) — what the
   * composer's stop button reaches through `chx-stop`. Other conversations are left alone.
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
  /** @param {string} [conversationId] */
  stop(conversationId = this.#getActiveConversationId()) {
    for (const [deliveryId, delivery] of [...this.#active]) {
      if (delivery.conversationId !== conversationId) continue;
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
    this.untrack(deliveryId, "cancelled", delivery.conversationId); // see stop()
  }

  /**
   * AI-agent flavor's reply mechanism — without `adapter.sendMessage` the message is just marked
   * sent (messenger local echo). `conversationId` is captured by the caller: the app may switch
   * conversations before this settles, and every write must land on the one the send belongs to.
   * @param {ChxMessage} message
   * @param {string} [conversationId]
   */
  async deliver(message, conversationId) {
    const adapter = this.#getAdapter();
    if (!adapter?.sendMessage) {
      this.#markSent(message.id, conversationId);
      return;
    }
    const controller = new AbortController();
    let failed = false;
    this.track(message.id, controller, conversationId);
    try {
      const stream = await adapter.sendMessage(message, { signal: controller.signal });
      // sendMessage resolving is the adapter accepting the message; the reply may still be streaming
      this.#markSent(message.id, conversationId);
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId: message.id, conversationId });
    } catch (error) {
      // an {kind:"abort"} chunk settles inside deliverStream; only an adapter throwing on abort lands here
      const cancelled = controller.signal.aborted;
      failed = !cancelled;
      const replyStatus = /** @type {"failed" | "cancelled"} */ (
        cancelled ? "cancelled" : "failed"
      );
      const updated = {
        ...message,
        status: replyStatus,
        ...(cancelled
          ? {}
          : { error: { message: String(/** @type {any} */ (error)?.message ?? error) } }),
      };
      const next = reconcileMessages(this.#getMessages(), updated, this.#getUserId());
      // a reply shell can already exist (some chunks arrived before the throw) — close it out too
      const orphanedReply = next.find((m) => m.replyToId === message.id && m.status === "sending");
      this.#applyMessages(
        orphanedReply
          ? next.map((m) =>
              m.id === orphanedReply.id ? finalizeStreamingParts({ ...m, status: replyStatus }) : m,
            )
          : next,
        conversationId,
      );
      if (!cancelled) this.#emit("chx-send-error", { messageId: message.id, error });
    } finally {
      // an {kind:"abort"} chunk never throws, so the outcome reads the signal, not the catch
      this.untrack(
        message.id,
        controller.signal.aborted ? "cancelled" : failed ? "failed" : "completed",
        conversationId,
      );
    }
  }

  /**
   * Re-attempts a `status: "failed"` message, dropping any reply already anchored to it so a
   * successful retry doesn't leave two replies.
   * @param {string} messageId
   */
  retry(messageId) {
    const messages = this.#getMessages();
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.status !== "failed") return;
    const conversationId = message.conversationId;
    const resetMessage = {
      ...message,
      status: /** @type {"sending"} */ ("sending"),
      error: undefined,
    };
    const withoutStaleReply = messages.filter((m) => m.replyToId !== messageId);
    this.#applyMessages(
      reconcileMessages(withoutStaleReply, resetMessage, this.#getUserId()),
      conversationId,
    );
    this.deliver(resetMessage, conversationId);
  }

  /**
   * Redoes an assistant reply (succeeded, failed or orphaned) — unlike `retry`, which re-sends a
   * failed user message. No-op without a matching reply or `adapter.regenerate`.
   * @param {string} messageId - the reply's own id, or its anchoring send's id
   */
  regenerate(messageId) {
    const messages = this.#getMessages();
    const reply =
      messages.find((m) => m.id === messageId && m.replyToId) ??
      messages.find((m) => m.replyToId === messageId);
    if (!reply || !this.#getAdapter()?.regenerate) return;

    const conversationId = reply.conversationId;
    this.#applyMessages(
      messages.filter((m) => m.id !== reply.id),
      conversationId,
    );
    this.#deliverRegenerate(reply.id, /** @type {string} */ (reply.replyToId), conversationId);
  }

  /**
   * @param {string} replyId
   * @param {string} replyToId
   * @param {string} [conversationId] - captured up front, see `deliver`
   */
  async #deliverRegenerate(replyId, replyToId, conversationId) {
    const controller = new AbortController();
    let failed = false;
    this.track(replyId, controller, conversationId);
    try {
      const stream = await this.#getAdapter()?.regenerate?.(replyId, {
        signal: controller.signal,
        conversationId,
      });
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId, conversationId });
    } catch (error) {
      // regenerate() already removed the old reply — close out a fresh one that started streaming
      const cancelled = controller.signal.aborted;
      failed = !cancelled;
      const messages = this.#getMessages();
      const orphanedReply = messages.find(
        (m) => m.replyToId === replyToId && m.status === "sending",
      );
      if (orphanedReply) {
        const replyStatus = /** @type {"failed" | "cancelled"} */ (
          cancelled ? "cancelled" : "failed"
        );
        this.#applyMessages(
          messages.map((m) =>
            m.id === orphanedReply.id ? finalizeStreamingParts({ ...m, status: replyStatus }) : m,
          ),
          conversationId,
        );
      }
      if (!cancelled) this.#emit("chx-send-error", { messageId: replyId, error });
    } finally {
      this.untrack(
        replyId,
        controller.signal.aborted ? "cancelled" : failed ? "failed" : "completed",
        conversationId,
      );
    }
  }

  /** @param {string} messageId @param {string} [conversationId] */
  #markSent(messageId, conversationId) {
    const messages = this.#getMessages();
    const current = messages.find((m) => m.id === messageId);
    if (current?.status !== "sending") return;
    this.#applyMessages(
      messages.map((m) => (m === current ? { ...m, status: "sent" } : m)),
      conversationId,
    );
  }

  /** @param {string | undefined} conversationId @returns {boolean} */
  #hasActive(conversationId) {
    for (const delivery of this.#active.values()) {
      if (delivery.conversationId === conversationId) return true;
    }
    return false;
  }

  /** @param {string} type @param {unknown} detail */
  #emit(type, detail) {
    this.#host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}
