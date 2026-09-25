import { nothing } from "lit";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxDivider } from "../divider/divider.js" */

/** Rough px a date divider adds to a row's pre-measurement estimate — the divider folds into the row. */
const DIVIDER_ESTIMATE = 40;

/**
 * Owns date-divider insertion for `chx-message-list`: the slotted `<chx-divider>` config carrier, the
 * per-message-id element cache (so a divider isn't re-created on every scroll re-render), and the
 * predicate/build/estimate the list calls per row. Constructed with one narrow callback, no host
 * reference — same shape `ReadTrackingController` uses, testable in isolation. Action dividers are not
 * this controller's concern (they ride the ordinary `partElements` path — see `dividers.md`).
 */
export class DividerController {
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** The slotted `<chx-divider slot="divider">`, or undefined when none is provided. @type {ChxDivider | undefined} */
  #element;
  /** @type {Map<string, HTMLElement>} message id → its built divider element */
  #cache = new Map();

  /** @param {{getMessages: () => ChxMessage[]}} config */
  constructor(config) {
    this.#getMessages = config.getMessages;
  }

  /** The config carrier, or undefined. @returns {ChxDivider | undefined} */
  get element() {
    return this.#element;
  }

  /** Whether the pinned top label is enabled — the carrier's `sticky`, or false when none slotted. */
  get sticky() {
    return this.#element?.sticky ?? false;
  }

  /** Formatted label for the message at the top of the viewport, or "" when disabled/out of range.
   * @param {ChxMessage[]} messages @param {number} topIndex */
  stickyLabel(messages, topIndex) {
    if (!this.sticky) return "";
    const message = messages[topIndex];
    return message ? (this.#element?.formatDate(message.createdAt) ?? "") : "";
  }

  /** The divider-bearing (first-of-day) message index at or above `topIndex` — the inline divider the
   * sticky label points at, for click-to-scroll. -1 when none. @param {ChxMessage[]} messages @param {number} topIndex */
  stickyTargetIndex(messages, topIndex) {
    if (!this.sticky || topIndex < 0) return -1;
    for (let i = topIndex; i >= 0; i--) {
      if (this.shouldShow(messages[i], i)) return i;
    }
    return -1;
  }

  /** The currently-mounted cached inline dividers (skips ones virtualized out of the DOM). */
  *#connectedDividers() {
    for (const element of this.#cache.values()) {
      if (element.isConnected) yield element;
    }
  }

  /** Smallest gap (px) from `pin` (viewport Y) down to the next inline divider below it — the boundary
   * approaching from below, driving the push-out. Infinity when none. @param {number} pin */
  distanceToNextDivider(pin) {
    let min = Infinity;
    for (const element of this.#connectedDividers()) {
      const offset = element.getBoundingClientRect().top - pin;
      if (offset > 1 && offset < min) min = offset;
    }
    return min;
  }

  /** Hides the inline divider(s) whose box vertically overlaps `band` (the sticky label sitting on top
   * of them), shows the rest; `band` null restores all. `visibility` (not `display`) so the row keeps
   * its height and messages don't jump. @param {{top: number, bottom: number} | null} band */
  occlude(band) {
    for (const element of this.#connectedDividers()) {
      let hidden = false;
      if (band) {
        const rect = element.getBoundingClientRect();
        hidden = rect.bottom > band.top && rect.top < band.bottom;
      }
      element.style.visibility = hidden ? "hidden" : "";
    }
  }

  /** Swaps the config carrier (a new one slotted, or removed) and drops cached elements built by the old one.
   * @param {ChxDivider | undefined} element */
  setElement(element) {
    this.#element = element;
    this.#cache.clear();
  }

  /** Whether a date divider is due above `message`. No carrier slotted → never.
   * @param {ChxMessage} message @param {number} index */
  shouldShow(message, index) {
    if (!this.#element) return false;
    const previousDate = index > 0 ? this.#getMessages()[index - 1]?.createdAt : undefined;
    return this.#element.shouldShowDivider({
      date: message.createdAt,
      message,
      previousDate,
      index,
    });
  }

  /** Extra height a due divider contributes to the row estimate.
   * @param {ChxMessage} message @param {number} index */
  estimateExtra(message, index) {
    return this.shouldShow(message, index) ? DIVIDER_ESTIMATE : 0;
  }

  /**
   * The row's content, always a `[divider, message]` pair — `nothing` in the first slot when no
   * divider is due. The fixed shape matters: returning a bare value some renders and an array on
   * others makes Lit tear the ChildPart down and rebuild it, which would throw away the row's
   * `<chx-message>` every time a date boundary appears or disappears.
   * @param {unknown} row @param {ChxMessage} message @param {number} index
   * @returns {unknown[]}
   */
  wrap(row, message, index) {
    return [this.shouldShow(message, index) ? this.#build(message, index) : nothing, row];
  }

  /** Evicts cached dividers for message ids that didn't render this pass — same rendered-id set
   * `chx-message-list` already collects for its own message/part cache sweep. @param {Set<string>} renderedMessageIds */
  sweep(renderedMessageIds) {
    for (const id of this.#cache.keys()) {
      if (!renderedMessageIds.has(id)) this.#cache.delete(id);
    }
  }

  /** @param {ChxMessage} message @param {number} index @returns {HTMLElement} */
  #build(message, index) {
    const cached = this.#cache.get(message.id);
    if (cached) return cached;
    const divider = /** @type {ChxDivider} */ (this.#element);
    const element = divider.buildDivider(divider.formatDate(message.createdAt), { message, index });
    this.#cache.set(message.id, element);
    return element;
  }
}
