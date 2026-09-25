/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxInfinityScroll } from "../../components/infinity-scroll/infinity-scroll.js" */
/** @import { DividerController } from "./DividerController.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/** ms of scroll-idle after which the sticky date label fades back out */
const HIDE_DELAY = 1500;

/** fallback px past the divider on click when the label hasn't been laid out yet (its own height is used) */
const CLICK_OFFSET = 48;

/**
 * Owns the floating "stuck section date" label above `chx-message-list`'s virtualized rows: attaching/
 * detaching the scroll listener on `chx-infinity-scroll`'s scroller as `chx-divider`'s `sticky` toggles,
 * the scroll-idle show/hide timing, and the per-frame stuck/push-out/occlusion math (`position: sticky`
 * can't work inside the virtualizer's absolutely-positioned/transformed rows, so this emulates it by hand). Reads
 * section boundaries through the host's own `DividerController` instance rather than owning any divider
 * state itself. Same host-bound `ReactiveController` shape `FocusBehaviorController` uses.
 * @implements {ReactiveController}
 */
export class StickyController {
  /** @type {ReactiveControllerHost & import("lit").LitElement} */
  #host;
  /** @type {DividerController} */
  #dividerController;
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** @type {() => ChxInfinityScroll | undefined} */
  #getInfinityScrollElement;
  /** @type {() => boolean} */
  #getAwayFromBottom;

  /** chx-infinity-scroll's scroller, once the label is listening to it. @type {HTMLElement | undefined} */
  #scroller;
  #labelText = "";
  /** Shown right now (scrolling-active AND has a label) — drives the opacity fade. @type {boolean} */
  #visible = false;
  /** Scrolling recently — set on scroll (away from bottom), cleared after `HIDE_DELAY` idle. @type {boolean} */
  #active = false;
  /** @type {number} */
  #hideTimer = 0;
  /** Push-out offset (px, ≤ 0) applied as the next section's divider displaces the stuck label. @type {number} */
  #translateY = 0;
  /** Cached resting pin (viewport Y) — sampled only while un-pushed, reused during push. @type {number | undefined} */
  #pin;
  /** Topmost visible row index (pin-relative) — a click derives the day's divider from it. @type {number} */
  #topIndex = -1;
  /** The floating label button, slotted into chx-infinity-scroll's `sticky` slot. @type {HTMLElement | undefined} */
  #button;
  /** @type {number} */
  #raf = 0;

  /**
   * @param {ReactiveControllerHost & import("lit").LitElement} host
   * @param {{
   *   dividerController: DividerController,
   *   getMessages: () => ChxMessage[],
   *   getInfinityScrollElement: () => ChxInfinityScroll | undefined,
   *   getAwayFromBottom: () => boolean,
   * }} options
   */
  constructor(
    host,
    { dividerController, getMessages, getInfinityScrollElement, getAwayFromBottom },
  ) {
    this.#host = host;
    this.#dividerController = dividerController;
    this.#getMessages = getMessages;
    this.#getInfinityScrollElement = getInfinityScrollElement;
    this.#getAwayFromBottom = getAwayFromBottom;
    host.addController(this);
  }

  /** Visible text of the floating label, or "" when hidden/disabled — gates the host's `when()`. */
  get labelText() {
    return this.#labelText;
  }

  /** Shown right now (scrolling-active AND has a label). */
  get visible() {
    return this.#visible;
  }

  /** Binds the host's rendered label button — call from a Lit `ref()` directive. The controller is the
   * sole owner of the button's `transform` (no Lit `style=` binding), so apply the current push here so a
   * freshly-mounted button starts at the right offset. @param {HTMLElement | undefined} el */
  setButton(el) {
    this.#button = el;
    if (el) el.style.transform = `translateY(${this.#translateY}px)`;
  }

