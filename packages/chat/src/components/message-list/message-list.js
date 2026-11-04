import { html, LitElement, nothing, render } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { choose } from "lit/directives/choose.js";
import { ref } from "lit/directives/ref.js";
import { classMap } from "lit/directives/class-map.js";
import { guard } from "lit/directives/guard.js";

import "@symblight/wc-material/progress-circular";
import "../message/message.js";
import "../message-row/message-row.js";
import "../infinity-scroll/infinity-scroll.js";
import "../loading-history/loading-history.js";
import "../divider/divider.js";
import { FocusBehaviorController } from "../../controllers/message-list/FocusBehaviorController.js";
import { ReadTrackingController } from "../../controllers/message-list/ReadTrackingController.js";
import { DividerController } from "../../controllers/message-list/DividerController.js";
import { groupAt } from "./group.js";
import { authorFor } from "./authors.js";
import { estimateMessageSize } from "./estimate.js";
import { interiorTabbing } from "./interior-tabbing.js";
import {
  INFINITY_SCROLL_EXPORTPARTS,
  isSending,
  MESSAGE_EXPORTPARTS,
  messagePartNames,
} from "./parts.js";
import { PartRenderer } from "./PartRenderer.js";
import { StatusController } from "../../controllers/message-list/StatusController.js";
import { StickyController } from "../../controllers/message-list/StickyController.js";
import { CONNECT_REGISTRY } from "../../api/keys.js";
import { indexById } from "../../utils/messages.js";
import { pollFrames } from "../../utils/dom.js";
import tokens from "../../styles/tokens.css?inline";
import styles from "./message-list.css?inline";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxPartRenderer } from "../../types/adapter.js" */
/** @import { ChxInfinityScroll } from "../infinity-scroll/infinity-scroll.js" */

// attributes chx-message reflects on itself — a pattern mutating only these is not a consumer change
const MESSAGE_OWN_ATTRIBUTES = new Set([
  "role",
  "aria-busy",
  "aria-current",
  "own",
  "unread",
  "compact",
  "loading",
  "selected",
  "data-actionable",
]);

/**
 * @tag chx-message-list
 * @summary Message list.
 */
