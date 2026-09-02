import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextProvider } from "@lit/context";

import "../message-composer/message-composer.js";
import "../message-list/message-list.js";
import { DropTargetController } from "../../controllers/DropTargetController.js";
import { attachmentsContext } from "../../context/attachments-context.js";
import { commandsContext } from "../../context/commands-context.js";
import { reconcileMessages } from "../../utils/messages.js";
import { validateMessages } from "../../utils/validate-messages.js";
import { StreamController } from "../../controllers/StreamController.js";
import { PaginationController } from "../../controllers/PaginationController.js";
import { TypingController } from "../../controllers/TypingController.js";
import { LOAD_MORE_EVENT } from "../infinity-scroll/ScrollBehaviorController.js";
import { finalizeStreamingParts } from "../../stream/streamHelpers.js";

import styles from "./chat.css?inline";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxChatAdapter, ChxMessageRenderer, ChxPartRenderer } from "../../types/adapter.js" */

/**
 * @tag chx-chat
 * @summary Chat.
 */
@customElement("chx-chat")
export class ChxChat extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    loading: { type: Boolean, reflect: true, attribute: true },
    label: { type: String, attribute: true },
    commandFields: { attribute: false },
    userId: { type: String, attribute: true },
    messages: { attribute: false },
    messageElement: { attribute: false },
    partElements: { attribute: false },
    adapter: { attribute: false },
    chunkBatchIntervalMs: { attribute: false },
    connectionState: { type: String, reflect: true, attribute: "connection-state" },
  };

  // real private fields must be declared here, in the class body — a bare `this.#foo = ...` inside
  // the constructor alone isn't enough, unlike a plain `this._foo = ...` convention
  #internalMessages;
  #lastAnnounced;
  #stream; // StreamController, assigned in the constructor
  #activeDeliveries = new Map(); // messageId/replyId -> AbortController
  /** @type {(() => void) | undefined} */
  #unsubscribe; // adapter.subscribe's returned unsubscribe fn, assigned in connectedCallback
  #pagination; // PaginationController, assigned in the constructor
  #typing; // TypingController, assigned in the constructor
  /** @type {DropTargetController} */
  #dropTarget;
  /** @type {ContextProvider<typeof attachmentsContext>} */
  #attachmentsProvider;
  /** @type {ContextProvider<typeof commandsContext>} */
  #commandsProvider;

  constructor() {
    super();

    /** @type {String} */
    this.label = "";

    /** @type {Boolean} */
    this.loading = false;

    /** @type {Map<Element, Element>} */
    this.commandFields = new Map();

    /** @type {String | undefined} */
    this.userId = undefined;

    /** @type {ChxMessage[]} */
    this.messages = [];
    this.#internalMessages = this.messages;
    this.#lastAnnounced = this.messages;

    /** @type {ChxMessageRenderer | undefined} */
    this.messageElement = undefined;

    /** @type {Record<string, ChxPartRenderer> | undefined} */
    this.partElements = undefined;

    /** @type {ChxChatAdapter | undefined} */
    this.adapter = undefined;

    /** @type {number} */
    this.chunkBatchIntervalMs = 16;

    /** @type {"connecting" | "connected" | "error" | undefined} */
    this.connectionState = undefined;

    this.#stream = new StreamController(this, {
      getMessages: () => this.#internalMessages,
      getUserId: () => this.userId,
      onMessagesChange: (messages) => this.#applyMessages(messages),
      chunkBatchIntervalMs: this.chunkBatchIntervalMs,
    });

    this.#pagination = new PaginationController(this, {
      getAdapter: () => this.adapter,
      getMessages: () => this.#internalMessages,
      applyMessages: (messages) => this.#applyMessages(messages),
    });

    this.#typing = new TypingController(this);

    /**
     * Registered on chx-chat itself, not chx-message-composer — chx-chat is
     * the common light-DOM ancestor of both chx-message-list and
     * chx-message-composer, so a drag entering anywhere over either (not
     * just the composer) is caught here. `canDrop` gates the whole thing on
     * a <chx-attachments> actually being connected — if there's nowhere to
     * put a dropped file, the rest of the chat isn't a dropzone either.
     */
    this.#dropTarget = new DropTargetController(this, {
      canDrop: () => !!this.messageComposerElement?.attachmentsElement,
      onDrop: (files) => this.messageComposerElement?.attachmentsElement?.addFiles(files, "drop"),
    });

    /**
     * Provides the currently attached files to any descendant regardless of
     * shadow nesting depth — kept in sync via `chx-attachments-change`
     * (below), not by chx-chat computing anything itself. Chosen over the
     * manual per-level property-push pattern already used for
     * label/loading/commandFields specifically because chx-textbox (the
     * consumer that needs this, for its `textbox_attached` row-gap) sits
     * two shadow levels down (chx-chat → chx-message-composer's shadow →
     * chx-textbox) — context crosses that in one hop, no relay through
     * chx-message-composer needed.
     */
    this.#attachmentsProvider = new ContextProvider(this, {
      context: attachmentsContext,
      initialValue: [],
    });

    /**
     * Same pattern as #attachmentsProvider above, kept in sync via
     * handleChange's own `chx-change` listener (its `commands` detail) instead
     * of a dedicated change event — resolved command chips live inside the
     * ProseMirror doc, not as light-DOM children, so there's no separate
     * slotchange-driven signal to hook the way chx-attachments has one.
     */
    this.#commandsProvider = new ContextProvider(this, {
      context: commandsContext,
      initialValue: [],
    });
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("chx-send-message", /** @type {EventListener} */ (this.handleSend));
    this.addEventListener("chx-change", /** @type {EventListener} */ (this.handleChange));
    this.addEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.handleAttachmentsChange),
    );

    // connectedCallback (not the constructor) — by the time an element is connected, Lit has
    // already applied any `adapter` assigned before upgrade/insertion (its own pre-upgrade
    // instance-property capture), so this is the first point `this.adapter` is reliably settled
    this.#unsubscribe = this.adapter?.subscribe?.({
      onMessage: (message) => this.addMessage(message),
      onChunk: (item) => this.#stream.applyChunk(item),
      onTyping: (isTyping) => this.#typing.setTyping(isTyping),
      onConnectionChange: (state, error) => {
        this.connectionState = state;
        this.dispatchEvent(
          new CustomEvent("chx-connection-change", {
            detail: { state, ...(error !== undefined ? { error } : {}) },
            bubbles: true,
            composed: true,
          }),
        );
      },
    });

    this.#pagination.loadInitial();

    this.addEventListener(LOAD_MORE_EVENT, this.loadMoreHistory);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("chx-send-message", /** @type {EventListener} */ (this.handleSend));
    this.removeEventListener("chx-change", /** @type {EventListener} */ (this.handleChange));
    this.removeEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.handleAttachmentsChange),
    );
    this.removeEventListener(LOAD_MORE_EVENT, this.loadMoreHistory);
    for (const controller of this.#activeDeliveries.values()) controller.abort();
    this.#unsubscribe?.();
  }

  /**
   * Loads one older page of history — see `PaginationController` for the cursor/hasMore/in-flight
   * state and the actual prepend-merge logic, this just forwards to it. Normally triggered by
   * `chx-message-list`'s own scroll-to-top sentinel (`chx-load-more`), callable directly too (e.g.
   * a manual "load more" button).
   */
  loadMoreHistory() {
    return this.#pagination.loadMore();
  }

  /**
   * Thin convenience — same as any other local action, applied to the internal store immediately
   * and firing `chx-messages-change` as a side effect. Matches purely by `message.id`.
   * @param {Omit<ChxMessage, "own" | "createdAt"> & {own?: boolean, createdAt?: number}} message
   */
  addMessage(message) {
    const resolved = /** @type {ChxMessage} */ ({ createdAt: Date.now(), ...message });
    this.#applyMessages(reconcileMessages(this.#internalMessages, resolved, this.userId));
  }

  /**
   * Sets whether the *other* side is currently typing/composing — shown via whatever the app has
   * slotted into `chx-message-list`'s `typing` slot (nothing renders if it slotted nothing). No-op
   * if unchanged from the current value. Driven either by calling this directly, or by
   * `adapter.subscribe`'s `onTyping` handler (above), both funnel into the same `TypingController`.
   * @param {boolean} isTyping
   */
  setTyping(isTyping) {
    this.#typing.setTyping(isTyping);
  }

  /**
   * chx-message-composer is now consumer-authored light DOM (see
   * handleDefaultSlotchange) rather than something chx-chat renders itself,
   * so this is a light-DOM query, not a shadow-root one.
   * @returns {import("../message-composer/message-composer.js").ChxMessageComposer}
   */
  get messageComposerElement() {
    return /** @type {import("../message-composer/message-composer.js").ChxMessageComposer} */ (
      this.querySelector("chx-message-composer")
    );
  }

  /**
   * Same status as messageComposerElement above — consumer-authored,
   * optional light DOM.
   * @returns {import("../message-list/message-list.js").ChxMessageList}
   */
  get messageListElement() {
    return /** @type {import("../message-list/message-list.js").ChxMessageList} */ (
      this.querySelector("chx-message-list")
    );
  }

  /**
   * Resolves the command search identified by `target` (the token handed to
   * the app via command-query's detail) by replacing its tracked range with
   * `node` — see Editor.resolveCommand for the actual insertion logic.
   * A stale `target` is a no-op.
   * @param {string | null} target
   * @param {Node} node
   */
  insertAtCommand(target, node) {
    this.messageComposerElement?.insertAtCommand(target, node);
  }

  /**
   * Programmatically attaches a file — same effect as picking or dropping
   * one. A no-op if no <chx-attachments> is connected anywhere in the
   * composer.
   * @param {File} file
   */
  attachFile(file) {
    this.messageComposerElement?.attachFile(file);
  }

  /**
   * Replaces the composer's document with plain text — e.g. pre-filling a
   * draft or a suggested reply.
   * @param {string} text
   */
  setText(text) {
    this.messageComposerElement?.setText(text);
  }

  /** Focuses the composer's textbox — see chx-message-composer.focus. */
  focus() {
    this.messageComposerElement?.focus();
  }

  /** The ProseMirror facade owned by chx-textbox — see chx-message-composer's `editor` getter. @returns {import("../../editor/Editor.js").Editor | undefined} */
  get editor() {
    return this.messageComposerElement?.editor;
  }

  /** True while an OS file drag carrying files is over the chat (message list included) — driven by `#dropTarget`, pushed down to the composer/textbox for the dashed-border/hint visual. @returns {boolean} */
  get dragging() {
    return this.#dropTarget.dragging;
  }

  /** @param {CustomEvent<{value: string, html: string, attachments: File[], commands: unknown[]}>} event */
  handleSend(event) {
    const { value, html, attachments = [] } = event.detail;
    const id = crypto.randomUUID();
    /** @type {ChxMessage} */
    const message = {
      id,
      authorId: this.userId,
      own: true,
      createdAt: Date.now(),
      status: "sending",
      parts: [
        { id: `${id}-t1`, type: "text", text: value, html },
        ...attachments.map((attachment, index) => ({
          id: `${id}-a${index}`,
          type: "attachment",
          attachment,
        })),
      ],
    };

    this.#applyMessages(reconcileMessages(this.#internalMessages, message, this.userId));
    this.#commandsProvider.setValue([]);
    this.#deliver(message); // not awaited — see #deliver's own doc for what this does
  }

  /**
   * The one choke point every local mutation of the internal store goes through.
   * @param {ChxMessage[]} nextMessages
   */
  #applyMessages(nextMessages) {
    validateMessages(nextMessages);
    this.#internalMessages = nextMessages;
    this.#lastAnnounced = nextMessages;
    this.#announce(nextMessages);
    this.requestUpdate();
  }

  /** @param {ChxMessage[]} messages */
  #announce(messages) {
    this.dispatchEvent(
      new CustomEvent("chx-messages-change", { detail: { messages }, bubbles: true, composed: true }),
    );
  }

  /**
   * AI-agent flavor's reply mechanism — a no-op if no `adapter.sendMessage` is set (a messenger
   * flavor's local-echo-only `handleSend` is unaffected either way).
   * @param {ChxMessage} message
   */
  async #deliver(message) {
    if (!this.adapter?.sendMessage) return;
    const controller = new AbortController();
    this.#activeDeliveries.set(message.id, controller);
    try {
      const stream = await this.adapter.sendMessage(message, { signal: controller.signal });
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId: message.id });
    } catch (error) {
      // a cancellation surfaces either as an explicit {kind:"abort"} chunk (handled entirely
      // inside deliverStream, never reaches this catch) or the adapter's own fetch/EventSource
      // throwing once the signal fires — this branch only ever sees the second case
      const cancelled = controller.signal.aborted;
      const replyStatus = /** @type {"failed" | "cancelled"} */ (cancelled ? "cancelled" : "failed");
      const updated = {
        ...message,
        status: replyStatus,
        ...(cancelled ? {} : { error: { message: String(/** @type {any} */ (error)?.message ?? error) } }),
      };
      const next = reconcileMessages(this.#internalMessages, updated, this.userId);
      // a reply shell can already exist (some chunks arrived before the throw) — close it out too
      const orphanedReply = next.find((m) => m.replyToId === message.id && m.status === "sending");
      this.#applyMessages(
        orphanedReply
          ? next.map((m) =>
              m.id === orphanedReply.id
                ? finalizeStreamingParts({ ...m, status: replyStatus })
                : m,
            )
          : next,
      );
      if (!cancelled) {
        this.dispatchEvent(
          new CustomEvent("chx-send-error", {
            detail: { messageId: message.id, error },
            bubbles: true,
            composed: true,
          }),
        );
      }
    } finally {
      this.#activeDeliveries.delete(message.id);
    }
  }

  /**
   * Re-attempts delivery of a `status: "failed"` message. Also drops any reply already anchored to
   * this send, so a successful retry doesn't leave two replies (mirrors `regenerate()` below).
   * @param {string} messageId
   */
  retry(messageId) {
    const message = this.#internalMessages.find((m) => m.id === messageId);
    if (!message || message.status !== "failed") return;
    const resetMessage = { ...message, status: /** @type {"sending"} */ ("sending"), error: undefined };
    const withoutStaleReply = this.#internalMessages.filter((m) => m.replyToId !== messageId);
    this.#applyMessages(reconcileMessages(withoutStaleReply, resetMessage, this.userId));
    this.#deliver(resetMessage);
  }

  /**
   * Aborts an in-flight `sendMessage`/`regenerate` delivery — `messageId` is whichever id that
   * delivery is tracked under (the send's own id, or a reply's id for a `regenerate` in flight).
   * A no-op if nothing is currently in flight for that id.
   * @param {string} messageId
   */
  cancel(messageId) {
    this.#activeDeliveries.get(messageId)?.abort();
  }

  /**
   * Redoes a specific assistant reply — a different action from retry(): retry() re-sends a
   * failed *user* message, this redoes an existing *assistant reply*, whether it succeeded,
   * failed, or was left orphaned mid-stream. Removes the existing reply before requesting a fresh
   * one. No-op if no matching reply is found or `adapter.regenerate` isn't set.
   * @param {string} messageId — either the reply's own id, or its anchoring send's id
   */
  regenerate(messageId) {
    const reply =
      this.#internalMessages.find((m) => m.id === messageId && m.replyToId) ??
      this.#internalMessages.find((m) => m.replyToId === messageId);
    if (!reply || !this.adapter?.regenerate) return;

    this.#applyMessages(this.#internalMessages.filter((m) => m.id !== reply.id));
    this.#deliverRegenerate(reply.id, /** @type {string} */ (reply.replyToId));
  }

  /**
   * @param {string} replyId
   * @param {string} replyToId
   */
  async #deliverRegenerate(replyId, replyToId) {
    const controller = new AbortController();
    this.#activeDeliveries.set(replyId, controller);
    try {
      const stream = await this.adapter?.regenerate?.(replyId, { signal: controller.signal });
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId });
    } catch (error) {
      // regenerate() already removed the old reply — if a fresh one started streaming before the
      // failure, close it out too; if nothing arrived yet, there's nothing to find or close
      const cancelled = controller.signal.aborted;
      const orphanedReply = this.#internalMessages.find(
        (m) => m.replyToId === replyToId && m.status === "sending",
      );
      if (orphanedReply) {
        const replyStatus = /** @type {"failed" | "cancelled"} */ (cancelled ? "cancelled" : "failed");
        this.#applyMessages(
          this.#internalMessages.map((m) =>
            m.id === orphanedReply.id ? finalizeStreamingParts({ ...m, status: replyStatus }) : m,
          ),
        );
      }
      if (!cancelled) {
        this.dispatchEvent(
          new CustomEvent("chx-send-error", {
            detail: { messageId: replyId, error },
            bubbles: true,
            composed: true,
          }),
        );
      }
    } finally {
      this.#activeDeliveries.delete(replyId);
    }
  }

  /** @param {CustomEvent<{commands: Array<{label: string, element: HTMLElement}>}>} event */
  handleChange(event) {
    console.log(event.detail);
    this.#commandsProvider.setValue(event.detail.commands ?? []);
  }

  /** @param {CustomEvent<{attachments: File[]}>} event */
  handleAttachmentsChange = (event) => {
    this.#attachmentsProvider.setValue(event.detail.attachments);
  };

  /**
   * Sole discovery point for <chx-command-field> — chx-chat is the direct
   * parent of both chx-message-composer and (once it consumes this too)
   * chx-message-list, so a plain property passed to both is enough; no
   * `@lit/context` needed. Key and value are both the live element —
   * chx-chat stays agnostic of what a "plugin" even is, doesn't read
   * commandCharacter itself, just tracks connected elements.
   * @param {Event} event
   */
  handleCommandFieldSlotchange(event) {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    this.commandFields = new Map(
      slot.assignedElements({ flatten: true }).map((element) => [element, element]),
    );
  }

  /**
   * chx-message-list/chx-message-composer are consumer-authored light DOM —
   * chx-chat only orchestrates layout (see chat.css's ::slotted() rules) and
   * pushes its own config onto whatever composer/list shows up here, since
   * it can no longer bind properties onto them via its own template.
   */
  handleDefaultSlotchange() {
    this.pushComposerProperties();
    this.pushMessageListProperties();
  }

  pushComposerProperties() {
    const composer = this.messageComposerElement;
    if (!composer) return;
    composer.label = this.label;
    composer.loading = this.loading;
    composer.commandFields = this.commandFields;
    composer.dragging = this.dragging;
  }

  /**
   * The message list only needs the drag-overlay state (see
   * message-list.js's own `dragging`/`dropHint`) — it has no
   * label/loading/commandFields concept of its own.
   */
  pushMessageListProperties() {
    const list = this.messageListElement;
    if (!list) return;
    list.dragging = this.dragging;
    list.messages = this.#internalMessages;
    list.messageElement = this.messageElement;
    list.partElements = this.partElements;
    list.typing = this.#typing.isTyping();
    list.streaming = this.#isWaitingForReply();
  }

  /**
   * True while at least one in-flight delivery (`#deliver`/`#deliverRegenerate`) hasn't produced its
   * reply shell yet — the "waiting for a reply, no message to attach a status to yet" window.
   * Derived fresh each render, not tracked incrementally — `#activeDeliveries` is small in practice
   * (0-1 concurrent deliveries in the normal case), so this scan is cheap.
   * @returns {boolean}
   */
  #isWaitingForReply() {
    for (const deliveryId of this.#activeDeliveries.keys()) {
      if (!this.#internalMessages.some((message) => message.replyToId === deliveryId)) return true;
    }
    return false;
  }

  /**
   * An app-assigned `messages` is authoritative, but only when it's not just an echo of what
   * `#applyMessages` itself last produced.
   * @param {import("lit").PropertyValues} changedProperties
   */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (changedProperties.has("messages") && this.messages !== this.#lastAnnounced) {
      validateMessages(this.messages);
      this.#internalMessages = this.messages;
      this.#lastAnnounced = this.messages;
    }
  }

  /**
   * Runs on every update, not gated to specific changedProperties keys —
   * `dragging` is controller-driven (DropTargetController calls
   * requestUpdate() directly, not through a declared reactive property), so
   * it never shows up in changedProperties the way label/loading/
   * commandFields do. Cheap enough to just always re-push.
   * @param {import("lit").PropertyValues} changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    this.pushComposerProperties();
    this.pushMessageListProperties();
  }

  render() {
    return html`
      <slot @slotchange=${this.handleDefaultSlotchange}></slot>
      <slot name="command-field" @slotchange=${this.handleCommandFieldSlotchange}></slot>
    `;
  }
}
