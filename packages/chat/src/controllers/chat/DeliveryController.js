import { reconcileMessages } from "../../utils/messages.js";
import { finalizeStreamingParts } from "../../stream/streamHelpers.js";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxChatStatus, ChxChatAdapter, ChxMessageChunk, ChxMessageEnvelope } from "../../types/adapter.js" */
/** @import { StreamController } from "./StreamController.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & import("lit").LitElement} Host
 * @typedef {"completed" | "cancelled" | "failed"} Outcome
 * @typedef {{
 *   getActiveConversationId: () => string | undefined,
 *   getMessages: () => ChxMessage[],
 *   getAdapter: () => ChxChatAdapter | undefined,
 *   getUserId: () => string | undefined,
 *   applyMessages: (messages: ChxMessage[], conversationId?: string) => void,
 *   stream: StreamController,
 * }} DeliveryConfig
 */

/**
 * Sending turns for `chx-chat`: `deliver`/`retry`/`regenerate`, what's in flight, the derived
 * `status`/`busy`, and stopping. Host-bound: the in-flight map isn't reactive, so every change
 * requests an update, and `chx-delivery-*`/`chx-send-error` are dispatched on the chat.
 * @implements {ReactiveController}
 */
export class DeliveryController {
  /** @type {Host} */
  #host;
  /** @type {DeliveryConfig} */
  #config;
  /** delivery id (a send's id, or a regenerated reply's) → its abort controller and conversation.
   *  @type {Map<string, {controller: AbortController, conversationId: string | undefined}>} */
  #active = new Map();
  /** Drive `status: "error"` until each starts a new delivery. @type {Set<string | undefined>} */
  #failed = new Set();

  /** @param {Host} host @param {DeliveryConfig} config */
  constructor(host, config) {
    this.#host = host;
    this.#config = config;
    host.addController(this);
  }

  hostDisconnected() {
    for (const { controller } of this.#active.values()) controller.abort();
  }

  /** The active conversation's turn state. @returns {ChxChatStatus} */
  get status() {
    return this.statusFor(this.#config.getActiveConversationId());
  }

  get busy() {
    return this.busyFor(this.#config.getActiveConversationId());
  }

  /** @param {string | undefined} conversationId @returns {ChxChatStatus} */
  statusFor(conversationId) {
    if (this.#hasActive(conversationId)) {
      return this.#isWaitingForReply(conversationId) ? "submitted" : "streaming";
    }
    if (this.#failed.has(conversationId)) return "error";
    return "ready";
  }

  /** @param {string | undefined} conversationId */
  busyFor(conversationId) {
    const status = this.statusFor(conversationId);
    return status === "submitted" || status === "streaming";
  }

  /** A delivery for the active conversation has no reply shell yet. */
  isWaitingForReply() {
    return this.#isWaitingForReply(this.#config.getActiveConversationId());
  }

  /**
   * Aborts every delivery for `conversationId` and settles it at once — an adapter that never
   * closes its stream on abort would otherwise strand the composer in its stop state. The transport
   * still has to react to the signal itself (see `src/docs/agentic.md`).
   * @param {string} [conversationId]
   */
  stop(conversationId = this.#config.getActiveConversationId()) {
    for (const [deliveryId, delivery] of [...this.#active]) {
      if (delivery.conversationId !== conversationId) continue;
      delivery.controller.abort();
      this.#untrack(deliveryId, "cancelled", delivery.conversationId);
    }
  }

  /** Aborts one delivery, any conversation. @param {string} deliveryId */
  cancel(deliveryId) {
    const delivery = this.#active.get(deliveryId);
    if (!delivery) return;
    delivery.controller.abort();
    this.#untrack(deliveryId, "cancelled", delivery.conversationId);
  }

  /**
   * Sends an own message; without `adapter.sendMessage` it's just marked sent (local echo).
   * `conversationId` is captured by the caller so a later switch can't redirect the writes.
   * @param {ChxMessage} message
   * @param {string} [conversationId]
   */
  async deliver(message, conversationId) {
    const adapter = this.#config.getAdapter();
    if (!adapter?.sendMessage) {
      this.#markSent(message.id, conversationId);
      return;
    }
    await this.#run(message.id, conversationId, {
      start: (signal) => adapter.sendMessage?.(message, { signal }),
      replyToId: message.id,
      // resolving means the adapter accepted the message; the reply may still be streaming
      onAccepted: () => this.#markSent(message.id, conversationId),
      onError: (status, error) => {
        const updated = {
          ...message,
          status,
          ...(status === "failed"
            ? { error: { message: String(/** @type {any} */ (error)?.message ?? error) } }
            : {}),
        };
        const next = reconcileMessages(
          this.#config.getMessages(),
          updated,
          this.#config.getUserId(),
        );
        this.#config.applyMessages(
          this.#finalizeReply(next, message.id, status) ?? next,
          conversationId,
        );
      },
    });
  }

  /** Re-sends a `status: "failed"` message, dropping a reply already anchored to it. @param {string} messageId */
  retry(messageId) {
    const messages = this.#config.getMessages();
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.status !== "failed") return;
    const conversationId = message.conversationId;
    const resetMessage = {
      ...message,
      status: /** @type {"sending"} */ ("sending"),
      error: undefined,
    };
    this.#config.applyMessages(
      reconcileMessages(
        messages.filter((m) => m.replyToId !== messageId),
        resetMessage,
        this.#config.getUserId(),
      ),
      conversationId,
    );
    this.deliver(resetMessage, conversationId);
  }