  /** Clicking the floating label lands on the day's content — one divider-height past its divider. */
  handleClick = () => {
    const infinity = this.#getInfinityScrollElement();
    if (!infinity || this.#topIndex < 0) return;
    // Derive the day's divider (first-of-day) row here, not every scroll frame — it's a click-only need.
    const targetIndex = this.#dividerController.stickyTargetIndex(
      this.#getMessages(),
      this.#topIndex,
    );
    if (targetIndex < 0) return;
    // Pre-compute the divider's start offset and scroll one divider-height past it in one pass — so the
    // day's first message lands at the top, not the divider. The label (`#button`) is the same
    // `chx-divider`, so its measured height is the divider's height. `scrollToOffset` (not
    // `scrollToIndex` + a nudge) avoids the tanstack measurement-driven re-scroll that would wipe the
    // nudge; the offset is an estimate for an unmeasured target, fine here (no correction pass by design).
    const offset = infinity.getOffsetForIndex(targetIndex, "start");
    if (offset == null) return;
    const dividerHeight = this.#button?.getBoundingClientRect().height || CLICK_OFFSET;
    // top breathing gap = the scroller's own top padding, so the first message clears the edge without a
    // magic constant (tracks the list's own spacing).
    const gap = this.#scroller
      ? parseFloat(getComputedStyle(this.#scroller).paddingBlockStart) || 0
      : 0;
    infinity.scrollToOffset(offset + dividerHeight + gap);
  };

  /** Host's own `onAwayFromBottomChange` — drops the label immediately once back at the bottom.
   * @param {boolean} away */
  handleAwayFromBottomChange(away) {
    if (!away) this.#deactivate();
  }

  /** Attaches/detaches the scroll listener on chx-infinity-scroll's scroller as `sticky` toggles or
   * the scroller (re)mounts; recomputes once on each (re)attach, clears the label on detach. Call from
   * the host's own `updated()`, every render pass. */
  sync() {
    const scroller = this.#dividerController.sticky
      ? /** @type {HTMLElement | null} */ (
          this.#getInfinityScrollElement()?.renderRoot?.querySelector(
            ".infinity-scroll__scroller",
          ) ?? null
        )
      : null;
    if (scroller === (this.#scroller ?? null)) return;
    this.#scroller?.removeEventListener("scroll", this.#handleScroll);
    this.#scroller = scroller ?? undefined;
    this.#pin = undefined; // scroller (re)mounted — the resting pin must be re-sampled
    if (scroller) {
      scroller.addEventListener("scroll", this.#handleScroll, { passive: true });
      this.#update(); // pin the current section's label up front, no scroll needed
    } else {
      this.#reset();
    }
  }

  /** A data change moves rows under a stationary scroll offset, so the pinned date can change with no
   * scroll — call from the host's own `updated()` when `messages` changes. */
  notifyMessagesChanged() {
    if (this.#scroller) this.#update();
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

  /** Reveals the label on scroll and (re)arms the idle timer that fades it back out. Gated on
   *  `getAwayFromBottom()` so the initial auto-scroll-to-bottom / stick-to-bottom follows (which fire
   *  real scroll events) never flash it — only a genuine scroll up through history does. */
  #activate() {
    if (!this.#getAwayFromBottom()) return;
    this.#clearHideTimer();
    this.#hideTimer = window.setTimeout(() => {
      this.#hideTimer = 0;
      this.#active = false;
      this.#update();
    }, HIDE_DELAY);
    this.#active = true;
  }

  /** Hides the label immediately and cancels the idle timer (back-at-bottom / detach). */
  #deactivate() {
    this.#clearHideTimer();
    if (!this.#active) return;
    this.#active = false;
    this.#update();
  }

  /**
   * One scroll-position-driven pass emulating a native sticky section header (position:sticky can't work
   * inside the virtualizer's absolutely-positioned/transformed rows):
   * - the label is *shown* purely by scroll activity (`#active`), so the opacity fade fires only on
   *   scroll-start / idle — never at a section boundary (that would blink);
   * - the next section's divider, approaching the pin from below, physically pushes the label up
   *   (`translateY = d - H`), and its date swaps as it crosses (topmost-visible flips) — one label,
   *   swapped not stacked, seamlessly, with no opacity change;
   * - the inline divider directly under the label is occluded so the boundary is never double-visible.
   */
  #update() {
    const scroller = this.#scroller;
    if (!scroller) return;

    const buttonRect = this.#button?.getBoundingClientRect();
    const height = buttonRect?.height ?? 0;
    const pin = this.#resolvePin(scroller, buttonRect);

    const topIndex = this.#topVisibleIndex(pin);
    const label = this.#dividerController.stickyLabel(this.#getMessages(), topIndex);
    const visible = this.#active && label !== "";

    // push-out: the next divider below the pin displaces the label up; its date swaps as it crosses.
    const distance = this.#dividerController.distanceToNextDivider(pin);
    const translateY = visible && height > 0 && distance < height ? distance - height : 0;

    // occlude the inline divider the label currently covers (band follows the pin + push)
    const bandTop = pin + translateY;
    this.#dividerController.occlude(visible ? { top: bandTop, bottom: bandTop + height } : null);

    this.#topIndex = topIndex; // the day's divider is derived from this on click, not every frame
    this.#translateY = translateY;
    const changed = label !== this.#labelText || visible !== this.#visible;
    this.#labelText = label;
    this.#visible = visible;
    // translateY changes every frame → set imperatively (no full re-render); text/visibility change
    // only on a boundary/scroll edge → let Lit re-render those
    if (this.#button) this.#button.style.transform = `translateY(${translateY}px)`;
    if (changed) this.#host.requestUpdate();
  }

  /** The label's real resting pin (viewport Y). Sample from the button only while un-pushed
   * (`translateY === 0`), where `buttonRect.top` IS the pin — no lossy `- translateY` subtraction (jitters
   * ±1px under sub-pixel scroll). Cache and reuse while pushing (the pin is constant in viewport space
   * during a scroll); the scroller border-top is only the pre-layout fallback.
   * @param {HTMLElement} scroller @param {DOMRect | undefined} buttonRect */
  #resolvePin(scroller, buttonRect) {
    if (buttonRect && this.#translateY === 0) this.#pin = buttonRect.top;
    return this.#pin ?? scroller.getBoundingClientRect().top;
  }

  /** Restores every inline divider and drops the label (detach / disconnect / sticky off). */
  #reset() {
    this.#dividerController.occlude(null);
    this.#translateY = 0;
    this.#pin = undefined;
    this.#clearHideTimer();
    this.#active = false;
    if (!this.#visible && !this.#labelText) return;
    this.#visible = false;
    this.#labelText = "";
    this.#host.requestUpdate();
  }

  /** Index of the rendered row nearest the **pin** (not the scroller's border-top). Must use the same
   * `pin` the push/occlusion do, so the date swaps at the exact scroll offset the push resets — else the
   * label snaps onto the pin (push → 0) up to `padding-block` px before the text swaps, flashing the
   * previous date. @param {number} pin */
  #topVisibleIndex(pin) {
    const rows = this.#getInfinityScrollElement()?.renderRoot?.querySelectorAll(
      ".infinity-scroll__canvas > .infinity-scroll__row",
    );
    if (!this.#scroller || !rows) return -1;
    let bestIndex = -1;
    let bestTop = Infinity;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom <= pin) continue; // fully scrolled above the pin
      if (rect.top < bestTop) {
        bestTop = rect.top;
        bestIndex = Number(/** @type {HTMLElement} */ (row).dataset.index);
      }
    }
    return bestIndex;
  }

  /** Mirrors the host's previous `disconnectedCallback` cleanup. */
  hostDisconnected() {
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#reset();
    this.#scroller?.removeEventListener("scroll", this.#handleScroll);
    this.#scroller = undefined;
  }
}
