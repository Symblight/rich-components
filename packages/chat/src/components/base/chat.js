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
import { PresenceController } from "../../controllers/chat/PresenceController.js";
import { RealtimeSyncController } from "../../controllers/chat/RealtimeSyncController.js";
import { DEFAULT_CONVERSATION_ID } from "../../constants.js";
import { ApiRegistry } from "../../api/ApiRegistry.js";
import { CHAT_API_DEFAULTS } from "../../api/chat-api-defaults.js";
import { CONNECT_REGISTRY } from "../../api/keys.js";
import { chatApiContext } from "../../context/chat-api-context.js";

import tokens from "../../styles/tokens.css?inline";
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
  /** @type {PaginationController} */
  #pagination; // assigned in the constructor
  /** @type {PresenceController} */
  #presence; // assigned in the constructor
  /** @type {RealtimeSyncController} */
  #realtimeSync; // assigned in the constructor
  /** @type {DropTargetController} */
  #dropTarget;
  /** @type {ContextProvider<typeof attachmentsContext>} */
  #attachmentsProvider;
  /** @type {import("../../context/chat-api-context.js").ChatApiRegistry} */
  #api = new ApiRegistry(CHAT_API_DEFAULTS, { name: "chx-chat" });

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

    /** Runs a factory only when its `part` or `message` object changes; assign a new object to re-run all. @type {Record<string, ChxPartRenderer> | undefined} */
    this.partElements = undefined;

    /** @type {ChxChatAdapter | undefined} */
    this.adapter = undefined;

    /** @type {number} */
    this.chunkBatchIntervalMs = 16;

    /** @type {"connecting" | "connected" | "error" | undefined} */
    this.connectionState = undefined;

    /**
     * Opt-in master switch for read tracking — `false` by default. Pushed straight through to
     * `chx-message-list.readTracking` (see `#pushMessageListProperties`); `chx-message-list` itself is
     * what actually gates the `IntersectionObserver` observation and, through that, whether
     * `chx-message-read`/`adapter.markRead` ever fire.
     * @type {boolean}
     */
    this.readTracking = false;

    /**
     * Opt-in real-DOM mode for `chx-message-list`'s `chx-infinity-scroll` — every message renders in
     * full, in normal document flow, no windowing/measurement. Pushed straight through to
     * `chx-message-list.noVirtualization` (see `#pushMessageListProperties`).
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
      onMessagesChange: (messages, conversationIds) => {
        const active = this.activeConversationId;
        // an unattributed message lands in the active conversation
        const touchesActive = conversationIds.some((id) => id === undefined || id === active);
        this.#applyMessages(messages, touchesActive ? active : conversationIds[0]);
      },
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
      getViewport: () => this.#api.current("viewport"), // no warning when no list is slotted
      getEnabled: () => this.restoreScrollPosition,
    });

    this.#delivery = new DeliveryController(this, {
      getActiveConversationId: () => this.activeConversationId,
      getMessages: () => this.#internalMessages,
      getAdapter: () => this.adapter,
      getUserId: () => this.userId,
      applyMessages: (messages, conversationId) => this.#applyMessages(messages, conversationId),
      stream: this.#stream,
    });

    this.#pagination = new PaginationController(this, {
      getAdapter: () => this.adapter,
      getMessages: () => this.#internalMessages,
      applyMessages: (messages, conversationId) => this.#applyMessages(messages, conversationId),
      getConversationId: () => this.activeConversationId,
    });

    this.#presence = new PresenceController(this, () => this.activeConversationId);

    this.#realtimeSync = new RealtimeSyncController({
      getActiveConversationId: () => this.activeConversationId,
      setTyping: (isTyping, conversationId) => this.#presence.setTyping(isTyping, conversationId),
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
      canDrop: () => !!this.#attachmentsElement,
      onDrop: (files) => this.#attachmentsElement?.addFiles(files, "drop"),
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

    new ContextProvider(this, { context: chatApiContext, initialValue: this.#api });
    this.#registerOwnNamespaces();
  }

  #registerOwnNamespaces() {
    const delivery = this.#delivery;
    this.#api.register(
      "delivery",
      this,
      {
        retry: (messageId) => delivery.retry(messageId),
        regenerate: (messageId) => delivery.regenerate(messageId),
        stop: (conversationId) => delivery.stop(conversationId ?? this.activeConversationId),
        cancel: (messageId) => delivery.cancel(messageId),
        getStatus: (conversationId) =>
          delivery.statusFor(conversationId ?? this.activeConversationId),
        isBusy: (conversationId) => delivery.busyFor(conversationId ?? this.activeConversationId),
      },
      () => [delivery.status],
    );

    const pagination = this.#pagination;
    this.#api.register(
      "store",
      this,
      {
        getMessages: (conversationId) =>
          conversationId === undefined
            ? this.#visibleMessages
            : this.#internalMessages.filter(
                (m) => (m.conversationId ?? DEFAULT_CONVERSATION_ID) === conversationId,
              ),
        add: (message) => this.#addMessage(message),
        loadMore: () => this.#loadMore(),
        refresh: (conversationId) => this.#refresh(conversationId ?? this.activeConversationId),
        clear: (conversationId) => this.#clearCache(conversationId),
        hasMore: (conversationId) =>
          pagination.hasMoreFor(conversationId ?? this.activeConversationId),
        isLoading: (conversationId) =>
          pagination.isLoadingFor(conversationId ?? this.activeConversationId),
      },
      () => [this.#visibleMessages, pagination.hasMore, pagination.loading],
    );

    this.#api.register(
      "presence",
      this,
      {
        setTyping: (isTyping, conversationId) => this.#presence.setTyping(isTyping, conversationId),
        isTyping: (conversationId) => this.#presence.isTyping(conversationId),
      },
      () => [this.#presence.isTyping()],
    );
  }

  /** Send, retry, regenerate, stop and cancel turns; read the turn status. */
  get delivery() {
    return this.#api.facades.delivery;
  }

  /** Read, add, page, refresh and clear cached messages. */
  get store() {
    return this.#api.facades.store;
  }

  /** The other side's typing state, per conversation. */
  get presence() {
    return this.#api.facades.presence;
  }

  /** Scrolling — needs a slotted `chx-message-list`. */
  get viewport() {
    return this.#api.facades.viewport;
  }

  /** The composer's text — needs a slotted `chx-message-composer`. */
  get input() {
    return this.#api.facades.input;
  }

  /** Attached files — needs a `chx-attachments` inside the composer. */
  get attachments() {
    return this.#api.facades.attachments;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("chx-send-message", /** @type {EventListener} */ (this.#handleSend));
    this.addEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.#handleAttachmentsChange),
    );
    this.addEventListener(
      "chx-active-conversation-change",
      /** @type {EventListener} */ (this.#handleActiveConversationChange),
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
    this.#loadInitial();
  }

  /** Not awaited by its callers, so a failed first page is reported here. @param {string} [conversationId] */
  #loadInitial(conversationId = this.activeConversationId) {
    this.#pagination.loadInitial(conversationId).catch((error) => {
      console.error("[chx-chat] loading messages failed", error);
      this.dispatchEvent(
        new CustomEvent("chx-load-more-error", { detail: error, bubbles: true, composed: true }),
      );
    });
  }

  /**
   * One long-lived, conversation-spanning subscription — never re-invoked on an `activeConversationId`
   * switch (see `ChxChatAdapter.subscribe`'s own doc), only when `adapter` itself is reassigned to a
   * different instance (see `updated()`'s re-subscribe guard).
   * @returns {(() => void) | undefined}
   */
  #subscribeAdapter() {
    return this.adapter?.subscribe?.({
      onMessage: (message) => this.#addMessage(message),
      onChunk: (item) => this.#stream.applyChunk(item),
      onTyping: (isTyping) => this.#presence.setTyping(isTyping), // unkeyed hook (no conversationId) → active conversation, see PresenceController
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
  #handleActiveConversationChange(event) {
    this.activeConversationId = event.detail.conversationId;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("chx-send-message", /** @type {EventListener} */ (this.#handleSend));
    this.removeEventListener(
      "chx-attachments-change",
      /** @type {EventListener} */ (this.#handleAttachmentsChange),
    );
    this.removeEventListener(
      "chx-message-read",
      /** @type {EventListener} */ (this.#handleMessageRead),
    );
    this.removeEventListener("chx-stop", /** @type {EventListener} */ (this.#handleStop));
    this.#unsubscribe?.();
  }

  #loadMore() {
    if (this.#conversationMode.isEmptyState) return undefined;
    return this.#pagination.loadMore();
  }

  /** @param {Omit<ChxMessage, "own" | "createdAt"> & {own?: boolean, createdAt?: number}} message */
  #addMessage(message) {
    const resolved = /** @type {ChxMessage} */ ({
      createdAt: Date.now(),
      conversationId: this.activeConversationId,
      ...message,
    });
    validateMessages([resolved]);
    this.#applyMessages(
      reconcileMessages(this.#internalMessages, resolved, this.userId),
      resolved.conversationId,
    );
  }

  /** @param {string | undefined} conversationId */
  #refresh(conversationId) {
    this.#clearCache(conversationId);
    this.#loadInitial(conversationId);
  }

  /**
   * `store.clear()` — drops cached messages, pagination state and scroll memory without refetching.
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
   * Consumer-authored light DOM in the `message-composer` slot, so a light-DOM query.
   * @returns {import("../message-composer/message-composer.js").ChxMessageComposer}
   */
  get #composer() {
    return /** @type {import("../message-composer/message-composer.js").ChxMessageComposer} */ (
      this.querySelector("chx-message-composer")
    );
  }

  /** The composer's `<chx-attachments>` — the drop target. */
  get #attachmentsElement() {
    return /** @type {import("../attachments/attachments.js").ChxAttachments | null} */ (
      this.querySelector("chx-message-composer chx-attachments")
    );
  }

  /**
   * Consumer-authored, optional light DOM in the `message-list` slot.
   * @returns {import("../message-list/message-list.js").ChxMessageList}
   */
  get #list() {
    return /** @type {import("../message-list/message-list.js").ChxMessageList} */ (
      this.querySelector("chx-message-list")
    );
  }

  /** @param {CustomEvent<{value: string, html: string, attachments: File[]}>} event */
  #handleSend(event) {
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
    this.#delivery.deliver(message, conversationId); // not awaited — settles on its own
  }

  /**
   * `#internalMessages` holds every cached conversation's messages together, tagged by
   * `conversationId` — this is what's actually rendered/announced: the active conversation's own
   * slice (or everything, when `activeConversationId` is never used — the single-conversation case).
   * Memoized on `(#internalMessages reference, effective id)` and identity-preserving when the whole
   * store belongs to the active conversation, because `#pushMessageListProperties` re-pushes this on
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
   * The one choke point every local mutation of the internal store goes through; runs on every
   * stream flush, so outside data is validated where it enters, not here. `nextMessages` is
   * always the *full*, multi-conversation array — `conversationId` says which conversation this
   * particular write is *for* (a background delivery/pagination fetch can write here for a
   * conversation that isn't currently active, see `DeliveryController.deliver`/`PaginationController`); only a write
   * matching the active conversation actually renders or fires `chx-messages-change`, so a
   * backgrounded conversation's cache stays silently up to date until the app switches to it.
   * @param {ChxMessage[]} nextMessages
   * @param {string} [conversationId]
   */
  #applyMessages(nextMessages, conversationId = this.activeConversationId) {
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

  /** One function for the chat's life: a new one each update would re-render the whole list. */
  #handleLoadMore = () =>
    this.#conversationMode.isEmptyState ? Promise.resolve() : this.#pagination.loadMore();

  /** Composer/textbox stop button → `delivery.stop()`. Intercept by listening lower and calling `stopPropagation()`. */
  #handleStop = () => {
    this.#delivery.stop();
  };

  /** @param {CustomEvent<{attachments: File[]}>} event */
  #handleAttachmentsChange = (event) => {
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
  #handleMessageListSlotchange() {
    this.#pushMessageListProperties();
  }

  /** Same as `#handleMessageListSlotchange`, for the composer slot. */
  #handleMessageComposerSlotchange() {
    this.#pushComposerProperties();
  }

  #pushComposerProperties() {
    const composer = this.#composer;
    if (!composer) return;
    composer[CONNECT_REGISTRY](this.#api);
    // `loading` stays an app-settable override for a transport chx-chat doesn't drive (a messenger's
    // local echo); a delivery in flight raises it on its own. See `delivery.getStatus()`.
    composer.loading = this.loading || this.#delivery.busy;
    composer.dragging = this.#dropTarget.dragging;
    composer.compact = this.compact;
    composer.messagesEmpty = this.#visibleMessages.length === 0;
    composer.emptyState = this.#conversationMode.isEmptyState; // no active conversation → can't compose/send
  }

  /**
   * The message list only needs the drag-overlay state (see
   * message-list.js's own `dragging`/`dropHint`) — it has no
   * loading concept of its own.
   */
  #pushMessageListProperties() {
    const list = this.#list;
    if (!list) return;
    list[CONNECT_REGISTRY](this.#api);
    list.dragging = this.#dropTarget.dragging;
    list.messages = this.#visibleMessages;
    list.partElements = this.partElements;
    list.typing = this.#presence.isTyping();
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
    list.onLoadMore = this.#handleLoadMore;
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
      // Keyed typing state survives a switch untouched (PresenceController is per-conversation, so
      // switching just reads the now-active conversation's own value) — only an unkeyed signal's
      // attribution to the conversation being left is dropped, since it was never about that
      // conversation in the first place. See PresenceController.
      this.#presence.handleConversationChange();
      if (
        this.activeConversationId !== undefined &&
        !this.#conversationMode.isEmptyState &&
        !this.#pagination.hasVisited(this.activeConversationId)
      ) {
        this.#loadInitial();
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
    this.#pushComposerProperties();
    this.#pushMessageListProperties();
    // not awaited — see restoreIfPending's own doc
    this.#scrollMemory.restoreIfPending(this.activeConversationId);
  }

  render() {
    return html`
      <slot name="message-list" @slotchange=${this.#handleMessageListSlotchange}></slot>
      <!-- purely a placement slot: chx-chat neither gates nor fills it, the app owns what's in it
           and when (see src/docs/agentic.md's permission flow) -->
      <slot name="input-banner"></slot>
      <slot name="message-composer" @slotchange=${this.#handleMessageComposerSlotchange}></slot>
    `;
  }
}
