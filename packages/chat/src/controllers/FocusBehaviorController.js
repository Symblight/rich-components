/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Roving tabindex over a rendered list of message elements — a single Tab stop that moves
 * between messages via Arrow/Home/End (clamped, no wraparound), Enter drills into a message's
 * interior controls, Escape returns. Host-agnostic beyond `getMessages`/`getRenderRoot` and a
 * `[data-message-id]` attribute on each rendered element — doesn't reach into any render-path
 * cache, just queries `getRenderRoot()` directly. `getRenderRoot` is separate from `host` itself
 * since the actual message elements live inside `chx-infinity-scroll`'s own shadow root, not the
 * host's (`chx-message-list`) — rendering is delegated there, this controller isn't. For the same
 * reason, `host.requestUpdate()` alone repaints nothing: `chx-infinity-scroll` only re-renders when
 * one of its own bound properties changes by reference, and none do when only tabIndex/actionable
 * state changes here — `requestRerender` is the host's own way of forcing that child to re-render.
 * @implements {ReactiveController}
 */
export class FocusBehaviorController {
  static #INTERIOR_FOCUSABLE_SELECTOR = "button, a[href], input, select, textarea, [tabindex]";

  #getMessages;
  #getRenderRoot;
  #scrollToIndex;
  #requestRerender;
  /** @type {string | null} */
  #focusedId = null; // the single roving tab stop
  /** @type {string | null} */
  #actionableId = null; // which message is currently "drilled into"
  /** @type {string | null} */
  #pendingFocusId = null; // target of moveFocusTo() not yet mounted — resolved in #pollForMount()
  // Memoizes the id->index lookup keyed by array *reference* — messages.findIndex() on every
  // Arrow/Home/End keypress is O(n) per keystroke; rebuilding only when the reference actually
  // changes (a new `messages` array, not just repeated navigation over the same one) keeps rapid
  // keyboard navigation O(1) per keystroke instead.
  /** @type {{messages: import("../types/message.js").ChxMessage[], index: Map<string, number>} | undefined} */
  #indexCache;

  /**
   * @param {ReactiveControllerHost & import("lit").LitElement} host
   * @param {{
   *   getMessages: () => import("../types/message.js").ChxMessage[],
   *   getRenderRoot: () => DocumentFragment | Element | undefined,
   *   scrollToIndex: (index: number) => void,
   *   requestRerender: () => void,
   * }} options
   */
  constructor(host, { getMessages, getRenderRoot, scrollToIndex, requestRerender }) {
    this.#getMessages = getMessages;
    this.#getRenderRoot = getRenderRoot;
    this.#scrollToIndex = scrollToIndex;
    this.#requestRerender = requestRerender;
    host.addController(this);
  }

  /**
   * Seeds the first-ever rendered message as the roving tab stop — without one, Tab from outside
   * the list has nowhere to land. Called from the host's own render path, once per message.
   * @param {string} id
   */
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

