import { indexById } from "../../utils/messages.js";
import { pollFrames } from "../../utils/dom.js";

/** @import { ChxMessage } from "../../types/message.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & import("lit").LitElement} Host
 * @typedef {{
 *   getMessages: () => ChxMessage[],
 *   getRenderRoot: () => DocumentFragment | Element | undefined,
 *   scrollToIndex: (index: number) => void,
 *   requestRerender: () => void,
 * }} FocusBehaviorConfig
 */

/**
 * Roving tabindex over the rendered messages: one Tab stop, Arrow/Home/End move it (clamped),
 * Enter drills into a message's controls, Escape returns. Rows live in `chx-infinity-scroll`'s
 * shadow root, hence `getRenderRoot`; and a host update alone doesn't re-render that child, hence
 * `requestRerender`.
 * @implements {ReactiveController}
 */
export class FocusBehaviorController {
  static #INTERIOR_FOCUSABLE_SELECTOR = "button, a[href], input, select, textarea, [tabindex]";

  /**
   * Matches in `root` and its open shadow roots — a host's `tabindex="-1"` doesn't hide its shadow
   * content in WebKit. Closed roots read `actionable` from the row context instead.
   * @param {Element | ShadowRoot} root @param {string} selector @returns {Generator<Element>}
   */
  static *#deepQuery(root, selector) {
    for (const el of root.querySelectorAll("*")) {
      if (el.matches(selector)) yield el;
      // chx-message's own shadow holds only slots and a decorative avatar
      if (el.shadowRoot && el.localName !== "chx-message") {
        yield* FocusBehaviorController.#deepQuery(el.shadowRoot, selector);
      }
    }
  }

  /** @type {FocusBehaviorConfig} */
  #config;
  /** the single roving tab stop @type {string | null} */
  #focusedId = null;
  /** the message currently drilled into @type {string | null} */
  #actionableId = null;
  /** a `#moveFocusTo` target not mounted yet @type {string | null} */
  #pendingFocusId = null;

  /** @param {Host} host @param {FocusBehaviorConfig} config */
  constructor(host, config) {
    this.#config = config;
    host.addController(this);
  }

  /** Seeds the first rendered message as the tab stop, so Tab from outside has somewhere to land.
   *  Called from the render path. @param {string} id */
  ensureSeeded(id) {
    if (this.#focusedId === null) this.#focusedId = id;
  }

  /** @param {string} id */
  isFocused(id) {
    return id === this.#focusedId;
  }

  /** @param {string} id */
  isActionable(id) {
    return id === this.#actionableId;
  }

  /**
   * The light-DOM children a `partElements` renderer produced aren't Lit's, so no binding can drop
   * them from the Tab order. Runs every render (`interiorTabbing()`); both halves are idempotent.
   * @param {string} id @param {HTMLElement} el
   */
  syncInteriorTabbing(id, el) {
    if (this.isActionable(id)) this.#restoreInteriorTabbing(el);
    else this.#suppressInteriorTabbing(el);
  }

  /** @param {HTMLElement} messageElement */
  #suppressInteriorTabbing(messageElement) {
    for (const el of FocusBehaviorController.#deepQuery(
      messageElement,
      FocusBehaviorController.#INTERIOR_FOCUSABLE_SELECTOR,
    )) {
      if (el.hasAttribute("data-roving-hidden-tabindex")) continue; // already suppressed
      el.setAttribute("data-roving-hidden-tabindex", el.getAttribute("tabindex") ?? "");
      el.setAttribute("tabindex", "-1");
    }
  }

  /** @param {HTMLElement} messageElement */
  #restoreInteriorTabbing(messageElement) {
    for (const el of FocusBehaviorController.#deepQuery(
      messageElement,
      "[data-roving-hidden-tabindex]",
    )) {
      const original = el.getAttribute("data-roving-hidden-tabindex");
      el.removeAttribute("data-roving-hidden-tabindex");
      if (original) el.setAttribute("tabindex", original);
      else el.removeAttribute("tabindex");
    }
  }

  /** One delegated listener on the scroller. A row without `role="article"` + `data-message-id`
   *  silently drops out of roving focus. @param {KeyboardEvent} event */
  handleKeyDown = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const message = /** @type {HTMLElement | null} */ (target.closest("[role='article']"));
    if (!message) return;
    const id = message.dataset.messageId;
    if (!id) return;

    if (event.key === "Enter" && id === this.#focusedId && !this.#actionableId) {
      this.#drillInto(id, message);
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && this.#actionableId) {
      this.#exitDrillIn();
      event.preventDefault();
      return;
    }
    if (this.#actionableId) return; // arrow/home/end prevented while drilled in
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (target !== message) return; // only when focus is on the article itself, not a descendant

    const messages = this.#config.getMessages();
    const index = indexById(messages).get(id) ?? -1;
    const targetIndex =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : messages.length - 1;
    this.#moveFocusTo(Math.max(0, Math.min(targetIndex, messages.length - 1))); // clamped, no wraparound
    event.preventDefault();
  };

  /** Any focus landing inside a message claims the tab stop. @param {FocusEvent} event */
  handleFocusIn = (event) => {
    const message = /** @type {HTMLElement} */ (event.target).closest("[role='article']");
    const id = /** @type {HTMLElement | null} */ (message)?.dataset.messageId;
    if (!id || id === this.#focusedId) return;
    this.#claimFocus(id);
  };

  /** @param {string} id */
  #claimFocus(id) {
    this.#focusedId = id;
    this.#config.requestRerender();
  }

  /** Moves the tab stop to `index`, scrolling it into view and focusing once it mounts.
   *  @param {number} index */
  async #moveFocusTo(index) {
    const target = this.#config.getMessages()[index];
    if (!target) return;
    this.#focusedId = target.id;
    this.#config.requestRerender();

    const find = () => {
      const el = this.#config.getRenderRoot()?.querySelector(`[data-message-id="${target.id}"]`);
      return el instanceof HTMLElement && el.isConnected ? el : undefined;
    };
    const existing = find();
    if (existing) {
      existing.focus();
      return;
    }
    // the scroll settles over infinity-scroll's own renders, which never reach this host's hostUpdated
    this.#pendingFocusId = target.id;
    this.#config.scrollToIndex(index);
    const mounted = await pollFrames(find);
    if (this.#pendingFocusId !== target.id) return; // superseded, or the host reconnected
    this.#pendingFocusId = null;
    mounted?.focus();
  }

  /** @param {string} id @param {HTMLElement} messageElement */
  #drillInto(id, messageElement) {
    this.#actionableId = id;
    this.#config.requestRerender();
    this.#restoreInteriorTabbing(messageElement);
    const first = /** @type {HTMLElement | undefined} */ (
      FocusBehaviorController.#deepQuery(
        messageElement,
        FocusBehaviorController.#INTERIOR_FOCUSABLE_SELECTOR,
      ).next().value
    );
    first?.focus();
  }

  /** Back to the article itself. */
  #exitDrillIn() {
    const el = this.#actionableId
      ? this.#config.getRenderRoot()?.querySelector(`[data-message-id="${this.#actionableId}"]`)
      : undefined;
    if (el instanceof HTMLElement) this.#suppressInteriorTabbing(el);
    this.#actionableId = null;
    this.#config.requestRerender();
    if (el instanceof HTMLElement) el.focus(); // back to the article itself
  }

  /** A pending focus target from before a disconnect is stale. */
  hostConnected() {
    this.#pendingFocusId = null;
  }
}