  /** Redoes an assistant reply — the reply's id or its send's id. Needs `adapter.regenerate`. @param {string} messageId */
  regenerate(messageId) {
    const messages = this.#config.getMessages();
    const reply =
      messages.find((m) => m.id === messageId && m.replyToId) ??
      messages.find((m) => m.replyToId === messageId);
    const adapter = this.#config.getAdapter();
    if (!reply || !adapter?.regenerate) return;

    const replyToId = /** @type {string} */ (reply.replyToId);
    const conversationId = reply.conversationId;
    this.#config.applyMessages(
      messages.filter((m) => m.id !== reply.id),
      conversationId,
    );
    this.#run(reply.id, conversationId, {
      start: (signal) => adapter.regenerate?.(reply.id, { signal, conversationId }),
      replyToId,
      onError: (status) => {
        const settled = this.#finalizeReply(this.#config.getMessages(), replyToId, status);
        if (settled) this.#config.applyMessages(settled, conversationId);
      },
    });
  }

  /**
   * One tracked turn: start → stream the reply → settle. Cancellation shows up either as an
   * `{kind: "abort"}` chunk (settles inside `deliverStream`) or as the adapter throwing on abort.
   * @param {string} deliveryId
   * @param {string | undefined} conversationId
   * @param {{
   *   start: (signal: AbortSignal) => Promise<ReadableStream<ChxMessageChunk | ChxMessageEnvelope> | void> | undefined,
   *   replyToId: string,
   *   onAccepted?: () => void,
   *   onError: (status: "failed" | "cancelled", error: unknown) => void,
   * }} turn
   */
  async #run(deliveryId, conversationId, { start, replyToId, onAccepted, onError }) {
    const controller = new AbortController();
    let failed = false;
    this.#track(deliveryId, controller, conversationId);
    try {
      const stream = await start(controller.signal);
      onAccepted?.();
      if (!stream) return;
      await this.#config.stream.deliverStream(stream, { replyToId, conversationId });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      failed = !cancelled;
      onError(cancelled ? "cancelled" : "failed", error);
      if (!cancelled) this.#emit("chx-send-error", { messageId: deliveryId, error });
    } finally {
      // an abort chunk never throws, so the outcome reads the signal, not the catch
      const outcome = controller.signal.aborted ? "cancelled" : failed ? "failed" : "completed";
      this.#untrack(deliveryId, outcome, conversationId);
    }
  }

  /**
   * `messages` with a still-sending reply to `replyToId` closed out as `status`, or `undefined`
   * when no reply shell exists yet.
   * @param {ChxMessage[]} messages @param {string} replyToId @param {"failed" | "cancelled"} status
   */
  #finalizeReply(messages, replyToId, status) {
    const orphan = messages.find((m) => m.replyToId === replyToId && m.status === "sending");
    if (!orphan) return undefined;
    const cancelled = status === "cancelled";
    return messages.map((m) =>
      m === orphan ? finalizeStreamingParts({ ...m, status }, { cancelled }) : m,
    );
  }

  /** @param {string} messageId @param {string} [conversationId] */
  #markSent(messageId, conversationId) {
    const messages = this.#config.getMessages();
    const current = messages.find((m) => m.id === messageId);
    if (current?.status !== "sending") return;
    this.#config.applyMessages(
      messages.map((m) => (m === current ? { ...m, status: "sent" } : m)),
      conversationId,
    );
  }

  /** @param {string} deliveryId @param {AbortController} controller @param {string} [conversationId] */
  #track(deliveryId, controller, conversationId) {
    this.#active.set(deliveryId, { controller, conversationId });
    this.#failed.delete(conversationId);
    this.#host.requestUpdate();
    this.#emit("chx-delivery-start", { messageId: deliveryId, conversationId });
  }

  /** Idempotent: an abort settles here at once, and the stream's own unwind may land again later.
   *  @param {string} deliveryId @param {Outcome} outcome @param {string} [conversationId] */
  #untrack(deliveryId, outcome, conversationId) {
    if (!this.#active.delete(deliveryId)) return;
    if (outcome === "failed") this.#failed.add(conversationId);
    this.#host.requestUpdate();
    this.#emit("chx-delivery-end", { messageId: deliveryId, conversationId, outcome });
  }

  /** @param {string | undefined} conversationId */
  #hasActive(conversationId) {
    for (const delivery of this.#active.values()) {
      if (delivery.conversationId === conversationId) return true;
    }
    return false;
  }

  /** @param {string | undefined} conversationId */
  #isWaitingForReply(conversationId) {
    const messages = this.#config.getMessages();
    for (const [deliveryId, delivery] of this.#active) {
      if (delivery.conversationId !== conversationId) continue;
      if (!messages.some((message) => message.replyToId === deliveryId)) return true;
    }
    return false;
  }

  /** @param {string} type @param {unknown} detail */
  #emit(type, detail) {
    this.#host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}
