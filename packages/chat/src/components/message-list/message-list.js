import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { ref } from "lit/directives/ref.js";

import "../message/message.js";
import "../infinity-scroll/infinity-scroll.js";
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
    typing: { type: Boolean, reflect: true, attribute: true },
    streaming: { type: Boolean, reflect: true, attribute: true },
  };

  // message.id -> { key, element }; key is the messageElement function reference (or undefined
  // for the built-in <chx-message> path) — only a matching key means previousElement is safe to
  // hand back to a renderer, so a part/message whose renderer changed never gets a stale element
  #messageElementCache = new Map();
  // part.id -> { key, element }; key is part.type
  #partElementCache = new Map();
  // Rendering now happens inside chx-infinity-scroll's own render pass (via the .renderItem
  // callback below), asynchronously relative to this component's own render() — so unlike a
  // plain single-shadow-root repeat(), there's no single "this render pass just ended" moment to
  // reset/sweep against. Instead, #renderItem collects ids into these two sets as it's called
  // (once per currently-visible item, every time chx-infinity-scroll re-renders for any reason),
  // and a microtask queued on the *first* call of a batch flushes+sweeps once every synchronous
  // call in that batch has landed — self-contained, no cross-component lifecycle coordination.
  /** @type {Set<string> | undefined} */
  #pendingRenderedMessageIds;
  /** @type {Set<string> | undefined} */
  #pendingRenderedPartIds;
  // partId -> last-seen part.state, diffed on every render() to detect a streaming start/complete
  // edge for the visually-hidden status region — a separate concern from the two caches above,
  // computed synchronously inside render() itself (not from #renderPart, which runs lazily during
  // chx-infinity-scroll's own later render pass) so this render's own status-region text is never
  // one pass stale
  #previousPartStates = new Map();
  #statusText = "";
  /** @type {ChxInfinityScroll | undefined} */
  #infinityScrollElement; // set via a ref() directive in render()
  /** @type {FocusBehaviorController} */
  #focusBehavior; // roving tabindex — assigned in the constructor, below
  // gates the scroll-to-bottom slot — flipped by infinity-scroll's onAwayFromBottomChange callback,
  // not a public property: unlike typing/streaming this is intrinsic to scroll position, not
  // something the app drives
  #awayFromBottom = false;
  // stable bound reference (not an inline arrow) — passed as chx-infinity-scroll's .itemKey, so it
  // doesn't see a "changed" property on every render
  #itemKey = (/** @type {ChxMessage} */ message, /** @type {number} */ index) => message?.id ?? index;

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

    /**
     * Forwarded straight through to chx-infinity-scroll — distance (px) from the bottom within
     * which the list still counts as "at the bottom", for both the auto-scroll-pause threshold and
     * the scroll-to-bottom slot's own visibility gate. @type {number}
     */
    this.buffer = 150;

    /**
     * Whether the other side is currently typing — gates the `typing` slot in render(). No default
     * content: unlike `messageElement`/`partElements`, an unslotted `typing`/`streaming` renders
     * nothing at all, same as `<chx-command-picker>`'s own connection (a plain, standalone element a
     * consumer imports and slots in themselves — nothing here auto-registers or auto-renders one).
     * @type {boolean}
     */
    this.typing = false;

    /** Waiting for a reply with no message yet — gates the `streaming` slot, same no-default posture as `typing` above. @type {boolean} */
    this.streaming = false;

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
    // chx-scroll-to-bottom-affordance is a light-DOM child (slotted), not part of this component's
    // own render() template, so it's caught the same way chx-chat catches chx-send-message — a
    // plain addEventListener on the host, not a template event binding
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

  /**
   * Passed to `chx-infinity-scroll` as `.renderItem` — called once per currently-visible message,
   * every time infinity-scroll re-renders for any reason (a `messages` change, a scroll, a resize
   * settling). Owns message rendering entirely; infinity-scroll only knows it returns *something*
   * to place inside its own positioning wrapper.
   * @param {ChxMessage} message
   */
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
      el.ariaLabel = message.own ? "Your message" : "Message"; // coarser than a display-name-based
      //   label, pending author display metadata this package doesn't model yet
      el.style.alignSelf = message.own ? "flex-end" : "flex-start"; // infinity-scroll's own
      //   wrapper is a plain flex container with no own/not-own concept — this is the only place
      //   that decides message alignment, applies uniformly to the built-in and custom paths alike
      this.#focusBehavior.ensureSeeded(message.id); // first-ever render: seed a tab stop before
      //   applyToElement below reads it — without one, Tab from outside the list has nowhere to land
      this.#focusBehavior.applyToElement(message.id, el);
      // a part missing `id` was already console.error'd by validateMessages — excluded here too
      el.replaceChildren(
        ...message.parts.filter((part) => part.id).map((part) => this.#renderPart(part)),
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
   * @returns {string | HTMLElement}
   */
  #renderPart(part) {
    /** @type {Set<string>} */ (this.#pendingRenderedPartIds).add(part.id);
    const renderer = this.partElements?.[part.type];
    if (!renderer) {
      // built into el.replaceChildren() below (native DOM, not a Lit `html` template) — a Lit
      // directive like unsafeHTML() has no meaning there, so the html fallback builds a real node
      if (part.html) {
        const span = document.createElement("span");
        span.innerHTML = part.html;
        return span;
      }
      return part.text ?? "";
    }

    const cached = this.#partElementCache.get(part.id);
    const previous = cached?.key === part.type ? cached.element : undefined;
    const element = renderer(part, previous);
    this.#partElementCache.set(part.id, { key: part.type, element });
    return element;
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

  /**
   * Diffs current part `state`s against the previous render's snapshot to detect a streaming
   * start/complete edge — computed synchronously here (not from #renderPart, which runs lazily
   * during chx-infinity-scroll's own later render pass) so this render's own status-region text is
   * never one pass stale. Multiple simultaneous edges in one pass collapse to the last one seen —
   * good enough for a concise, non-token-by-token announcement.
   */
  #updateStatusText() {
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

  /** The chx-infinity-scroll instance rendering this list — public so a consumer can reach its own
   * API (scrollToIndex, part-based styling) directly. @returns {ChxInfinityScroll | undefined} */
  get list() {
    return this.#infinityScrollElement;
  }

  /**
   * Scrolls to the newest message — see chx-infinity-scroll.scrollToBottom, this forwards to it.
   * @param {"auto" | "smooth" | "instant"} [behavior]
   */
  scrollToBottom(behavior) {
    this.#infinityScrollElement?.scrollToBottom(behavior);
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
      <chx-infinity-scroll
        class="message-list__infinity-scroll"
        role="log"
        aria-live="polite"
        aria-label=${this.messagesLabel}
        .data=${this.messages}
        .itemKey=${this.#itemKey}
        .renderItem=${this.#renderItem}
        .scrollBehavior=${this.scrollBehavior}
        .contentAlign=${this.contentAlign}
        .buffer=${this.buffer}
        .onScrollerKeydown=${this.#focusBehavior.handleKeyDown}
        .onScrollerFocusin=${this.#focusBehavior.handleFocusIn}
        .onAwayFromBottomChange=${this.#handleAwayFromBottomChange}
        ${ref((el) => (this.#infinityScrollElement = /** @type {ChxInfinityScroll | undefined} */ (el)))}
      >
        ${when(this.streaming, () => html`<slot name="streaming" slot="footer"></slot>`)}
        ${when(this.typing, () => html`<slot name="typing" slot="footer"></slot>`)}
      </chx-infinity-scroll>
      ${when(this.#awayFromBottom, () => html`<slot name="scroll-to-bottom" slot="footer"></slot>`)}
    `;
  }
}
