import { html, LitElement, nothing, render } from "lit";
import { customElement } from "lit/decorators.js";
import { directive, Directive, PartType } from "lit/directive.js";
import { when } from "lit/directives/when.js";
import { choose } from "lit/directives/choose.js";
import { ref } from "lit/directives/ref.js";
import { classMap } from "lit/directives/class-map.js";

import "@symblight/wc-material/progress-circular";
import "../message/message.js";
import "../message-row/message-row.js";
import "../infinity-scroll/infinity-scroll.js";
import "../loading-history/loading-history.js";
import "../divider/divider.js";
import { FocusBehaviorController } from "../../controllers/message-list/FocusBehaviorController.js";
import { BottomAnchorController } from "../../controllers/message-list/BottomAnchorController.js";
import { ReadTrackingController } from "../../controllers/message-list/ReadTrackingController.js";
import { DividerController } from "../../controllers/message-list/DividerController.js";
import { GroupController } from "../../controllers/message-list/GroupController.js";
import { PartRenderer } from "./PartRenderer.js";
import { StatusController } from "../../controllers/message-list/StatusController.js";
import { StickyController } from "../../controllers/message-list/StickyController.js";
import { CONNECT_REGISTRY } from "../../api/keys.js";
import tokens from "../../styles/tokens.css?inline";
import styles from "./message-list.css?inline";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxPartRenderer } from "../../types/adapter.js" */
/** @import { ChxInfinityScroll } from "../infinity-scroll/infinity-scroll.js" */

// chx-message sits two shadow roots deep (message-list → infinity-scroll → message), so a page-level
// ::part() only reaches it with an exportparts hop at *every* host in between — see CLAUDE.md's
// "::part() only forwards one shadow level". Prefixed on the way out so they can't collide with
// chx-infinity-scroll's own parts.
const MESSAGE_PARTS = [
  "unread-marker",
  "avatar",
  "body",
  "meta",
  "attachments",
  "before-content",
  "content",
  "after-content",
  "status",
  "actions",
];
const MESSAGE_EXPORTPARTS = MESSAGE_PARTS.map((part) => `${part}: message-${part}`).join(", ");
// Per-row state names on the chx-message host itself, a deliberately closed vocabulary: exportparts
// has no wildcard, so every name a page can ever target has to be listed literally here.
const MESSAGE_STATE_PARTS = [
  "message-own",
  "message-incoming", // own's complement: part selectors can't be negated, so "not own" needs a name
  "message-unread",
  "message-streaming",
  "message-system",
  "message-compact",
  "message-loading",
  "message-selected",
];
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
const INFINITY_SCROLL_EXPORTPARTS = [
  "scroller",
  "sticky",
  "viewport",
  "item",
  "message",
  ...MESSAGE_STATE_PARTS,
  ...MESSAGE_PARTS.map((part) => `message-${part}`),
].join(", ");

// Pre-measurement geometry, mirroring message.css — only an estimate, the virtualizer measures the real row.
const ESTIMATE = {
  regular: { charsPerLine: 52, lineHeight: 24, padding: 16, meta: 20 },
  compact: { charsPerLine: 70, lineHeight: 20, padding: 6, meta: 19, avatar: 25 },
  rowPadding: 2, // .infinity-scroll__row
  groupGap: 12, // --chx-message-group-gap
  attachments: 128, // one wrapped row of attachment cards
};

/** Own message still being delivered — an incoming reply shell is also "sending" while it streams,
 * but that's `busy`, not a delivery state. @param {ChxMessage} message */
function isSending(message) {
  return message.own && message.status === "sending";
}

/** The row's part names, drawn from MESSAGE_STATE_PARTS. Custom properties set in a matching
 * `::part()` rule inherit into chx-message's shadow tree, which is how a page restyles a row's
 * interior (e.g. a chrome-free system row) without a nested part selector — those don't exist.
 * @param {ChxMessage} message @param {{streaming: boolean, compact: boolean, selected: boolean}} state */
function messagePartNames(message, { streaming, compact, selected }) {
  const names = ["message"];
  names.push(message.own ? "message-own" : "message-incoming");
  if (message.readState === "unread") names.push("message-unread");
  if (streaming) names.push("message-streaming");
  if (message.parts?.[0]?.type === "system") names.push("message-system");
  if (compact) names.push("message-compact");
  if (isSending(message)) names.push("message-loading");
  if (selected) names.push("message-selected");
  return names.join(" ");
}

/**
 * Element directive that re-runs `FocusBehaviorController.syncInteriorTabbing` on every render pass.
 * `ref()` can't stand in for it — that only fires when the element itself changes, and the tab order
 * has to be re-applied whenever a message's children change too.
 */
