/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxInfinityScroll } from "../../components/infinity-scroll/infinity-scroll.js" */
/** @import { DividerController } from "./DividerController.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & import("lit").LitElement} Host
 * @typedef {{
 *   dividerController: DividerController,
 *   getMessages: () => ChxMessage[],
 *   getInfinityScrollElement: () => ChxInfinityScroll | undefined,
 *   getAwayFromBottom: () => boolean,
 * }} StickyConfig
 */

/** ms of scroll-idle after which the label fades out */
const HIDE_DELAY = 1500;
/** fallback px past the divider on click, before the label has been laid out */
const CLICK_OFFSET = 48;

/**
 * The floating "stuck section date" label over the virtualized rows. `position: sticky` can't work
 * inside absolutely-positioned/transformed rows, so the stuck/push-out/occlusion is emulated here,
 * reading section boundaries from the list's `DividerController`.
 * @implements {ReactiveController}
 */
export class StickyController {
  /** @type {Host} */
  #host;
  /** @type {StickyConfig} */
  #config;

  /** @type {HTMLElement | undefined} */
  #scroller;
  #labelText = "";
  /** scrolling recently and has a label — drives the fade */
  #visible = false;
  /** scrolled recently (away from bottom), cleared after `HIDE_DELAY` */
  #active = false;
  #hideTimer = 0;
  /** push-out offset (px, ≤ 0) as the next section's divider displaces the label */
  #translateY = 0;
  /** resting pin (viewport Y), sampled only while un-pushed @type {number | undefined} */
  #pin;
  /** topmost visible row index — a click derives the day's divider from it */
  #topIndex = -1;
  /** @type {HTMLElement | undefined} */
  #button;
  #raf = 0;

  /** @param {Host} host @param {StickyConfig} config */
  constructor(host, config) {
    this.#host = host;
    this.#config = config;
    host.addController(this);
  }

  /** "" when hidden/disabled — gates the host's `when()`. */
  get labelText() {
    return this.#labelText;
  }

  get visible() {
    return this.#visible;
  }

  /** The label button, from a `ref()`. This controller owns its `transform` (no `style=` binding).
   *  @param {HTMLElement | undefined} el */
  setButton(el) {
    this.#button = el;
    if (el) el.style.transform = `translateY(${this.#translateY}px)`;
  }

