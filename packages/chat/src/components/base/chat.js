import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextProvider } from "@lit/context";

import "../message-composer/message-composer.js";
import "../message-list/message-list.js";
import { DropTargetController } from "../../controllers/chat/DropTargetController.js";
import { attachmentsContext } from "../../context/attachments-context.js";
import { reconcileMessages } from "../../utils/messages.js";
import { validateMessages } from "../../utils/validate-messages.js";
import { StreamController } from "../../controllers/chat/StreamController.js";
import { ConversationModeController } from "../../controllers/chat/ConversationModeController.js";
import { DeliveryController } from "../../controllers/chat/DeliveryController.js";
import { PaginationController } from "../../controllers/chat/PaginationController.js";
import { ScrollMemoryController } from "../../controllers/chat/ScrollMemoryController.js";
import { TypingController } from "../../controllers/chat/TypingController.js";
import { RealtimeSyncController } from "../../controllers/chat/RealtimeSyncController.js";
import { finalizeStreamingParts } from "../../stream/streamHelpers.js";
import { DEFAULT_CONVERSATION_ID } from "../../constants.js";

import styles from "./chat.css?inline";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxChatAdapter, ChxPartRenderer } from "../../types/adapter.js" */
/** @import { ChxConversation } from "../../types/conversation.js" */