class InteriorTabbingDirective extends Directive {
  /** @param {import("lit/directive.js").PartInfo} partInfo */
  constructor(partInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) throw new Error("interiorTabbing(): element directive");
  }

  /** Never called — an element directive commits nothing. Declared with the real signature anyway,
   *  since that's what types the `interiorTabbing(...)` call site.
   *  @param {FocusBehaviorController} _focusBehavior @param {string} _id */
  render(_focusBehavior, _id) {}

  /**
   * @param {import("lit/directive.js").ElementPart} part
   * @param {[FocusBehaviorController, string]} args
   */
  update(part, [focusBehavior, id]) {
    focusBehavior.syncInteriorTabbing(id, /** @type {HTMLElement} */ (part.element));
  }
}
const interiorTabbing = directive(InteriorTabbingDirective);

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
  /** An own message appended before chx-infinity-scroll existed, pinned once it does. @type {string | undefined} */
  #pendingPinId;
  /** @type {PartRenderer} */
  #partRenderer; // per-part element rendering + cache — assigned in the constructor, below
  /** @type {DividerController} */
  #dividerController; // date dividers — assigned in the constructor, below
  /** Last known author per authorId, rebuilt when `messages` changes by reference.
   *  @type {{messages: ChxMessage[], byId: Map<string, import("../../types/message.js").ChxMessageAuthor>} | undefined} */
  #knownAuthors;
  /** @type {GroupController} */
  #groups; // same-author runs — assigned in the constructor, below
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
  /** @type {BottomAnchorController} */
  #bottomAnchor; // away-from-bottom state + scrollToBottom — assigned in the constructor, below
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
    this.#requestRerender();
  });
  /** Re-renders this host *and* chx-infinity-scroll. The second call is not redundant: none of the
   *  properties passed down change by reference on a plain host re-render, so Lit's `PropertyPart`
   *  skips re-setting them and the rows never re-run `#renderItem`. Anything that changes what a row
   *  should look like without changing `messages` has to go through here. */
  #requestRerender = () => {
    this.requestUpdate();
    this.#infinityScrollElement?.requestUpdate();
  };
  #itemKey = (/** @type {ChxMessage} */ message, /** @type {number} */ index) =>
    message?.id ?? index;
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

    /** @type {Record<string, ChxPartRenderer> | undefined} */
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

    this.#groups = new GroupController({
      getMessages: () => this.messages,
      hasDividerBefore: (message, index) => this.#dividerController.shouldShow(message, index),
    });

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
      getAwayFromBottom: () => this.#bottomAnchor.awayFromBottom,
    });

    // after StickyController — it takes the instance, while StickyController only takes a lazy getter
    this.#bottomAnchor = new BottomAnchorController(this, {
      getInfinityScrollElement: () => this.#infinityScrollElement,
      stickyController: this.#stickyController,
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
        toBottom: (behavior) => this.#bottomAnchor.scrollToBottom(behavior),
        toMessage: (messageId, options) => this.#scrollToMessage(messageId, options),
        isAwayFromBottom: () => this.#bottomAnchor.awayFromBottom,
        getScrollOffset: () => this.#infinityScrollElement?.getScrollOffset(),
        scrollToOffset: async (offset) => {
          await this.updateComplete;
          this.#infinityScrollElement?.scrollToOffset(offset);
        },
      },
      () => [this.#bottomAnchor.awayFromBottom],
    );
  }

  /**
   * Scrolls a loaded message into view; `false` when it isn't in `messages`. Resolves once the row
   * has mounted and been re-aligned at its measured size (or after a capped number of frames).
   * @param {string} messageId
   * @param {{align?: "start" | "center" | "end", behavior?: ScrollBehavior}} [options]
   * @returns {Promise<boolean>}
   */
  async #scrollToMessage(messageId, { align = "start", behavior } = {}) {
    const index = this.messages.findIndex((message) => message.id === messageId);
    if (index === -1) return false;
    await this.updateComplete;
    const list = this.#infinityScrollElement;
    if (!list) return false;
    list.scrollToIndex(index, { align, behavior });
    const selector = `[data-message-id="${CSS.escape(messageId)}"]`;
    for (let frame = 0; frame < 30; frame++) {
      if (list.renderRoot.querySelector(selector)) {
        list.scrollToIndex(index, { align, behavior }); // re-align at the measured size
        return true;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return false;
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
    this.#requestRerender();
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
    this.#requestRerender(); // a divider appearing/disappearing changes every row
  };

  /** Rough pre-measurement height — text length → line count → px, cheap and approximate on purpose.
   * @param {ChxMessage} message @param {number} index */
  #estimateMessageSize(message, index) {
    const parts = message.parts ?? [];
    const chars = parts.reduce(
      (sum, part) =>
        part.type === "attachment" ? sum : sum + (part.text?.length ?? part.html?.length ?? 0),
      0,
    );
    const density = this.compact ? ESTIMATE.compact : ESTIMATE.regular;
    const lines = Math.max(1, Math.ceil(chars / density.charsPerLine));
    let size = lines * density.lineHeight + density.padding;
    if (parts.some((part) => part.type === "attachment")) size += ESTIMATE.attachments;

    const { groupStart, groupEnd } = this.#groups.at(index);
    // regular own rows hide their meta and avatar in CSS, so their author adds no height
    const authorShown = this.#authorFor(message) !== undefined && (this.compact || !message.own);
    if (groupStart && authorShown) size += density.meta;
    if (this.compact && authorShown)
      size = Math.max(size, ESTIMATE.compact.avatar + density.padding);
    if (groupEnd) size += ESTIMATE.groupGap;

    // divider folds into the row
    return size + ESTIMATE.rowPadding + this.#dividerController.estimateExtra(message, index);
  }

  /** The row's author, per `author-display`. @param {ChxMessage} message */
  #authorFor(message) {
    if (this.authorDisplay !== "all" && (this.authorDisplay !== "incoming" || message.own))
      return undefined;
    // an optimistic send or a realtime event often carries only authorId — borrow the author from
    // another message by the same authorId
    if (message.author || message.authorId === undefined) return message.author;
    return this.#authorsById().get(message.authorId);
  }

  #authorsById() {
    if (this.#knownAuthors?.messages !== this.messages) {
      const byId = new Map();
      for (const message of this.messages) {
        if (message.author && message.authorId !== undefined)
          byId.set(message.authorId, message.author);
      }
      this.#knownAuthors = { messages: this.messages, byId };
    }
    return this.#knownAuthors.byId;
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
        for (const id of this.#messageClones.keys()) {
          if (!rendered.has(id)) this.#messageClones.delete(id);
        }
        this.#pendingRenderedMessageIds = undefined;
      });
    }
    return this.#renderMessage(message, index);
  };

  /** @param {ChxMessage} message @param {number} index */
  #renderMessage(message, index) {
    /** @type {Set<string>} */ (this.#pendingRenderedMessageIds).add(message.id);
    const streaming = message.parts.some((part) => part.state === "streaming");
    const selected = this.selectedId !== undefined && message.id === this.selectedId;
    // before the html below — every ${} evaluates eagerly, at tag-call time, so the tabindex binding
    // would otherwise read an unseeded focus state on the very first row
    this.#focusBehavior.ensureSeeded(message.id);

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
      ...this.#groups.at(index),
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
      this.#pinSentMessage(changedProperties.get("messages"));
    }
    // rows only re-render when infinity-scroll does, which a plain host update doesn't trigger
    if (
      changedProperties.has("compact") ||
      changedProperties.has("selectedId") ||
      changedProperties.has("authorDisplay")
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

  /**
   * `typing`/`streaming` land in chx-infinity-scroll's `footer` slot, which the virtualizer has no
   * concept of (see `scrollToBottom()`'s own doc) — appearing/growing there doesn't move
   * `chx-infinity-scroll`'s own reactive properties, so nothing auto-follows it the way a new message
   * does. Re-stick explicitly on the one moment it can matter: the toggle itself, and only when the
   * user was already at the bottom (a scrolled-up reader shouldn't be yanked down by an indicator).
   * @param {import("lit").PropertyValues} changedProperties
   */
  updated(changedProperties) {
    if (this.#pendingPinId !== undefined && this.#infinityScrollElement) {
      this.#infinityScrollElement.pinToStart(this.#pendingPinId);
      this.#pendingPinId = undefined;
    }
    if (
      (changedProperties.has("typing") || changedProperties.has("streaming")) &&
      !this.#bottomAnchor.awayFromBottom &&
      (this.#infinityScrollElement?.following ?? true)
    ) {
      this.#bottomAnchor.scrollToBottom(this.scrollBehavior);
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
            .onAwayFromBottomChange=${this.#bottomAnchor.handleAwayFromBottomChange}
            ${ref((el) => (this.#infinityScrollElement = /** @type {ChxInfinityScroll | undefined} */ (el)))}
          >
            ${when(this.streaming, () => html`<slot name="streaming" slot="footer"></slot>`)}
            ${when(this.typing, () => html`<slot name="typing" slot="footer"></slot>`)}
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
      ${when(this.#status.loadingHistory, () => html`<slot name="loading-history"></slot>`)}
      ${when(this.#bottomAnchor.awayFromBottom, () => html`<slot name="scroll-to-bottom"></slot>`)}
      <slot name="divider" hidden @slotchange=${this.#handleDividerSlotchange}></slot>
      <slot name="message" hidden @slotchange=${this.#handleMessagePatternSlotchange}></slot>
    `;
  }
}
