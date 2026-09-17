import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextProvider } from "@lit/context";

import "../message-composer/message-composer.js";
import "../message-list/message-list.js";
import { DropTargetController } from "../../controllers/DropTargetController.js";
import { attachmentsContext } from "../../context/attachments-context.js";
import { reconcileMessages } from "../../utils/messages.js";
import { validateMessages } from "../../utils/validate-messages.js";
import { StreamController } from "../../controllers/StreamController.js";
import { PaginationController } from "../../controllers/PaginationController.js";
import { TypingController } from "../../controllers/TypingController.js";
import { RealtimeSyncController } from "../../controllers/RealtimeSyncController.js";
import { finalizeStreamingParts } from "../../stream/streamHelpers.js";

import styles from "./chat.css?inline";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxChatAdapter, ChxMessageRenderer, ChxPartRenderer } from "../../types/adapter.js" */
/** @import { ChxConversation } from "../../types/conversation.js" */

/**
 * @tag chx-chat
 * @summary Chat.
 */
@customElement("chx-chat")
export class ChxChat extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    loading: { type: Boolean, reflect: true, attribute: true },
    userId: { type: String, attribute: true },
    activeConversationId: { type: String, attribute: "active-conversation-id" },
    initialActiveConversationId: { type: String, attribute: "initial-active-conversation-id" },
    conversations: { attribute: false },
    initialConversations: { type: Array, attribute: "initial-conversations" },
    restoreScrollPosition: { type: Boolean, attribute: "restore-scroll-position" },
    messages: { attribute: false },
    messageElement: { attribute: false },
    partElements: { attribute: false },
    adapter: { attribute: false },
    chunkBatchIntervalMs: { attribute: false },
    connectionState: { type: String, reflect: true, attribute: "connection-state" },
    readTracking: { type: Boolean, attribute: "read-tracking" },
  };

  // real private fields must be declared here, in the class body — a bare `this.#foo = ...` inside
  // the constructor alone isn't enough, unlike a plain `this._foo = ...` convention
  #internalMessages;
  #lastAnnounced;
  #stream; // StreamController, assigned in the constructor
  /** @type {Map<string, {controller: AbortController, conversationId: string | undefined}>} */
  #activeDeliveries = new Map(); // messageId/replyId -> in-flight delivery, tagged with the conversation it belongs to
  /** @type {(() => void) | undefined} */
  #unsubscribe; // adapter.subscribe's returned unsubscribe fn, assigned in connectedCallback
  /** @type {ChxChatAdapter | undefined} */
  #subscribedAdapter; // whichever adapter #unsubscribe actually belongs to — see updated()'s re-subscribe guard
  /** @type {Map<string, number | undefined>} */
  #scrollOffsets = new Map(); // conversationId -> chx-message-list scroll offset, captured/restored on activeConversationId switch
  #pendingScrollRestore = false;
  #pagination; // PaginationController, assigned in the constructor
  #typing; // TypingController, assigned in the constructor
  #realtimeSync; // RealtimeSyncController, assigned in the constructor
  /** @type {DropTargetController} */
  #dropTarget;
  /** @type {ContextProvider<typeof attachmentsContext>} */
  #attachmentsProvider;

  constructor() {
    super();

    /** @type {Boolean} */
    this.loading = false;

    /** @type {String | undefined} */
    this.userId = undefined;

    /** @type {String | undefined} */
    this.activeConversationId = undefined;

    /**
     * The initial active conversation ID when uncontrolled. Ignored after initialization and when
     * `activeConversationId` is provided — consulted exactly once, in `connectedCallback()`, only if
     * `activeConversationId` is still `undefined` at that point.
     * @type {String | undefined}
     */
    this.initialActiveConversationId = undefined;

    /**
     * Metadata for a picker UI (chx-conversations, or a consumer's own) — chx-chat itself only
     * stores this, it doesn't fetch or interpret it. `undefined` (not `[]`) until either an app
     * assignment or `initialConversations`'s own one-time seed resolves it — see that property.
     * @type {ChxConversation[] | undefined}
     */
    this.conversations = undefined;

    /**
     * The initial conversations when uncontrolled. Ignored after initialization and when
     * `conversations` is provided — same one-time, `connectedCallback()`-time seed contract as
     * `initialActiveConversationId` above.
     * @type {ChxConversation[] | undefined}
     */
    this.initialConversations = undefined;

    /** Whether switching `activeConversationId` restores that conversation's remembered scroll position (opt out to always land at the bottom on switch). @type {Boolean} */
    this.restoreScrollPosition = true;

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

    /**
     * Opt-in master switch for read tracking (`.claude/plans/messages/read-tracking.md`) — `false` by
     * default. Pushed straight through to `chx-message-list.readTracking` (see
     * `pushMessageListProperties`); `chx-message-list` itself is what actually gates the
     * `IntersectionObserver` observation and, through that, whether `chx-message-read`/
     * `adapter.markRead` ever fire.
     * @type {boolean}
     */
    this.readTracking = false;

    this.#stream = new StreamController(this, {
      getMessages: () => this.#internalMessages,
      getUserId: () => this.userId,
      onMessagesChange: (messages, conversationId) => this.#applyMessages(messages, conversationId),
      chunkBatchIntervalMs: this.chunkBatchIntervalMs,
    });

    this.#pagination = new PaginationController(this, {
      getAdapter: () => this.adapter,
      getMessages: () => this.#internalMessages,
      applyMessages: (messages, conversationId) => this.#applyMessages(messages, conversationId),
      getConversationId: () => this.activeConversationId,
    });

    /**
     * Cache management surface — `clear(conversationId?)` drops cached messages and pagination
     * state for one conversation, or (no argument) every cached conversation at once. A lower-level
     * primitive than `refresh()`: it doesn't re-fetch afterwards. Future home for a pluggable
     * `get`/`set` storage seam (persisting to localStorage/a server instead of the in-memory default)
     * — not built yet, `clear()` is the only method today.
     * @type {{clear: (conversationId?: string) => void}}
     */
    this.cache = { clear: (conversationId) => this.#clearCache(conversationId) };

    this.#typing = new TypingController(this);

    this.#realtimeSync = new RealtimeSyncController({
      getActiveConversationId: () => this.activeConversationId,
      setTyping: (isTyping) => this.setTyping(isTyping),
      clearActiveConversation: () => {
        this.activeConversationId = undefined;
        this.dispatchEvent(
          new CustomEvent("chx-active-conversation-change", {
            detail: { conversationId: undefined },
            bubbles: true,
            composed: true,
          }),
        );
      },
      markMessageRead: (messageId) => this.#markMessageRead(messageId),
    });

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
     * loading specifically because chx-textbox (the
     * consumer that needs this, for its `textbox_attached` row-gap) sits
     * two shadow levels down (chx-chat → chx-message-composer's shadow →
     * chx-textbox) — context crosses that in one hop, no relay through
     * chx-message-composer needed.
     */
    this.#attachmentsProvider = new ContextProvider(this, {
      context: attachmentsContext,
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
    this.addEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.handleAttachmentsChange),
    );
    this.addEventListener(
      "chx-active-conversation-change",
      /** @type {EventListener} */ (this.handleActiveConversationChange),
    );
    this.addEventListener("chx-message-read", /** @type {EventListener} */ (this.#handleMessageRead));

    // Uncontrolled seeds — only apply if still undefined, so a reconnect or an app-provided value no-ops.
    if (this.conversations === undefined) this.conversations = this.initialConversations ?? [];
    if (this.activeConversationId === undefined) {
      this.activeConversationId = this.initialActiveConversationId;
    }

    // Pre-upgrade property capture means `adapter` is already settled by now.
    this.#subscribedAdapter = this.adapter;
    this.#unsubscribe = this.#subscribeAdapter();

    // Shares PaginationController's per-conversation `loading` flag with LoadMoreController's own
    // accidental empty-list trigger, so this can't double-fetch — see PaginationController.loadInitial.
    this.#pagination.loadInitial();
  }

  /**
   * One long-lived, conversation-spanning subscription — never re-invoked on an `activeConversationId`
   * switch (see `ChxChatAdapter.subscribe`'s own doc), only when `adapter` itself is reassigned to a
   * different instance (see `updated()`'s re-subscribe guard).
   * @returns {(() => void) | undefined}
   */
  #subscribeAdapter() {
    return this.adapter?.subscribe?.({
      onMessage: (message) => this.addMessage(message),
      onChunk: (item) => this.#stream.applyChunk(item),
      onTyping: (isTyping) => this.#typing.setTyping(isTyping),
      onEvent: (event) => this.#realtimeSync.handleEvent(event),
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
  }

  /**
   * Lets any descendant — a future `<chx-conversations>`, or a consumer's own bespoke picker UI —
   * drive the active conversation purely by dispatching a standard event, the same "action bubbles
   * up, chx-chat listens on itself" shape `chx-send-message`/`chx-attachments-change` already use.
   * Was in-only; `RealtimeSyncController`'s `clearActiveConversation` now also dispatches this same
   * event outward (`conversationId: undefined`) when a realtime `conversation-removed` clears the
   * active conversation — see `.claude/plans/messages/realtime-sync.md`.
   * @param {CustomEvent<{conversationId: string | undefined}>} event
   */
  handleActiveConversationChange(event) {
    this.activeConversationId = event.detail.conversationId;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("chx-send-message", /** @type {EventListener} */ (this.handleSend));
    this.removeEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.handleAttachmentsChange),
    );
    this.removeEventListener("chx-message-read", /** @type {EventListener} */ (this.#handleMessageRead));
    for (const { controller } of this.#activeDeliveries.values()) controller.abort();
    this.#unsubscribe?.();
  }

  /**
   * Loads one older page of history — see `PaginationController` for the cursor/hasMore/in-flight
   * state and the actual prepend-merge logic, this just forwards to it. Normally reached when
   * `chx-message-list`'s `onLoadMore` fires near the top (wired through `syncMessageList` below),
   * callable directly too (e.g. a manual "load more" button). Re-entrancy is guarded by
   * `PaginationController` itself (no-op while loading or exhausted); the list additionally gates on
   * the `loading`/`hasMore` it's pushed, so no promise hand-back is needed.
   */
  loadMoreHistory() {
    return this.#pagination.loadMore();
  }

  /**
   * Thin convenience — same as any other local action, applied to the internal store immediately
   * and firing `chx-messages-change` as a side effect. Matches purely by `message.id`. Defaults
   * `conversationId` to the active conversation, but a caller can target a different (e.g.
   * currently-backgrounded) one explicitly — the same path `adapter.subscribe`'s `onMessage` itself
   * goes through, since an incoming message can belong to any conversation, not just the visible one.
   * @param {Omit<ChxMessage, "own" | "createdAt"> & {own?: boolean, createdAt?: number}} message
   */
  addMessage(message) {
    const resolved = /** @type {ChxMessage} */ ({
      createdAt: Date.now(),
      conversationId: this.activeConversationId,
      ...message,
    });
    this.#applyMessages(
      reconcileMessages(this.#internalMessages, resolved, this.userId),
      resolved.conversationId,
    );
  }

  /**
   * Re-fetches a conversation from scratch: clears its cache (see `cache.clear()`) and calls
   * `loadInitial()` again, which re-invokes `adapter.listMessages()`. Defaults to the active
   * conversation — this is also the general "reset chat state" primitive for a single-conversation
   * `chx-chat` (`activeConversationId` never set): it clears every message and refetches the one
   * implicit conversation from scratch. Useful as a manual refresh/pull-to-refresh action, or to
   * recover from a failed initial load, which `loadInitial()` never silently retries on its own.
   * @param {string} [conversationId]
   */
  refresh(conversationId = this.activeConversationId) {
    this.cache.clear(conversationId);
    this.#pagination.loadInitial(conversationId);
  }

  /**
   * The mechanism behind the public `cache` object's `clear()` — see its own doc on `cache` above.
   * `conversationId === undefined` means "no argument was passed," never "a real conversation whose
   * id happens to be undefined" (ids are always non-empty strings), so it's an unambiguous "clear
   * everything" signal, not a collision with the single-conversation case.
   * @param {string} [conversationId]
   */
  #clearCache(conversationId) {
    if (conversationId === undefined) {
      this.#pagination.forgetAll();
      this.#scrollOffsets.clear();
      this.#applyMessages([]);
      return;
    }
    this.#pagination.forget(conversationId);
    this.#scrollOffsets.delete(conversationId);
    this.#applyMessages(
      this.#internalMessages.filter((m) => m.conversationId !== conversationId),
      conversationId,
    );
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
   * Sets `ChxMessage.readState` to `"read"` for one message — the mechanism behind an inbound
   * `ChxReadEvent` (`adapter.subscribe`'s `onEvent`, `{type: "read", messageId}`), routed through
   * `RealtimeSyncController`. A no-op if the message isn't found. Idempotent, not a toggle — a
   * `ChxReadEvent` is a one-way "this was read" signal with no direction field, and a realtime
   * transport can redeliver it; toggling would flip an already-read message back to `"unread"` on
   * redelivery, and would turn an own/never-opted-in message's `undefined` `readState` into
   * `"unread"` on first delivery. Per-message only — does not touch `ChxConversation.readState`/
   * `unreadCount`, which stay parked on `<chx-conversations>` per `realtime-sync.md`; see
   * `.claude/plans/messages/read-tracking.md`.
   * @param {string} messageId
   */
  #markMessageRead(messageId) {
    const message = this.#internalMessages.find((m) => m.id === messageId);
    if (!message || message.readState === "read") return;
    this.#applyMessages(
      this.#internalMessages.map((m) => (m.id === messageId ? { ...m, readState: "read" } : m)),
      message.conversationId,
    );
  }

  /**
   * chx-message-composer is consumer-authored light DOM, assigned to the
   * `message-composer` slot (see handleMessageComposerSlotchange) rather
   * than something chx-chat renders itself, so this is a light-DOM query,
   * not a shadow-root one.
   * @returns {import("../message-composer/message-composer.js").ChxMessageComposer}
   */
  get messageComposerElement() {
    return /** @type {import("../message-composer/message-composer.js").ChxMessageComposer} */ (
      this.querySelector("chx-message-composer")
    );
  }

  /**
   * Same status as messageComposerElement above — consumer-authored,
   * optional light DOM, assigned to the `message-list` slot.
   * @returns {import("../message-list/message-list.js").ChxMessageList}
   */
  get messageListElement() {
    return /** @type {import("../message-list/message-list.js").ChxMessageList} */ (
      this.querySelector("chx-message-list")
    );
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

  /** @param {CustomEvent<{value: string, html: string, attachments: File[]}>} event */
  handleSend(event) {
    const { value, html, attachments = [] } = event.detail;
    const conversationId = this.activeConversationId;
    const id = crypto.randomUUID();
    /** @type {ChxMessage} */
    const message = {
      id,
      conversationId,
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

    this.#applyMessages(reconcileMessages(this.#internalMessages, message, this.userId), conversationId);
    this.#deliver(message, conversationId); // not awaited — see #deliver's own doc for what this does
  }

  /**
   * `#internalMessages` holds every cached conversation's messages together, tagged by
   * `conversationId` — this is what's actually rendered/announced: the active conversation's own
   * slice (or everything, when `activeConversationId` is never used — the single-conversation case).
   * @returns {ChxMessage[]}
   */
  get #visibleMessages() {
    return this.activeConversationId === undefined
      ? this.#internalMessages
      : this.#internalMessages.filter((message) => message.conversationId === this.activeConversationId);
  }

  /**
   * The one choke point every local mutation of the internal store goes through. `nextMessages` is
   * always the *full*, multi-conversation array — `conversationId` says which conversation this
   * particular write is *for* (a background delivery/pagination fetch can write here for a
   * conversation that isn't currently active, see `#deliver`/`PaginationController`); only a write
   * matching the active conversation actually renders or fires `chx-messages-change`, so a
   * backgrounded conversation's cache stays silently up to date until the app switches to it.
   * @param {ChxMessage[]} nextMessages
   * @param {string} [conversationId]
   */
  #applyMessages(nextMessages, conversationId = this.activeConversationId) {
    validateMessages(nextMessages);
    this.#internalMessages = nextMessages;
    if (conversationId !== this.activeConversationId) return;
    const visible = this.#visibleMessages;
    this.#lastAnnounced = visible;
    this.#announce(visible);
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
   * flavor's local-echo-only `handleSend` is unaffected either way). `conversationId` is captured by
   * the caller up front, not read from `this.activeConversationId` again in here — the app may have
   * switched to a different conversation by the time this (unawaited) delivery settles, and every
   * write below must still land on the conversation this send actually belongs to.
   * @param {ChxMessage} message
   * @param {string} [conversationId]
   */
  async #deliver(message, conversationId) {
    if (!this.adapter?.sendMessage) return;
    const controller = new AbortController();
    this.#activeDeliveries.set(message.id, { controller, conversationId });
    try {
      const stream = await this.adapter.sendMessage(message, { signal: controller.signal });
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId: message.id, conversationId });
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
        conversationId,
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
    const conversationId = message.conversationId;
    const resetMessage = { ...message, status: /** @type {"sending"} */ ("sending"), error: undefined };
    const withoutStaleReply = this.#internalMessages.filter((m) => m.replyToId !== messageId);
    this.#applyMessages(reconcileMessages(withoutStaleReply, resetMessage, this.userId), conversationId);
    this.#deliver(resetMessage, conversationId);
  }

  /**
   * Aborts an in-flight `sendMessage`/`regenerate` delivery — `messageId` is whichever id that
   * delivery is tracked under (the send's own id, or a reply's id for a `regenerate` in flight).
   * A no-op if nothing is currently in flight for that id.
   * @param {string} messageId
   */
  cancel(messageId) {
    this.#activeDeliveries.get(messageId)?.controller.abort();
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

    const conversationId = reply.conversationId;
    this.#applyMessages(
      this.#internalMessages.filter((m) => m.id !== reply.id),
      conversationId,
    );
    this.#deliverRegenerate(reply.id, /** @type {string} */ (reply.replyToId), conversationId);
  }

  /**
   * @param {string} replyId
   * @param {string} replyToId
   * @param {string} [conversationId] - see #deliver's own note on why this is captured up front
   */
  async #deliverRegenerate(replyId, replyToId, conversationId) {
    const controller = new AbortController();
    this.#activeDeliveries.set(replyId, { controller, conversationId });
    try {
      const stream = await this.adapter?.regenerate?.(replyId, { signal: controller.signal, conversationId });
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId, conversationId });
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
          conversationId,
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

  /** @param {CustomEvent<{attachments: File[]}>} event */
  handleAttachmentsChange = (event) => {
    this.#attachmentsProvider.setValue(event.detail.attachments);
  };

  /**
   * Fire-and-forget, per Decision 5 of `.claude/plans/messages/read-tracking.md` — no
   * `chx-messages-change`/status update depends on this call's outcome, and a rejected promise is
   * left uncaught, same as every other fire-and-forget adapter call in this file.
   * @param {CustomEvent<{messageId: string}>} event
   */
  #handleMessageRead = (event) => {
    this.adapter?.markRead?.({
      conversationId: this.activeConversationId,
      messageId: event.detail.messageId,
    });
  };

  /**
   * chx-message-list/chx-message-composer are consumer-authored light DOM,
   * each required to carry its own `slot="message-list"`/
   * `slot="message-composer"` attribute — chx-chat only orchestrates layout
   * (see chat.css's ::slotted() rules) and pushes its own config onto
   * whatever composer/list shows up here, since it can no longer bind
   * properties onto them via its own template.
   */
  handleMessageListSlotchange() {
    this.pushMessageListProperties();
  }

  /** @see handleMessageListSlotchange */
  handleMessageComposerSlotchange() {
    this.pushComposerProperties();
  }

  pushComposerProperties() {
    const composer = this.messageComposerElement;
    if (!composer) return;
    composer.loading = this.loading;
    composer.dragging = this.dragging;
    composer.messagesEmpty = this.#internalMessages.length === 0;
  }

  /**
   * The message list only needs the drag-overlay state (see
   * message-list.js's own `dragging`/`dropHint`) — it has no
   * loading concept of its own.
   */
  pushMessageListProperties() {
    const list = this.messageListElement;
    if (!list) return;
    list.dragging = this.dragging;
    list.messages = this.#visibleMessages;
    list.messageElement = this.messageElement;
    list.partElements = this.partElements;
    list.typing = this.#typing.isTyping();
    list.streaming = this.#isWaitingForReply();
    list.loading = this.#pagination.loading;
    list.hasMore = this.#pagination.hasMore;
    list.readTracking = this.readTracking;
    // chx-message-list forwards this to chx-infinity-scroll, whose LoadMoreController awaits it near
    // the top of the scroll — the sole load-more path now.
    list.onLoadMore = () => this.#pagination.loadMore();
  }

  /**
   * True while at least one in-flight delivery *for the active conversation* (`#deliver`/
   * `#deliverRegenerate`) hasn't produced its reply shell yet — the "waiting for a reply, no message
   * to attach a status to yet" window. A backgrounded conversation's own in-flight delivery is
   * deliberately excluded — its streaming indicator belongs to whichever chat is actually showing it.
   * Derived fresh each render, not tracked incrementally — `#activeDeliveries` is small in practice
   * (0-1 concurrent deliveries per conversation in the normal case), so this scan is cheap.
   * @returns {boolean}
   */
  #isWaitingForReply() {
    for (const [deliveryId, delivery] of this.#activeDeliveries) {
      if (delivery.conversationId !== this.activeConversationId) continue;
      if (!this.#internalMessages.some((message) => message.replyToId === deliveryId)) return true;
    }
    return false;
  }

  /**
   * An app-assigned `messages` is authoritative, but only when it's not just an echo of what
   * `#applyMessages` itself last produced — scoped to the active conversation's own slice, other
   * cached conversations' entries in `#internalMessages` are left untouched.
   * @param {import("lit").PropertyValues} changedProperties
   */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);

    if (changedProperties.has("activeConversationId")) {
      const previousId = /** @type {string | undefined} */ (
        changedProperties.get("activeConversationId")
      );
      if (this.restoreScrollPosition && previousId !== undefined) {
        this.#scrollOffsets.set(previousId, this.messageListElement?.list?.getScrollOffset());
      }
      // A `typing` realtime event is filtered to the active conversation on the way in (see
      // RealtimeSyncController), but the resulting boolean has no memory of which conversation it
      // was last true for — reset it here so a stale `true` doesn't bleed into the newly-active one.
      this.setTyping(false);
      if (this.activeConversationId !== undefined && !this.#pagination.hasVisited(this.activeConversationId)) {
        this.#pagination.loadInitial();
      }
      this.#pendingScrollRestore = this.restoreScrollPosition;
    }

    if (changedProperties.has("messages") && this.messages !== this.#lastAnnounced) {
      validateMessages(this.messages);
      const conversationId = this.activeConversationId;
      const stamped =
        conversationId === undefined
          ? this.messages
          : this.messages.map((m) => (m.conversationId === conversationId ? m : { ...m, conversationId }));
      this.#internalMessages =
        conversationId === undefined
          ? stamped
          : [...this.#internalMessages.filter((m) => m.conversationId !== conversationId), ...stamped];
      this.#lastAnnounced = this.messages;
    }
  }

  /**
   * Restores `conversationId`'s remembered scroll offset (captured in `willUpdate` above) once its
   * messages have actually rendered — awaiting `chx-message-list`'s own `updateComplete` first, since
   * its render (and `chx-infinity-scroll`'s underneath it) happens on a separate microtask from
   * `chx-chat`'s. A conversation with no remembered offset (first visit) is left alone — the
   * virtualizer's own default (bottom-anchored) is already the right resting place for it.
   * @param {string | undefined} conversationId
   */
  async #restoreScroll(conversationId) {
    const offset = conversationId === undefined ? undefined : this.#scrollOffsets.get(conversationId);
    if (offset === undefined) return;
    await this.messageListElement?.updateComplete;
    this.messageListElement?.list?.scrollToOffset(offset);
  }

  /**
   * Runs on every update, not gated to specific changedProperties keys —
   * `dragging` is controller-driven (DropTargetController calls
   * requestUpdate() directly, not through a declared reactive property), so
   * it never shows up in changedProperties the way loading does. Cheap
   * enough to just always re-push.
   * @param {import("lit").PropertyValues} changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    // `adapter` is compared by reference, guarded against the same instance being reassigned (a
    // no-op reassignment wouldn't show up in changedProperties at all, but the initial mount value
    // does — without the identity check, connectedCallback's own subscribe would immediately be torn
    // down and redone here on every first render)
    if (changedProperties.has("adapter") && this.adapter !== this.#subscribedAdapter) {
      this.#unsubscribe?.();
      this.#subscribedAdapter = this.adapter;
      this.#unsubscribe = this.#subscribeAdapter();
    }
    this.pushComposerProperties();
    this.pushMessageListProperties();
    if (this.#pendingScrollRestore) {
      this.#pendingScrollRestore = false;
      this.#restoreScroll(this.activeConversationId); // not awaited — see #restoreScroll's own doc
    }
  }

  render() {
    return html`
      <slot name="message-list" @slotchange=${this.handleMessageListSlotchange}></slot>
      <slot name="message-composer" @slotchange=${this.handleMessageComposerSlotchange}></slot>
    `;
  }
}