/**
 * @tag chx-chat
 * @summary Chat.
 * @fires chx-delivery-start - `{messageId, conversationId}`, when a send/regenerate starts streaming.
 * @fires chx-delivery-end - `{messageId, conversationId, outcome}`, `outcome` being completed/cancelled/failed.
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
    partElements: { attribute: false },
    adapter: { attribute: false },
    chunkBatchIntervalMs: { attribute: false },
    connectionState: { type: String, reflect: true, attribute: "connection-state" },
    readTracking: { type: Boolean, attribute: "read-tracking" },
    noVirtualization: { type: Boolean, attribute: "no-virtualization" },
    compact: { type: Boolean, reflect: true, attribute: true },
    // Set by a bound <chx-conversations> to mark this chat as conversation-driven (multi-conversation
    // mode), so an empty/removed selection shows the empty state instead of the default conversation.
    conversationsPresent: { attribute: false },
  };

  // real private fields must be declared here, in the class body — a bare `this.#foo = ...` inside
  // the constructor alone isn't enough, unlike a plain `this._foo = ...` convention
  #internalMessages;
  #lastAnnounced;
  /** @type {StreamController} */
  #stream; // assigned in the constructor
  /** @type {DeliveryController} */
  #delivery; // in-flight turns + derived status/busy — assigned in the constructor
  /** @type {(() => void) | undefined} */
  #unsubscribe; // adapter.subscribe's returned unsubscribe fn, assigned in connectedCallback
  /** @type {ChxChatAdapter | undefined} */
  #subscribedAdapter; // whichever adapter #unsubscribe actually belongs to — see updated()'s re-subscribe guard
  /** @type {ScrollMemoryController} */
  #scrollMemory; // per-conversation scroll offsets — assigned in the constructor
  // Latched: true once any conversation signal appears (a bound <chx-conversations>, conversations
  // data, or an activeConversationId). Never flips back, so removing every conversation lands in the
  // empty state rather than silently reverting to the single-conversation default.
  /** @type {ConversationModeController} */
  #conversationMode; // single- vs multi-conversation latches + empty state — assigned in the constructor
  /** @type {{source: ChxMessage[], id: string | symbol | null, visible: ChxMessage[]} | undefined} */
  #visibleCache; // memo for #visibleMessages, invalidated by reference on every #internalMessages write
  /** @type {string | undefined} */
  #unkeyedTypingId; // conversation the last conversation-less setTyping/onTyping was attributed to
  /** @type {PaginationController} */
  #pagination; // assigned in the constructor
  /** @type {TypingController} */
  #typing; // assigned in the constructor
  /** @type {RealtimeSyncController} */
  #realtimeSync; // assigned in the constructor
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

    /** @type {Record<string, ChxPartRenderer> | undefined} */
    this.partElements = undefined;

    /** @type {ChxChatAdapter | undefined} */
    this.adapter = undefined;

    /** @type {number} */
    this.chunkBatchIntervalMs = 16;

    /** @type {"connecting" | "connected" | "error" | undefined} */
    this.connectionState = undefined;

    /**
     * Opt-in master switch for read tracking — `false` by default. Pushed straight through to
     * `chx-message-list.readTracking` (see `pushMessageListProperties`); `chx-message-list` itself is
     * what actually gates the `IntersectionObserver` observation and, through that, whether
     * `chx-message-read`/`adapter.markRead` ever fire.
     * @type {boolean}
     */
    this.readTracking = false;

    /**
     * Opt-in real-DOM mode for `chx-message-list`'s `chx-infinity-scroll` — every message renders in
     * full, in normal document flow, no windowing/measurement. Pushed straight through to
     * `chx-message-list.noVirtualization` (see `pushMessageListProperties`).
     * @type {boolean}
     */
    this.noVirtualization = false;

    /** Pushed straight through to `chx-message-list.compact` and `chx-message-composer.compact`. @type {boolean} */
    this.compact = false;

    /** Set true by a bound `<chx-conversations>` — engages multi-conversation mode. @type {boolean} */
    this.conversationsPresent = false;

    this.#stream = new StreamController(this, {
      getMessages: () => this.#internalMessages,
      getUserId: () => this.userId,
      onMessagesChange: (messages, conversationId) => this.#applyMessages(messages, conversationId),
      chunkBatchIntervalMs: this.chunkBatchIntervalMs,
    });

    this.#conversationMode = new ConversationModeController({
      getConversationsPresent: () => this.conversationsPresent,
      getConversations: () => this.conversations,
      getInitialConversations: () => this.initialConversations,
      getInitialActiveConversationId: () => this.initialActiveConversationId,
      getActiveConversationId: () => this.activeConversationId,
    });

    this.#scrollMemory = new ScrollMemoryController({
      getMessageListElement: () => this.messageListElement,
      getEnabled: () => this.restoreScrollPosition,
    });

    this.#delivery = new DeliveryController(this, {
      getActiveConversationId: () => this.activeConversationId,
      getMessages: () => this.#internalMessages,
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
      setTyping: (isTyping, conversationId) => this.setTyping(isTyping, conversationId),
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
      getConversations: () => this.conversations ?? [],
      applyConversations: (next) => this.#applyConversations(next),
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
    this.addEventListener(
      "chx-message-read",
      /** @type {EventListener} */ (this.#handleMessageRead),
    );
    this.addEventListener("chx-stop", /** @type {EventListener} */ (this.#handleStop));

    // Uncontrolled seeds — only apply if still undefined, so a reconnect or an app-provided value no-ops.
    if (this.conversations === undefined) this.conversations = this.initialConversations ?? [];
    if (this.activeConversationId === undefined) {
      this.activeConversationId = this.initialActiveConversationId;
    }
    this.#conversationMode.refresh();

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
      onTyping: (isTyping) => this.setTyping(isTyping), // unkeyed hook (no conversationId) → active conversation, see setTyping
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
   * active conversation.
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
    this.removeEventListener(
      "chx-message-read",
      /** @type {EventListener} */ (this.#handleMessageRead),
    );
    this.removeEventListener("chx-stop", /** @type {EventListener} */ (this.#handleStop));
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
    if (this.#conversationMode.isEmptyState) return undefined;
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
      this.#scrollMemory.forgetAll();
      this.#applyMessages([]);
      return;
    }
    this.#pagination.forget(conversationId);
    this.#scrollMemory.forget(conversationId);
    this.#applyMessages(
      this.#internalMessages.filter((m) => m.conversationId !== conversationId),
      conversationId,
    );
  }

  /**
   * Sets whether the *other* side is currently typing/composing in `conversationId` (defaults to the
   * active conversation). The active conversation's value is shown via whatever the app has slotted
   * into `chx-message-list`'s `typing` slot; any conversation's value is announced via
   * `chx-typing-change` (which `<chx-conversations>` uses to drive a per-row indicator). No-op if
   * unchanged. Driven by calling this directly, by `adapter.subscribe`'s `onTyping` (active
   * conversation only), or by an `onEvent` `typing` realtime event (any conversation) — all funnel
   * into the same per-conversation `TypingController`.
   * @param {boolean} isTyping
   * @param {string} [conversationId]
   */
  setTyping(isTyping, conversationId) {
    if (conversationId !== undefined) {
      this.#typing.setTyping(conversationId, isTyping);
      return;
    }
    // Conversation-less signal (this method's own 1-arg form, or adapter.subscribe's onTyping, which
    // carries no conversationId): it only ever means "in whatever is active right now", so drop the
    // attribution the previous one latched — nothing else would ever reset it.
    this.#clearUnkeyedTyping(this.activeConversationId);
    this.#unkeyedTypingId = isTyping ? this.activeConversationId : undefined;
    this.#typing.setTyping(this.activeConversationId, isTyping);
  }

  /**
   * Clears the conversation a conversation-less `setTyping(true)` was attributed to — on the next
   * unkeyed signal and on an `activeConversationId` switch. Keyed (realtime `typing` event) state is
   * untouched, which is the whole point of `TypingController` being per-conversation.
   * @param {string} [except] skip when it's still the same conversation — it's about to be re-set
   */
  #clearUnkeyedTyping(except) {
    const previous = this.#unkeyedTypingId;
    if (previous === undefined || previous === except) return;
    this.#unkeyedTypingId = undefined;
    this.#typing.setTyping(previous, false);
  }

  /**
   * Sets `ChxMessage.readState` to `"read"` for one message — the mechanism behind an inbound
   * `ChxReadEvent` (`adapter.subscribe`'s `onEvent`, `{type: "read", messageId}`), routed through
   * `RealtimeSyncController`. A no-op if the message isn't found. Idempotent, not a toggle — a
   * `ChxReadEvent` is a one-way "this was read" signal with no direction field, and a realtime
   * transport can redeliver it; toggling would flip an already-read message back to `"unread"` on
   * redelivery, and would turn an own/never-opted-in message's `undefined` `readState` into
   * `"unread"` on first delivery. Per-message only — does not touch `ChxConversation.readState`/
   * `unreadCount`, which stay owned by `<chx-conversations>` instead.
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
    if (this.#conversationMode.isEmptyState) return; // nowhere to route a message when no conversation is active
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

    this.#applyMessages(
      reconcileMessages(this.#internalMessages, message, this.userId),
      conversationId,
    );
    this.#deliver(message, conversationId); // not awaited — see #deliver's own doc for what this does
  }

  /**
   * `#internalMessages` holds every cached conversation's messages together, tagged by
   * `conversationId` — this is what's actually rendered/announced: the active conversation's own
   * slice (or everything, when `activeConversationId` is never used — the single-conversation case).
   * Memoized on `(#internalMessages reference, effective id)` and identity-preserving when the whole
   * store belongs to the active conversation, because `pushMessageListProperties` re-pushes this on
   * *every* host update — a fresh array each time would re-render chx-message-list (and re-sync the
   * virtualizer underneath it) on unrelated changes like `loading` or `connectionState`.
   * @returns {ChxMessage[]}
   */
  get #visibleMessages() {
    const id = this.#conversationMode.effectiveConversationId;
    const source = this.#internalMessages;
    const cached = this.#visibleCache;
    if (cached && cached.source === source && cached.id === id) return cached.visible;
    const filtered =
      id == null // empty state — no active conversation
        ? []
        : source.filter((message) => (message.conversationId ?? DEFAULT_CONVERSATION_ID) === id);
    const visible = filtered.length === source.length ? source : filtered;
    this.#visibleCache = { source, id, visible };
    return visible;
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
      new CustomEvent("chx-messages-change", {
        detail: { messages },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The one choke point for conversation-collection mutation — realtime add/update/remove/presence
   * funnel through here (see RealtimeSyncController), the direct mirror of `#applyMessages`. Assigns
   * a new array reference so Lit's identity check fires; `updated()` then dispatches
   * `chx-conversations-change`, which `<chx-conversations>` re-reads off.
   * @param {ChxConversation[]} nextConversations
   */
  #applyConversations(nextConversations) {
    this.conversations = nextConversations;
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
    if (!this.adapter?.sendMessage) {
      this.#markSent(message.id, conversationId); // local echo only — nothing is in flight
      return;
    }
    const controller = new AbortController();
    let failed = false;
    this.#delivery.track(message.id, controller, conversationId);
    try {
      const stream = await this.adapter.sendMessage(message, { signal: controller.signal });
      // sendMessage resolving is the adapter accepting the message; the reply may still be streaming
      this.#markSent(message.id, conversationId);
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId: message.id, conversationId });
    } catch (error) {
      // a cancellation surfaces either as an explicit {kind:"abort"} chunk (handled entirely
      // inside deliverStream, never reaches this catch) or the adapter's own fetch/EventSource
      // throwing once the signal fires — this branch only ever sees the second case
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
      const next = reconcileMessages(this.#internalMessages, updated, this.userId);
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
      // an `{kind:"abort"}` chunk settles the stream cleanly, never throwing — so the outcome reads
      // the signal here rather than trusting the catch to have run
      this.#delivery.untrack(
        message.id,
        controller.signal.aborted ? "cancelled" : failed ? "failed" : "completed",
        conversationId,
      );
    }
  }

  /** @param {string} messageId @param {string} [conversationId] */
  #markSent(messageId, conversationId) {
    const current = this.#internalMessages.find((m) => m.id === messageId);
    if (current?.status !== "sending") return;
    this.#applyMessages(
      this.#internalMessages.map((m) => (m === current ? { ...m, status: "sent" } : m)),
      conversationId,
    );
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
    const resetMessage = {
      ...message,
      status: /** @type {"sending"} */ ("sending"),
      error: undefined,
    };
    const withoutStaleReply = this.#internalMessages.filter((m) => m.replyToId !== messageId);
    this.#applyMessages(
      reconcileMessages(withoutStaleReply, resetMessage, this.userId),
      conversationId,
    );
    this.#deliver(resetMessage, conversationId);
  }

  /**
   * The active conversation's turn state — `submitted` between a send and its first chunk,
   * `streaming` while a reply shell fills in, `error` after a failed delivery until the next send.
   * **Read-only**, derived by `DeliveryController`; nothing assigns it.
   * @returns {import("../../types/adapter.js").ChxChatStatus}
   */
  get status() {
    return this.#delivery.status;
  }

  /** True while the active conversation has a turn in flight — `status` narrowed to the one bit the composer needs. @returns {boolean} */
  get busy() {
    return this.#delivery.busy;
  }

  /** Aborts every in-flight delivery for the active conversation — what the composer's stop button
   *  reaches through `chx-stop`. A backgrounded conversation's is left alone; use `cancel()`. */
  stop() {
    this.#delivery.stopActive();
  }

  /** Composer/textbox stop button — see `stop()`. Intercept by listening lower and calling `stopPropagation()`. */
  #handleStop = () => {
    this.stop();
  };

  /**
   * Aborts an in-flight `sendMessage`/`regenerate` delivery — `messageId` is whichever id that
   * delivery is tracked under (the send's own id, or a reply's id for a `regenerate` in flight).
   * A no-op if nothing is currently in flight for that id.
   * @param {string} messageId
   */
  cancel(messageId) {
    this.#delivery.cancel(messageId);
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
    let failed = false;
    this.#delivery.track(replyId, controller, conversationId);
    try {
      const stream = await this.adapter?.regenerate?.(replyId, {
        signal: controller.signal,
        conversationId,
      });
      if (!stream) return;
      await this.#stream.deliverStream(stream, { replyToId, conversationId });
    } catch (error) {
      // regenerate() already removed the old reply — if a fresh one started streaming before the
      // failure, close it out too; if nothing arrived yet, there's nothing to find or close
      const cancelled = controller.signal.aborted;
      failed = !cancelled;
      const orphanedReply = this.#internalMessages.find(
        (m) => m.replyToId === replyToId && m.status === "sending",
      );
      if (orphanedReply) {
        const replyStatus = /** @type {"failed" | "cancelled"} */ (
          cancelled ? "cancelled" : "failed"
        );
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
      this.#delivery.untrack(
        replyId,
        controller.signal.aborted ? "cancelled" : failed ? "failed" : "completed",
        conversationId,
      );
    }
  }

  /** @param {CustomEvent<{attachments: File[]}>} event */
  handleAttachmentsChange = (event) => {
    this.#attachmentsProvider.setValue(event.detail.attachments);
  };

  /**
   * Fire-and-forget — no `chx-messages-change`/status update depends on this call's outcome, and a
   * rejected promise is left uncaught, same as every other fire-and-forget adapter call in this file.
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
    // `loading` stays an app-settable override for a transport chx-chat doesn't drive (a messenger's
    // local echo); a delivery in flight raises it on its own. See `status`.
    composer.loading = this.loading || this.busy;
    composer.dragging = this.dragging;
    composer.compact = this.compact;
    composer.messagesEmpty = this.#internalMessages.length === 0;
    composer.disabled = this.#conversationMode.isEmptyState; // no active conversation → can't compose/send
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
    list.partElements = this.partElements;
    list.typing = this.#typing.isTyping(this.activeConversationId);
    list.streaming = this.#delivery.isWaitingForReply();
    list.loading = this.#pagination.loading;
    list.emptyState = this.#conversationMode.isEmptyState;
    // No conversation to page through in the empty state — report exhausted and swallow any load-more.
    list.hasMore = this.#conversationMode.isEmptyState ? false : this.#pagination.hasMore;
    list.readTracking = this.readTracking;
    list.noVirtualization = this.noVirtualization;
    list.compact = this.compact;
    // chx-message-list forwards this to chx-infinity-scroll, whose LoadMoreController awaits it near
    // the top of the scroll — the sole load-more path now.
    list.onLoadMore = () =>
      this.#conversationMode.isEmptyState ? Promise.resolve() : this.#pagination.loadMore();
  }

  /**
   * An app-assigned `messages` is authoritative, but only when it's not just an echo of what
   * `#applyMessages` itself last produced — scoped to the active conversation's own slice, other
   * cached conversations' entries in `#internalMessages` are left untouched.
   * @param {import("lit").PropertyValues} changedProperties
   */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);

    // Latch multi-conversation mode off any late-arriving signal (app-set conversations/active id, or
    // a <chx-conversations> setting conversationsPresent after connect).
    this.#conversationMode.refresh();

    if (changedProperties.has("activeConversationId")) {
      const previousId = /** @type {string | undefined} */ (
        changedProperties.get("activeConversationId")
      );
      this.#scrollMemory.handleConversationChange(previousId);
      // Keyed typing state survives a switch untouched (TypingController is per-conversation, so
      // switching just reads the now-active conversation's own value) — only an unkeyed signal's
      // attribution to the conversation being left is dropped, since it was never about that
      // conversation in the first place. See setTyping.
      this.#clearUnkeyedTyping();
      if (
        this.activeConversationId !== undefined &&
        !this.#conversationMode.isEmptyState &&
        !this.#pagination.hasVisited(this.activeConversationId)
      ) {
        this.#pagination.loadInitial();
      }
    }

    if (changedProperties.has("messages") && this.messages !== this.#lastAnnounced) {
      validateMessages(this.messages);
      const conversationId = this.activeConversationId;
      const stamped =
        conversationId === undefined
          ? this.messages
          : this.messages.map((m) =>
              m.conversationId === conversationId ? m : { ...m, conversationId },
            );
      this.#internalMessages =
        conversationId === undefined
          ? stamped
          : [
              ...this.#internalMessages.filter((m) => m.conversationId !== conversationId),
              ...stamped,
            ];
      this.#lastAnnounced = this.messages;
    }
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
    if (changedProperties.has("conversations")) {
      this.dispatchEvent(
        new CustomEvent("chx-conversations-change", {
          detail: { conversations: this.conversations ?? [] },
          bubbles: true,
          composed: true,
        }),
      );
    }
    this.pushComposerProperties();
    this.pushMessageListProperties();
    // not awaited — see restoreIfPending's own doc
    this.#scrollMemory.restoreIfPending(this.activeConversationId);
  }

  render() {
    return html`
      <slot name="message-list" @slotchange=${this.handleMessageListSlotchange}></slot>
      <!-- purely a placement slot: chx-chat neither gates nor fills it, the app owns what's in it
           and when (see src/docs/agentic.md's permission flow) -->
      <slot name="input-banner"></slot>
      <slot name="message-composer" @slotchange=${this.handleMessageComposerSlotchange}></slot>
    `;
  }
}