  /** Lands on the day's first message — one divider-height past its divider. */
  handleClick = () => {
    const infinity = this.#config.getInfinityScrollElement();
    if (!infinity || this.#topIndex < 0) return;
    const targetIndex = this.#dividerIndexAtOrAbove(this.#topIndex);
    if (targetIndex < 0) return;
    // scrollToOffset in one pass — scrollToIndex + a nudge gets wiped by the measurement re-scroll
    const offset = infinity.getOffsetForIndex(targetIndex, "start");
    if (offset == null) return;
    const dividerHeight = this.#button?.getBoundingClientRect().height || CLICK_OFFSET;
    const gap = this.#scroller
      ? parseFloat(getComputedStyle(this.#scroller).paddingBlockStart) || 0
      : 0;
    infinity.scrollToOffset(offset + dividerHeight + gap);
  };

  /** @param {boolean} away */
  handleAwayFromBottomChange(away) {
    if (!away) this.#deactivate();
  }

  /** (Re)attaches the scroll listener as `sticky` toggles or the scroller remounts. Call from `updated()`. */
  sync() {
    const scroller = this.#config.dividerController.sticky
      ? /** @type {HTMLElement | null} */ (
          this.#config
            .getInfinityScrollElement()
            ?.renderRoot?.querySelector(".infinity-scroll__scroller") ?? null
        )
      : null;
    if (scroller === (this.#scroller ?? null)) return;
    this.#scroller?.removeEventListener("scroll", this.#handleScroll);
    this.#scroller = scroller ?? undefined;
    this.#pin = undefined;
    if (scroller) {
      scroller.addEventListener("scroll", this.#handleScroll, { passive: true });
      this.#update();
    } else {
      this.#reset();
    }
  }

  /** Rows can move under a stationary offset. Call from `updated()` when `messages` changes. */
  notifyMessagesChanged() {
    if (this.#scroller) this.#update();
  }

  hostDisconnected() {
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#reset();
    this.#scroller?.removeEventListener("scroll", this.#handleScroll);
    this.#scroller = undefined;
  }

  #handleScroll = () => {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      this.#activate();
      this.#update();
    });
  };

  #clearHideTimer() {
    if (this.#hideTimer) clearTimeout(this.#hideTimer);
    this.#hideTimer = 0;
  }

  /** Gated on away-from-bottom, so auto/stick-to-bottom scrolls never flash the label. */
  #activate() {
    if (!this.#config.getAwayFromBottom()) return;
    this.#clearHideTimer();
    this.#hideTimer = window.setTimeout(() => {
      this.#hideTimer = 0;
      this.#active = false;
      this.#update();
    }, HIDE_DELAY);
    this.#active = true;
  }

  #deactivate() {
    this.#clearHideTimer();
    if (!this.#active) return;
    this.#active = false;
    this.#update();
  }

  /**
   * One scroll-driven pass: shown only by scroll activity (no blink at a boundary); the next divider
   * pushes the label up and swaps its date as it crosses; the inline divider under it is occluded.
   */
  #update() {
    const scroller = this.#scroller;
    if (!scroller) return;

    const buttonRect = this.#button?.getBoundingClientRect();
    const height = buttonRect?.height ?? 0;
    const pin = this.#resolvePin(scroller, buttonRect);

    const topIndex = this.#topVisibleIndex(pin);
    const label = this.#labelFor(topIndex);
    const visible = this.#active && label !== "";

    const distance = this.#distanceToNextDivider(pin);
    const translateY = visible && height > 0 && distance < height ? distance - height : 0;

    const bandTop = pin + translateY;
    this.#occlude(visible ? { top: bandTop, bottom: bandTop + height } : null);

    this.#topIndex = topIndex;
    this.#translateY = translateY;
    const changed = label !== this.#labelText || visible !== this.#visible;
    this.#labelText = label;
    this.#visible = visible;
    // translateY changes every frame → imperative; text/visibility only on an edge → Lit re-render
    if (this.#button) this.#button.style.transform = `translateY(${translateY}px)`;
    if (changed) this.#host.requestUpdate();
  }

  /** Sampled only un-pushed, where the button's top IS the pin — subtracting translateY jitters ±1px.
   *  @param {HTMLElement} scroller @param {DOMRect | undefined} buttonRect */
  #resolvePin(scroller, buttonRect) {
    if (buttonRect && this.#translateY === 0) this.#pin = buttonRect.top;
    return this.#pin ?? scroller.getBoundingClientRect().top;
  }

  #reset() {
    this.#occlude(null);
    this.#translateY = 0;
    this.#pin = undefined;
    this.#clearHideTimer();
    this.#active = false;
    if (!this.#visible && !this.#labelText) return;
    this.#visible = false;
    this.#labelText = "";
    this.#host.requestUpdate();
  }

  /** Nearest row to the pin — the same pin the push uses, so the date swaps exactly when the push resets.
   *  @param {number} pin */
  #topVisibleIndex(pin) {
    const rows = this.#config
      .getInfinityScrollElement()
      ?.renderRoot?.querySelectorAll(".infinity-scroll__canvas > .infinity-scroll__row");
    if (!this.#scroller || !rows) return -1;
    let bestIndex = -1;
    let bestTop = Infinity;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom <= pin) continue;
      if (rect.top < bestTop) {
        bestTop = rect.top;
        bestIndex = Number(/** @type {HTMLElement} */ (row).dataset.index);
      }
    }
    return bestIndex;
  }

  /** @param {number} topIndex */
  #labelFor(topIndex) {
    const divider = this.#config.dividerController;
    if (!divider.sticky) return "";
    const message = this.#config.getMessages()[topIndex];
    return message ? (divider.element?.formatDate(message.createdAt) ?? "") : "";
  }

  /** First-of-day row at or above `topIndex`, or -1. @param {number} topIndex */
  #dividerIndexAtOrAbove(topIndex) {
    const divider = this.#config.dividerController;
    if (!divider.sticky || topIndex < 0) return -1;
    const messages = this.#config.getMessages();
    for (let i = topIndex; i >= 0; i--) {
      if (divider.shouldShow(messages[i], i)) return i;
    }
    return -1;
  }

  /** Gap (px) from `pin` down to the next inline divider; Infinity when none. @param {number} pin */
  #distanceToNextDivider(pin) {
    let min = Infinity;
    for (const element of this.#config.dividerController.connectedDividers()) {
      const offset = element.getBoundingClientRect().top - pin;
      if (offset > 1 && offset < min) min = offset;
    }
    return min;
  }

  /** Hides inline dividers under `band` (`visibility`, so rows keep their height); null restores all.
   *  @param {{top: number, bottom: number} | null} band */
  #occlude(band) {
    for (const element of this.#config.dividerController.connectedDividers()) {
      let hidden = false;
      if (band) {
        const rect = element.getBoundingClientRect();
        hidden = rect.bottom > band.top && rect.top < band.bottom;
      }
      element.style.visibility = hidden ? "hidden" : "";
    }
  }
}