  /** @returns {Map<string, number>} */
  #getIndexById() {
    const messages = this.#getMessages();
    if (this.#indexCache?.messages !== messages) {
      this.#indexCache = { messages, index: new Map(messages.map((m, i) => [m.id, i])) };
    }
    return this.#indexCache.index;
  }

  /**
   * Wires tabIndex/actionable/interior-tabbing onto a freshly rendered message element — called
   * once per message from the host's own render path, right after `ensureSeeded`.
   * @param {string} id
   * @param {HTMLElement & {tabIndex: number, actionable: boolean}} el
   */
  applyToElement(id, el) {
    el.tabIndex = this.isFocused(id) ? 0 : -1;
    el.actionable = this.isActionable(id);
    el.dataset.messageId = id;
    if (el.actionable) this.#restoreInteriorTabbing(el);
    else this.#suppressInteriorTabbing(el);
  }

  /**
   * Hides a not-currently-drilled-into message's interior controls from the Tab order — only the
   * roving article itself (or, once drilled in, its interior) should ever be reachable by Tab.
   * Only reaches light-DOM descendants — a part with its own interactive shadow-DOM content is
   * responsible for suppressing its own tabindex.
   * @param {HTMLElement} messageElement
   */
  #suppressInteriorTabbing(messageElement) {
    for (const el of messageElement.querySelectorAll(FocusBehaviorController.#INTERIOR_FOCUSABLE_SELECTOR)) {
      if (el.hasAttribute("data-roving-hidden-tabindex")) continue; // already suppressed
      el.setAttribute("data-roving-hidden-tabindex", el.getAttribute("tabindex") ?? "");
      el.setAttribute("tabindex", "-1");
    }
  }

  /** @param {HTMLElement} messageElement */
  #restoreInteriorTabbing(messageElement) {
    for (const el of messageElement.querySelectorAll("[data-roving-hidden-tabindex]")) {
      const original = el.getAttribute("data-roving-hidden-tabindex");
      el.removeAttribute("data-roving-hidden-tabindex");
      if (original) el.setAttribute("tabindex", original);
      else el.removeAttribute("tabindex");
    }
  }

  /**
   * Delegated on the host's own scroller element (one listener for the whole list, not one pair
   * per rendered message) — bind this in the host's template, e.g. `@keydown=${controller.handleKeyDown}`.
   * `role="article"` is what `closest()` queries for, so this assumes whatever renders a message
   * (the built-in element or a custom `messageElement`) keeps that role and a `data-message-id`
   * attribute — one that omits either silently drops out of roving focus, no error.
   * @param {KeyboardEvent} event
   */
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

    const messages = this.#getMessages();
    const index = this.#getIndexById().get(id) ?? -1;
    const targetIndex =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : messages.length - 1;
    this.#moveFocusTo(Math.max(0, Math.min(targetIndex, messages.length - 1))); // clamped, no
    //   wraparound — deliberately diverges from chx-command-picker's own wrapping arrow
    //   navigation, a message list and a transient completion popup are different patterns
    event.preventDefault();
  };

  /**
   * Any focus landing inside a message (mouse click or programmatic) claims the roving tab stop,
   * independent of how it got there. Bind as `@focusin=${controller.handleFocusIn}`.
   * @param {FocusEvent} event
   */
  handleFocusIn = (event) => {
    const message = /** @type {HTMLElement} */ (event.target).closest("[role='article']");
    const id = /** @type {HTMLElement | null} */ (message)?.dataset.messageId;
    if (!id || id === this.#focusedId) return;
    this.#claimFocus(id);
  };

  /** @param {string} id */
  #claimFocus(id) {
    this.#focusedId = id;
    this.#requestRerender(); // repaints old tabIndex=-1 / new tabIndex=0 via applyToElement
  }

  /** @param {number} index */
  #moveFocusTo(index) {
    const target = this.#getMessages()[index];
    if (!target) return;
    this.#focusedId = target.id;
    this.#requestRerender(); // repaints old tabIndex=-1 / new tabIndex=0 via applyToElement

    const existing = this.#getRenderRoot()?.querySelector(`[data-message-id="${target.id}"]`);
    if (existing instanceof HTMLElement && existing.isConnected) {
      existing.focus(); // already mounted (no virtualization, or still in the overscan window)
      return;
    }
    this.#pendingFocusId = target.id; // not mounted yet — resolved in #pollForMount(), below
    this.#scrollToIndex(index);
    this.#pollForMount();
  }

  /**
   * `scrollToIndex()` settles over several of `chx-infinity-scroll`'s *own* internal render passes
   * (driven by its virtualizer, not by this controller's host) — none of which cascade back up to
   * re-trigger this host's own `hostUpdated()`, so polling from there would only ever get one shot
   * at a target that isn't mounted yet. Runs its own short-lived rAF loop instead, fully decoupled
   * from either component's update cycle; capped so a target that never mounts (e.g. the host
   * disconnects mid-scroll) can't poll forever.
   * @param {number} [attempt]
   */
  #pollForMount(attempt = 0) {
    if (!this.#pendingFocusId || attempt >= 30) {
      this.#pendingFocusId = null;
      return;
    }
    const el = this.#getRenderRoot()?.querySelector(`[data-message-id="${this.#pendingFocusId}"]`);
    if (el instanceof HTMLElement && el.isConnected) {
      el.focus();
      this.#pendingFocusId = null;
      return;
    }
    requestAnimationFrame(() => this.#pollForMount(attempt + 1));
  }

  /**
   * @param {string} id
   * @param {HTMLElement} messageElement
   */
  #drillInto(id, messageElement) {
    this.#actionableId = id;
    this.#requestRerender();
    this.#restoreInteriorTabbing(messageElement);
    const first = /** @type {HTMLElement | null} */ (
      messageElement.querySelector(FocusBehaviorController.#INTERIOR_FOCUSABLE_SELECTOR)
    );
    first?.focus();
  }

  #exitDrillIn() {
    const el = this.#actionableId
      ? this.#getRenderRoot()?.querySelector(`[data-message-id="${this.#actionableId}"]`)
      : undefined;
    if (el instanceof HTMLElement) this.#suppressInteriorTabbing(el);
    this.#actionableId = null;
    this.#requestRerender();
    if (el instanceof HTMLElement) el.focus(); // back to the article itself
  }

  /**
   * A custom element can disconnect and reconnect without being reconstructed (moved in the DOM,
   * visibility toggled via detach instead of `display:none`, etc.) — `#pendingFocusId` pointing at
   * a `moveFocusTo()` target from before the disconnect is stale by the time the host is back;
   * nothing should try to focus it once reconnected.
   */
  hostConnected() {
    this.#pendingFocusId = null;
  }
}
