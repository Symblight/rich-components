import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { ref } from "lit/directives/ref.js";

import "@symblight/wc-material/progress-circular";
import "../message/message.js";
import "../infinity-scroll/infinity-scroll.js";
import "../loading-history/loading-history.js";
import { FocusBehaviorController } from "../../controllers/FocusBehaviorController.js";
import styles from "./message-list.css?inline";

/** @import { ChxMessage, ChxMessagePart } from "../../types/message.js" */
/** @import { ChxMessageRenderer, ChxPartRenderer } from "../../types/adapter.js" */
/** @import { ChxInfinityScroll } from "../infinity-scroll/infinity-scroll.js" */

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
    messageElement: { attribute: false },
    partElements: { attribute: false },
    messagesLabel: { type: String, attribute: "messages-label" },
    scrollBehavior: { type: String, attribute: "scroll-behavior" },
    contentAlign: { type: String, attribute: "content-align" },
    buffer: { type: Number },
    estimateItemSize: { attribute: false },
    overscan: { type: Number },
    paddingStart: { type: Number, attribute: "padding-start" },
    paddingEnd: { type: Number, attribute: "padding-end" },
    scrollMargin: { type: Number, attribute: "scroll-margin" },
    useScrollendEvent: { type: Boolean, attribute: "use-scrollend-event" },
    typing: { type: Boolean, reflect: true, attribute: true },
    streaming: { type: Boolean, reflect: true, attribute: true },
    loading: { type: Boolean },
    hasMore: { type: Boolean },
    onLoadMore: { attribute: false },
  };

  #messageElementCache = new Map();
  #partElementCache = new Map();
  /** @type {Set<string> | undefined} */
  #pendingRenderedMessageIds;
  /** @type {Set<string> | undefined} */
  #pendingRenderedPartIds;
  #previousPartStates = new Map();
  #statusText = "";
  /** @type {ChxInfinityScroll | undefined} */
  #infinityScrollElement; // set via a ref() directive in render()
  /** @type {FocusBehaviorController} */
  #focusBehavior; // roving tabindex — assigned in the constructor, below
  #awayFromBottom = false;
  #itemKey = (/** @type {ChxMessage} */ message, /** @type {number} */ index) =>
    message?.id ?? index;

  constructor() {
    super();

    /** @type {boolean} */
    this.dragging = false;

    /** @type {string} */
    this.dropHint = "Release to attach";

    /** @type {ChxMessage[]} */
    this.messages = [];

    /** @type {ChxMessageRenderer | undefined} */
    this.messageElement = undefined;

    /** @type {Record<string, ChxPartRenderer> | undefined} */
    this.partElements = undefined;

    /** @type {string} */
    this.messagesLabel = "Messages";

    /** Governs `scrollToBottom()` only. @type {"auto" | "smooth"} */
    this.scrollBehavior = "auto";

    /** Forwarded straight through to chx-infinity-scroll. @type {"start" | "end"} */
    this.contentAlign = "end";

    /** Forwarded straight through to chx-infinity-scroll — "at the bottom" threshold, in px. @type {number} */
    this.buffer = 150;

    /** Forwarded straight through to chx-infinity-scroll — content-aware pre-measurement estimate. @type {(item: ChxMessage, index: number) => number} */
    this.estimateItemSize = (message) => this.#estimateMessageSize(message);

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

    /** Gates the `typing` slot in render() — no default content. @type {boolean} */
    this.typing = false;

    /** Waiting for a reply with no message yet — gates the `streaming` slot, same no-default posture as `typing` above. @type {boolean} */
    this.streaming = false;

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
      requestRerender: () => {
        this.requestUpdate();
        this.#infinityScrollElement?.requestUpdate();
      },
    });
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    // slotted light-DOM child, so caught via addEventListener, not a template event binding
    this.addEventListener(
      "chx-scroll-to-bottom-click",
      /** @type {EventListener} */ (this.#handleScrollToBottomClick),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener(
      "chx-scroll-to-bottom-click",
      /** @type {EventListener} */ (this.#handleScrollToBottomClick),
    );
  }

  /** @param {CustomEvent<{behavior: "auto" | "smooth" | "instant"}>} event */
  #handleScrollToBottomClick = (event) => {
    this.scrollToBottom(event.detail.behavior);
  };

  /** @param {boolean} away */
  #handleAwayFromBottomChange = (away) => {
    this.#awayFromBottom = away;
    this.requestUpdate();
  };

  /** Rough pre-measurement height — text length → line count → px, cheap and approximate on purpose.
   * @param {ChxMessage} message */
  #estimateMessageSize(message) {
    const chars = (message.parts ?? []).reduce((sum, part) => {
      if (part.type === "attachment") return sum + 220; // attachment cards are tall and text-less
      return sum + (part.text?.length ?? part.html?.length ?? 0);
    }, 0);
    const lines = Math.max(1, Math.ceil(chars / 42)); // ~42 chars per rendered line
    return 32 + lines * 20; // meta + padding, then line-height per line
  }

  /** Passed to chx-infinity-scroll as `.renderItem`. @param {ChxMessage} message */
  #renderItem = (message) => {
    if (!this.#pendingRenderedMessageIds) {
      this.#pendingRenderedMessageIds = new Set();
      this.#pendingRenderedPartIds = new Set();
      queueMicrotask(() => {
        this.#sweepCaches(
          /** @type {Set<string>} */ (this.#pendingRenderedMessageIds),
          /** @type {Set<string>} */ (this.#pendingRenderedPartIds),
        );
        this.#pendingRenderedMessageIds = undefined;
        this.#pendingRenderedPartIds = undefined;
      });
    }
    return this.#renderMessage(message);
  };

  /** @param {ChxMessage} message */
  #renderMessage(message) {
    /** @type {Set<string>} */ (this.#pendingRenderedMessageIds).add(message.id);
    const cached = this.#messageElementCache.get(message.id);

    if (!this.messageElement) {
      /** @type {HTMLElement & {own: boolean, busy: boolean, actionable: boolean, ariaLabel: string | null}} */
      const el =
        cached && cached.key === undefined
          ? /** @type {any} */ (cached.element)
          : /** @type {any} */ (document.createElement("chx-message"));
      el.own = message.own;
      el.busy = message.parts.some((part) => part.state === "streaming");
      el.ariaLabel = message.own ? "Your message" : "Message"; // no author display-name metadata yet
      el.style.alignSelf = message.own ? "flex-end" : "flex-start"; // infinity-scroll has no own/not-own concept
      this.#focusBehavior.ensureSeeded(message.id); // seed a tab stop before applyToElement reads it
      this.#focusBehavior.applyToElement(message.id, el);
      // a part missing `id` was already console.error'd by validateMessages — excluded here too
      el.replaceChildren(
        ...message.parts
          .filter((part) => part.id)
          .map((part, index) => this.#renderPart(part, message, index)),
      );
      this.#messageElementCache.set(message.id, { key: undefined, element: el });
      return el;
    }

    const previous = cached?.key === this.messageElement ? cached.element : undefined;
    const element = this.messageElement(message, previous);
    element.style.alignSelf = message.own ? "flex-end" : "flex-start";
    this.#messageElementCache.set(message.id, { key: this.messageElement, element });
    return element;
  }

  /**
   * @param {ChxMessagePart} part
   * @param {ChxMessage} message
   * @param {number} index
   * @returns {string | HTMLElement}
   */
  #renderPart(part, message, index) {
    /** @type {Set<string>} */ (this.#pendingRenderedPartIds).add(part.id);
    const renderer = this.partElements?.[part.type];
    if (renderer) {
      const cached = this.#partElementCache.get(part.id);
      const previous = cached?.key === part.type ? cached.element : undefined;
      const element = renderer(part, previous, message, index);
      if (part.type === "attachment" && element instanceof HTMLElement)
        element.slot = "attachments";
      this.#partElementCache.set(part.id, { key: part.type, part, element });
      return element;
    }
    if (part.html) return this.#renderHtmlPart(part);
    if (part.text) return part.text;
    return this.#renderUnknownPart(part);
  }

  /** No renderer, no text/html — an inert marker so a missing `partElements` entry is at least visible.
   * @param {ChxMessagePart} part @returns {HTMLElement} */
  #renderUnknownPart(part) {
    const cached = this.#getCachedElement(part);
    if (cached !== undefined) return /** @type {HTMLElement} */ (cached);

    const span = document.createElement("span");
    span.dataset.partType = part.type;
    this.#partElementCache.set(part.id, { key: part.type, part, element: span });
    return span;
  }

  /** Strict cache hit for the default rendering path — same type AND same part reference.
   * @param {ChxMessagePart} part @returns {string | HTMLElement | undefined} */
  #getCachedElement(part) {
    const cached = this.#partElementCache.get(part.id);
    return cached?.key === part.type && cached.part === part ? cached.element : undefined;
  }

  /** Plain HTML formatting (bold/italic/etc.) — rendered as-is, no rich hydration.
   * @param {ChxMessagePart} part @returns {HTMLElement} */
  #renderHtmlPart(part) {
    const cached = this.#getCachedElement(part);
    if (cached !== undefined) return /** @type {HTMLElement} */ (cached);

    // native DOM, not a Lit template — unsafeHTML() has no meaning here
    const span = document.createElement("span");
    span.innerHTML = /** @type {string} */ (part.html);
    this.#partElementCache.set(part.id, { key: part.type, part, element: span });
    return span;
  }

  /**
   * @param {Set<string>} renderedMessageIds
   * @param {Set<string>} renderedPartIds
   */
  #sweepCaches(renderedMessageIds, renderedPartIds) {
    for (const id of this.#messageElementCache.keys()) {
      if (!renderedMessageIds.has(id)) this.#messageElementCache.delete(id);
    }
    for (const id of this.#partElementCache.keys()) {
      if (!renderedPartIds.has(id)) this.#partElementCache.delete(id);
    }
  }

  /** Diffs part states against the previous render's snapshot to detect a streaming start/complete edge. */
  #updateStatusText() {
    // no edge-tracking needed — role="status" only re-announces on an actual text change
    if (this.#isInitialLoading()) {
      this.#statusText = "Loading messages";
    } else if (this.#isLoadingHistory()) {
      this.#statusText = "Loading older messages";
    }

    /** @type {Map<string, ChxMessagePart["state"]>} */
    const currentPartStates = new Map();
    for (const message of this.messages) {
      for (const part of message.parts ?? []) {
        if (!part.id) continue;
        currentPartStates.set(part.id, part.state);
      }
    }

    for (const [partId, state] of currentPartStates) {
      const previous = this.#previousPartStates.get(partId);
      if (previous !== "streaming" && state === "streaming") {
        this.#statusText = "Assistant is responding";
      } else if (previous === "streaming" && state !== "streaming") {
        this.#statusText = "Response complete";
      }
    }
    this.#previousPartStates = currentPartStates;
  }

  /** True while fetching with no messages rendered yet — gates the `initial-loading` slot. */
  #isInitialLoading() {
    return this.loading && this.messages.length === 0;
  }

  /** The complement of `#isInitialLoading()` — gates the `loading-history` slot. */
  #isLoadingHistory() {
    return this.loading && this.messages.length > 0;
  }

  /** The chx-infinity-scroll instance rendering this list. @returns {ChxInfinityScroll | undefined} */
  get list() {
    return this.#infinityScrollElement;
  }

  /** Forwards to chx-infinity-scroll.scrollToBottom. @param {"auto" | "smooth" | "instant"} [behavior] */
  scrollToBottom(behavior) {
    this.#infinityScrollElement?.scrollToBottom(behavior);
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
    if (
      (changedProperties.has("typing") || changedProperties.has("streaming")) &&
      !this.#awayFromBottom
    ) {
      this.#infinityScrollElement?.scrollToBottom(this.scrollBehavior);
    }
  }

  render() {
    this.#updateStatusText();

    // a message missing `id` was already console.error'd by validateMessages — excluded here too
    return html`
      ${when(
        this.dragging,
        () => html`<div class="message-list__drop-hint" part="drop-hint">${this.dropHint}</div>`,
      )}
      <div class="message-list__status" role="status">${this.#statusText}</div>
      ${when(
          this.#isInitialLoading(),
          () => html`
            <slot name="initial-loading" class="message-list__initial-loading">
              <md-progress-circular></md-progress-circular>
            </slot>
          `,
          () => html`
            <chx-infinity-scroll
                class="message-list__infinity-scroll"
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
                .scrollBehavior=${this.scrollBehavior}
                .contentAlign=${this.contentAlign}
                .buffer=${this.buffer}
                .hasMore=${this.hasMore}
                .loading=${this.loading}
                .onLoadMore=${this.onLoadMore}
                .onScrollerKeydown=${this.#focusBehavior.handleKeyDown}
                .onScrollerFocusin=${this.#focusBehavior.handleFocusIn}
                .onAwayFromBottomChange=${this.#handleAwayFromBottomChange}
                ${ref((el) => (this.#infinityScrollElement = /** @type {ChxInfinityScroll | undefined} */ (el)))}
            >
              ${when(this.streaming, () => html`<slot name="streaming" slot="footer"></slot>`)}
              ${when(this.typing, () => html`<slot name="typing" slot="footer"></slot>`)}
            </chx-infinity-scroll>
          `
      )}
      ${when(
        this.#isLoadingHistory(),
        () => html`<slot name="loading-history"></slot>`,
      )}
      ${when(this.#awayFromBottom, () => html`<slot name="scroll-to-bottom"></slot>`)}
    `;
  }
}