@customElement("chx-message-list")
export class ChxMessageList extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    dragging: { type: Boolean, reflect: true, attribute: true },
    dropHint: { type: String, attribute: "drop-hint" },
    messages: { attribute: false },
    partElements: { attribute: false },
    messagesLabel: { type: String, attribute: "messages-label" },
    scrollBehavior: { type: String, attribute: "scroll-behavior" },
    contentAlign: { type: String, attribute: "content-align" },
    scrollMode: { type: String, attribute: "scroll-mode" },
    noVirtualization: { type: Boolean, attribute: "no-virtualization" },
    buffer: { type: Number },
    estimateItemSize: { attribute: false },
    overscan: { type: Number },
    paddingStart: { type: Number, attribute: "padding-start" },
    paddingEnd: { type: Number, attribute: "padding-end" },
    scrollMargin: { type: Number, attribute: "scroll-margin" },
    useScrollendEvent: { type: Boolean, attribute: "use-scrollend-event" },
    readThreshold: { type: Number, attribute: "read-threshold" },
    readTracking: { type: Boolean, attribute: "read-tracking" },
    typing: { type: Boolean, reflect: true, attribute: true },
    streaming: { type: Boolean, reflect: true, attribute: true },
    emptyState: { type: Boolean, reflect: true, attribute: "empty-state" },
    compact: { type: Boolean, reflect: true, attribute: true },
    authorDisplay: { type: String, reflect: true, attribute: "author-display" },
    selectedId: { type: String, attribute: "selected-id" },
    loading: { type: Boolean },
    hasMore: { type: Boolean },
    onLoadMore: { attribute: false },
  };

  /** @type {Set<string> | undefined} */
  #pendingRenderedMessageIds;
  /** The next `messages` are another conversation's, so an append seen there is no send. */
  #switching = false;
  /** A saved offset whose chx-infinity-scroll doesn't exist yet. @type {number | undefined} */
  #pendingOffset;
  /** Part of every row's guard — bumped when all rows must rebuild (a new pattern or divider carrier). */
  #rowsVersion = 0;
  /** An own message appended before chx-infinity-scroll existed, pinned once it does. @type {string | undefined} */
  #pendingPinId;
  /** @type {PartRenderer} */
  #partRenderer; // per-part element rendering + cache — assigned in the constructor, below
  /** @type {DividerController} */
  #dividerController; // date dividers — assigned in the constructor, below
  /** @type {StickyController} */
  #stickyController; // floating stuck-section date label — assigned in the constructor, below
  /** @type {StatusController} */
  #status; // phase + role="status" text — assigned in the constructor, below
  /** @type {ChxInfinityScroll | undefined} */
  #infinityScrollElement; // set via a ref() directive in render()
  /** @type {FocusBehaviorController} */
  #focusBehavior; // roving tabindex — assigned in the constructor, below
  /** @type {ReadTrackingController} */
  #readTracking; // fire-once chx-message-read dedup + readState gate — assigned in the constructor, below
  /** Further than `buffer` px from the bottom — reported by chx-infinity-scroll. */
  #awayFromBottom = false;
  /** The app's `<chx-message slot="message">`, cloned into every row. @type {HTMLElement | undefined} */
  #messagePattern;
  /** message id → that row's clone of the pattern. @type {Map<string, HTMLElement>} */
  #messageClones = new Map();
  #patternObserver = new MutationObserver((records) => {
    const consumerChange = records.some(
      (record) =>
        !(
          record.type === "attributes" &&
          record.target === this.#messagePattern &&
          MESSAGE_OWN_ATTRIBUTES.has(/** @type {string} */ (record.attributeName))
        ),
    );
    if (!consumerChange) return;
    this.#messageClones.clear();
    this.#invalidateRows();
  });
  /** Re-renders this host *and* chx-infinity-scroll. The second call is not redundant: none of the
   *  properties passed down change by reference on a plain host re-render, so Lit's `PropertyPart`
   *  skips re-setting them and the rows never re-run `#renderItem`. Anything that changes what a row
   *  should look like without changing `messages` has to go through here, and be in `#renderItem`'s
   *  guard (or go through `#invalidateRows`), or the row skips it. */
  #requestRerender = () => {
    this.requestUpdate();
    this.#infinityScrollElement?.requestUpdate();
  };
  #invalidateRows = () => {
    this.#rowsVersion++;
    this.#requestRerender();
  };
  #itemKey = (/** @type {ChxMessage} */ message, /** @type {number} */ index) =>
    message?.id ?? index;
  /** @param {number} index */
  #groupAt = (index) =>
    groupAt(this.messages, index, (message, i) => this.#dividerController.shouldShow(message, i));
  /** @type {import("../../context/chat-api-context.js").ChatApiRegistry | undefined} */
  #registry; // pushed by chx-chat, see [CONNECT_REGISTRY]
  /** @type {(() => void) | undefined} */
  #unregisterViewport;

  constructor() {
    super();

    /** @type {boolean} */
    this.dragging = false;

    /** @type {string} */
    this.dropHint = "Release to attach";

    /** @type {ChxMessage[]} */
    this.messages = [];

    /** Runs a factory only when its `part` or `message` object changes; assign a new object to re-run all. @type {Record<string, ChxPartRenderer> | undefined} */
    this.partElements = undefined;

    /** @type {string} */
    this.messagesLabel = "Messages";

    /** Governs `scrollToBottom()` only. @type {"auto" | "smooth"} */
    this.scrollBehavior = "auto";

    /** Forwarded straight through to chx-infinity-scroll. @type {"start" | "end"} */
    this.contentAlign = "end";

    /** Forwarded to chx-infinity-scroll. `"pin-top"` pins each sent message to the top of the
     *  viewport and doesn't follow the reply (agent chats). @type {"pin-top" | "stick-bottom"} */
    this.scrollMode = "stick-bottom";

    /** Forwarded straight through to chx-infinity-scroll — real-DOM mode, no windowing/measurement.
     *  @type {boolean} */
    this.noVirtualization = false;

    /** Forwarded straight through to chx-infinity-scroll — "at the bottom" threshold, in px. @type {number} */
    this.buffer = 150;

    /** Forwarded straight through to chx-infinity-scroll — content-aware pre-measurement estimate. @type {(item: ChxMessage, index: number) => number} */
    this.estimateItemSize = (message, index) => this.#estimateMessageSize(message, index);

    /** Forwarded straight through to chx-infinity-scroll. @type {number} */
    this.overscan = 6;

    /** Forwarded straight through to chx-infinity-scroll. @type {number} */
    this.paddingStart = 0;

    /** Forwarded straight through to chx-infinity-scroll. @type {number} */
    this.paddingEnd = 0;

    /** Forwarded straight through to chx-infinity-scroll. @type {number} */
    this.scrollMargin = 0;

    /** Forwarded straight through to chx-infinity-scroll — read once at mount, not reactive. @type {boolean} */
    this.useScrollendEvent = false;

    /** Forwarded straight through to chx-infinity-scroll's visibilityThreshold — gates `chx-message-read`. @type {number} */
    this.readThreshold = 0;

    /**
     * Opt-in master switch for the whole read-tracking mechanism — `false` by default. When `false`,
     * no message is ever `observe()`d by `chx-infinity-scroll`'s `IntersectionObserver`
     * (`#shouldObserveItem` always returns `false`), so `chx-message-read` never fires and
     * `adapter.markRead` is never called. Does **not** affect `chx-message.unread`/the `unread-marker`
     * slot — that half is purely `readState`-driven and stays usable independently.
     * @type {boolean}
     */
    this.readTracking = false;

    /** Gates the `typing` slot in render() — no default content. @type {boolean} */
    this.typing = false;

    /** Waiting for a reply with no message yet — gates the `streaming` slot, same no-default posture as `typing` above. @type {boolean} */
    this.streaming = false;

    /** No active conversation (removed / none selected) — gates the `empty` slot, which has a default. @type {boolean} */
    this.emptyState = false;

    /** Pushed onto every row's `compact`. @type {boolean} */
    this.compact = false;

    /** Which rows get their author resolved (default avatar + name + time): none, incoming only, or all.
     *  @type {"none" | "incoming" | "all"} */
    this.authorDisplay = "none";

    /** Id of the highlighted row (jump-to / permalink), persistent until cleared. @type {string | undefined} */
    this.selectedId = undefined;

    /** Forwarded straight to `chx-infinity-scroll` — pushed down from chx-chat's `PaginationController`. @type {boolean} */
    this.loading = false;

    /** Forwarded straight to `chx-infinity-scroll` — pushed down from chx-chat's `PaginationController`. @type {boolean} */
    this.hasMore = true;

    /** Forwarded straight to chx-infinity-scroll's own onLoadMore. @type {() => Promise<void>} */
    this.onLoadMore = () => Promise.resolve();

    this.#focusBehavior = new FocusBehaviorController(this, {
      getMessages: () => this.messages,
      getRenderRoot: () => this.#infinityScrollElement?.renderRoot,
      scrollToIndex: (index) => this.#infinityScrollElement?.scrollToIndex(index),
      requestRerender: this.#requestRerender,
    });

    this.#readTracking = new ReadTrackingController({
      getMessages: () => this.messages,
      getEnabled: () => this.readTracking,
      emit: (type, detail) =>
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })),
    });

    this.#dividerController = new DividerController({ getMessages: () => this.messages });

    this.#partRenderer = new PartRenderer({ getPartElements: () => this.partElements });

    this.#status = new StatusController(this, {
      getMessages: () => this.messages,
      getEmptyState: () => this.emptyState,
      getLoading: () => this.loading,
    });

    this.#stickyController = new StickyController(this, {
      dividerController: this.#dividerController,
      getMessages: () => this.messages,
      getInfinityScrollElement: () => this.#infinityScrollElement,
      getAwayFromBottom: () => this.#awayFromBottom,
    });

    // on the host, not a template binding: the affordance is slotted light DOM
    this.addEventListener("chx-scroll-to-bottom-click", (event) => {
      const { detail } = /** @type {CustomEvent<{behavior?: ScrollBehavior}>} */ (event);
      this.#scrollToBottom(detail.behavior);
    });
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.#observePattern();
    // reconnect-must-reset, same posture VisibilityController/RowMeasurer already have
    this.#readTracking.reset();
    this.#registerViewport();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#patternObserver.disconnect();
    this.#unregisterViewport?.();
    this.#unregisterViewport = undefined;
  }

  /** Internal: chx-chat hands over its API registry. @param {import("../../context/chat-api-context.js").ChatApiRegistry} registry */
  [CONNECT_REGISTRY](registry) {
    if (registry === this.#registry) return;
    this.#unregisterViewport?.();
    this.#unregisterViewport = undefined;
    this.#registry = registry;
    this.#registerViewport();
  }

  #registerViewport() {
    if (!this.#registry || this.#unregisterViewport || !this.isConnected) return;
    this.#unregisterViewport = this.#registry.register(
      "viewport",
      this,
      {
        toBottom: (behavior) => this.#scrollToBottom(behavior),
        toMessage: (messageId, options) => this.#scrollToMessage(messageId, options),
        isAwayFromBottom: () => this.#awayFromBottom,
        getScrollOffset: () => this.#infinityScrollElement?.getScrollOffset(),
        scrollToOffset: async (offset) => {
          await this.updateComplete;
          this.#infinityScrollElement?.scrollToOffset(offset);
        },
        positionToSave: () =>
          this.#infinityScrollElement ? this.#infinityScrollElement.positionToSave() : null,
        showPosition: (offset) => this.#showPosition(offset),
      },
      () => [this.#awayFromBottom],
    );
  }

  /** @param {number | undefined} offset */
  async #showPosition(offset) {
    if (!this.noVirtualization) {
      if (offset === undefined) return;
      await this.updateComplete;
      this.#infinityScrollElement?.scrollToOffset(offset);
      return;
    }
    this.#switching = true;
    this.requestUpdate();
    this.#pendingOffset = this.#infinityScrollElement ? undefined : offset;
    this.#infinityScrollElement?.showPosition(offset);
  }

  /** @param {ScrollBehavior} [behavior] */
  #scrollToBottom(behavior) {
    this.#infinityScrollElement?.scrollToBottom(behavior);
  }

  /** @param {boolean} away */
  #handleAwayFromBottomChange = (away) => {
    this.#awayFromBottom = away;
    this.#stickyController.handleAwayFromBottomChange(away);
    this.requestUpdate();
  };

  /**
   * Scrolls a loaded message into view; `false` when it isn't in `messages`. Resolves once the row
   * has mounted and been re-aligned at its measured size (or after a capped number of frames).
   * @param {string} messageId
   * @param {{align?: "start" | "center" | "end", behavior?: ScrollBehavior}} [options]
   * @returns {Promise<boolean>}
   */
  async #scrollToMessage(messageId, { align = "start", behavior } = {}) {
    const index = indexById(this.messages).get(messageId);
    if (index === undefined) return false;
    await this.updateComplete;
    const list = this.#infinityScrollElement;
    if (!list) return false;
    list.scrollToIndex(index, { align, behavior });
    const selector = `[data-message-id="${CSS.escape(messageId)}"]`;
    if (!(await pollFrames(() => list.renderRoot.querySelector(selector)))) return false;
    list.scrollToIndex(index, { align, behavior }); // re-align at the measured size
    return true;
  }

  /** Discovers the app's `<chx-message slot="message">` pattern; renders nothing itself.
   * @param {Event} event */
  #handleMessagePatternSlotchange = (event) => {
    const assigned = /** @type {HTMLSlotElement} */ (event.target).assignedElements();
    const pattern = assigned[0];
    if (assigned.length > 1 || (pattern && pattern.localName !== "chx-message")) {
      console.error('chx-message-list: slot="message" takes exactly one <chx-message>');
    }
    this.#messagePattern =
      assigned.length === 1 && pattern.localName === "chx-message"
        ? /** @type {HTMLElement} */ (pattern)
        : undefined;
    if (this.#messagePattern?.querySelector("[id]")) {
      console.warn('chx-message-list: ids inside slot="message" are duplicated in every row');
    }
    this.#observePattern();
    this.#messageClones.clear();
    this.#invalidateRows();
  };

  #observePattern() {
    this.#patternObserver.disconnect();
    if (!this.#messagePattern) return;
    this.#patternObserver.observe(this.#messagePattern, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  /** @param {string} id @returns {HTMLElement} */
  #messageClone(id) {
    let clone = this.#messageClones.get(id);
    if (!clone) {
      clone = /** @type {HTMLElement} */ (
        /** @type {HTMLElement} */ (this.#messagePattern).cloneNode(true)
      );
      clone.removeAttribute("slot");
      this.#messageClones.set(id, clone);
    }
    return clone;
  }

  /** Discovers the slotted `<chx-divider slot="divider">` config carrier; renders nothing itself.
   * @param {Event} event */
  #handleDividerSlotchange = (event) => {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    const element = slot
      .assignedElements()
      .find((node) => node.tagName.toLowerCase() === "chx-divider");
    this.#dividerController.setElement(
      /** @type {import("../divider/divider.js").ChxDivider | undefined} */ (element),
    );
    this.#invalidateRows(); // a divider appearing/disappearing changes every row
  };

  /** @param {ChxMessage} message @param {number} index */
  #estimateMessageSize(message, index) {
    return estimateMessageSize(message, {
      compact: this.compact,
      ...this.#groupAt(index),
      hasAuthor: this.#authorFor(message) !== undefined,
      dividerExtra: this.#dividerController.estimateExtra(message, index),
    });
  }

  /** @param {ChxMessage} message */
  #authorFor(message) {
    return authorFor(message, this.messages, this.authorDisplay);
  }

  /** Passed to chx-infinity-scroll as `.renderItem`. @param {ChxMessage} message @param {number} index */
  #renderItem = (message, index) => {
    // one sweep per render pass, once every row has had its turn
    if (!this.#pendingRenderedMessageIds) {
      this.#pendingRenderedMessageIds = new Set();
      queueMicrotask(() => {
        const rendered = /** @type {Set<string>} */ (this.#pendingRenderedMessageIds);
        this.#partRenderer.sweep();
        this.#dividerController.sweep(rendered);
        this.#focusBehavior.keepOnRendered(rendered);
        for (const id of this.#messageClones.keys()) {
          if (!rendered.has(id)) this.#messageClones.delete(id);
        }
        this.#pendingRenderedMessageIds = undefined;
      });
    }
    // a skipped row still counts as rendered, or the sweep above drops its caches
    const rendered = /** @type {Set<string>} */ (this.#pendingRenderedMessageIds);
    rendered.add(message.id);
    this.#partRenderer.keep(message);
    // before the guard: the tab stop has to be seeded for `isFocused` to read it
    this.#focusBehavior.ensureSeeded(message.id);
    const { groupStart, groupEnd } = this.#groupAt(index);
    // per row part, so a row (re)entering the DOM always renders; everything a row reads that isn't
    // derived from its message object has to be here
    return guard(
      [
        message,
        index,
        this.#authorFor(message),
        message.id === this.selectedId,
        this.compact,
        this.#focusBehavior.isFocused(message.id),
        this.#focusBehavior.isActionable(message.id),
        groupStart,
        groupEnd,
        this.#dividerController.shouldShow(message, index),
        this.partElements,
        this.#rowsVersion,
      ],
      () => this.#renderMessage(message, index),
    );
  };

  /** @param {ChxMessage} message @param {number} index */
  #renderMessage(message, index) {
    const streaming = message.parts.some((part) => part.state === "streaming");
    const selected = this.selectedId !== undefined && message.id === this.selectedId;

    /** @type {import("../../types/message.js").ChxRowState} */
    const row = {
      message,
      author: this.#authorFor(message),
      own: message.own,
      unread: message.readState === "unread",
      streaming,
      sending: isSending(message),
      selected,
      compact: this.compact,
      actionable: this.#focusBehavior.isActionable(message.id),
      ...this.#groupAt(index),
    };
    const partNames = messagePartNames(message, { streaming, compact: this.compact, selected });
    // a part missing `id` was already console.error'd by validateMessages — excluded here too
    const parts = message.parts
      .filter((part) => part.id)
      .map((part, partIndex) => this.#partRenderer.render(part, message, partIndex));

    let content;
    if (this.#messagePattern) {
      const clone = this.#messageClone(message.id);
      clone.setAttribute("part", partNames);
      clone.setAttribute("exportparts", MESSAGE_EXPORTPARTS);
      // appends after the pattern's own children and only ever manages that range
      render(parts, clone);
      content = clone;
    } else {
      content = html`<chx-message part=${partNames} exportparts=${MESSAGE_EXPORTPARTS}
        >${parts}</chx-message
      >`;
    }

    const rowTemplate = html`
      <chx-message-row
        data-message-id=${message.id}
        tabindex=${this.#focusBehavior.isFocused(message.id) ? 0 : -1}
        aria-label=${message.own ? "Your message" : "Message"}
        aria-busy=${streaming ? "true" : "false"}
        aria-current=${selected ? "true" : nothing}
        .row=${row}
        ${interiorTabbing(this.#focusBehavior, message.id)}
        >${content}</chx-message-row
      >
    `;
    return this.#dividerController.wrap(rowTemplate, message, index);
  }

  /** @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    if (changedProperties.has("messages")) {
      this.#readTracking.syncReadStates();
      if (!this.#switching) this.#pinSentMessage(changedProperties.get("messages"));
    }
    this.#switching = false;
    if (changedProperties.has("partElements")) this.#partRenderer.clear();
    // rows only re-render when infinity-scroll does, which a plain host update doesn't trigger
    if (
      changedProperties.has("compact") ||
      changedProperties.has("selectedId") ||
      changedProperties.has("authorDisplay") ||
      changedProperties.has("partElements")
    ) {
      this.#infinityScrollElement?.requestUpdate();
    }
  }

  /**
   * `scroll-mode="pin-top"`: a send is an own message appended at the tail. Runs before
   * chx-infinity-scroll receives the new `messages`, which `pinToStart()` requires.
   * @param {ChxMessage[] | undefined} previous
   */
  #pinSentMessage(previous) {
    if (this.scrollMode !== "pin-top" || !previous) return;
    const last = this.messages.at(-1);
    if (!last?.own || !this.#isAppendTo(previous)) return;
    if (this.#infinityScrollElement) this.#infinityScrollElement.pinToStart(last.id);
    else this.#pendingPinId = last.id;
  }

  /** `messages` only grew at the tail — a conversation switch never counts as a send.
   *  @param {ChxMessage[]} previous */
  #isAppendTo(previous) {
    if (this.messages.length <= previous.length) return false;
    if (previous.length === 0) return this.messages.length === 1;
    return this.messages[previous.length - 1]?.id === previous.at(-1)?.id;
  }

  /** @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    if (this.#pendingPinId !== undefined && this.#infinityScrollElement) {
      this.#infinityScrollElement.pinToStart(this.#pendingPinId);
      this.#pendingPinId = undefined;
    }
    if (this.#pendingOffset !== undefined && this.#infinityScrollElement) {
      this.#infinityScrollElement.showPosition(this.#pendingOffset);
      this.#pendingOffset = undefined;
    }
    this.#stickyController.sync();
    if (changedProperties.has("messages")) this.#stickyController.notifyMessagesChanged();
  }

  render() {
    // a message missing `id` was already console.error'd by validateMessages — excluded here too
    return html`
      ${when(
        this.dragging,
        () => html`<div class="message-list__drop-hint" part="drop-hint">${this.dropHint}</div>`,
      )}
      <div class="message-list__status" role="status">${this.#status.text}</div>
      ${choose(
        this.#status.phase,
        [
          [
            "empty",
            () => html`
              <slot name="empty" class="message-list__empty">
                <div class="message-list__empty-default">No conversation selected</div>
              </slot>
            `,
          ],
          [
            "initial-loading",
            () => html`
              <slot name="initial-loading" class="message-list__initial-loading">
                <md-progress-circular></md-progress-circular>
              </slot>
            `,
          ],
        ],
        () => html`
          <chx-infinity-scroll
            class="message-list__infinity-scroll"
            exportparts=${INFINITY_SCROLL_EXPORTPARTS}
            role="log"
            aria-live="polite"
            aria-label=${this.messagesLabel}
            .data=${this.messages}
            .itemKey=${this.#itemKey}
            .renderItem=${this.#renderItem}
            .estimateItemSize=${this.estimateItemSize}
            .overscan=${this.overscan}
            .paddingStart=${this.paddingStart}
            .paddingEnd=${this.paddingEnd}
            .scrollMargin=${this.scrollMargin}
            .useScrollendEvent=${this.useScrollendEvent}
            .shouldObserveItem=${this.#readTracking.shouldObserve}
            .visibilityThreshold=${this.readThreshold}
            .onItemVisible=${this.#readTracking.handleItemVisible}
            .scrollBehavior=${this.scrollBehavior}
            .contentAlign=${this.contentAlign}
            .scrollMode=${this.scrollMode}
            .noVirtualization=${this.noVirtualization}
            .buffer=${this.buffer}
            .hasMore=${this.hasMore}
            .loading=${this.loading}
            .onLoadMore=${this.onLoadMore}
            .onScrollerKeydown=${this.#focusBehavior.handleKeyDown}
            .onScrollerFocusin=${this.#focusBehavior.handleFocusIn}
            .onAwayFromBottomChange=${this.#handleAwayFromBottomChange}
            ${ref((el) => (this.#infinityScrollElement = /** @type {ChxInfinityScroll | undefined} */ (el)))}
          >
            <slot name="streaming" slot="footer" ?hidden=${!this.streaming}></slot>
            <slot name="typing" slot="footer" ?hidden=${!this.typing}></slot>
            ${when(
              this.#stickyController.labelText,
              () =>
                html`<button
                  slot="sticky"
                  class=${classMap({
                    "message-list__sticky-date": true,
                    "message-list__sticky-date_visible": this.#stickyController.visible,
                  })}
                  type="button"
                  aria-label=${`Jump to ${this.#stickyController.labelText}`}
                  ?inert=${!this.#stickyController.visible}
                  @click=${this.#stickyController.handleClick}
                  ${ref((el) =>
                    this.#stickyController.setButton(/** @type {HTMLElement | undefined} */ (el)),
                  )}
                >
                  <chx-divider
                    part="sticky-date"
                    label=${this.#stickyController.labelText}
                    aria-hidden="true"
                  ></chx-divider>
                </button>`,
            )}
          </chx-infinity-scroll>
        `,
      )}
      <!-- hidden, never removed: WebKit aborts a running smooth scroll when a slot is inserted or removed -->
      <slot name="loading-history" ?hidden=${!this.#status.loadingHistory}></slot>
      <slot name="scroll-to-bottom" ?hidden=${!this.#awayFromBottom}></slot>
      <slot name="divider" hidden @slotchange=${this.#handleDividerSlotchange}></slot>
      <slot name="message" hidden @slotchange=${this.#handleMessagePatternSlotchange}></slot>
    `;
  }
}
