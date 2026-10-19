import { distanceToBottom } from "../../utils/dom.js";

/** px from the true bottom where an upward scroll still doesn't leave it (rubber-band, rounding). */
export const VERY_BOTTOM = 8;

/**
 * Whether the view is "at the bottom" for following, latched from scroll events. Direction-aware:
 * the first pixels of a user's upward scroll leave it even inside `buffer`, and only moving closer
 * within `buffer` rejoins. Both tests also need the distance to change, so scrollTop moving with
 * the content (a prepend's or a shrinking row's compensation) is never read as either.
 */
export class BottomLatch {
  atBottom = true;
  #lastTop = 0;
  #lastDistance = 0;
  #lastHeight = 0;

  /**
   * From a scroll event. Returns whether this scroll left the bottom.
   * @param {Element} el @param {number} buffer
   * @param {{layoutJumps?: boolean, contentChanged?: boolean}} [layout] with `layoutJumps`, an upward
   *   jump that comes with resized or `contentChanged` content is layout's: a transient shrink
   *   clamped scrollTop, which WebKit, lacking scroll anchoring, never restores. The caller leaves
   *   it off when virtualized (rows measure on every upward scroll) and after a user gesture.
   */
  update(el, buffer, { layoutJumps = false, contentChanged = false } = {}) {
    const top = el.scrollTop;
    const distance = distanceToBottom(el);
    const resized = Math.abs(el.scrollHeight - this.#lastHeight) > 0.5;
    const left =
      top < this.#lastTop - 0.5 &&
      distance > this.#lastDistance + 0.5 &&
      distance > VERY_BOTTOM &&
      !(layoutJumps && (resized || contentChanged));
    const closer = distance < this.#lastDistance - 0.5;
    this.#lastTop = top;
    this.#lastDistance = distance;
    this.#lastHeight = el.scrollHeight;
    if (left) this.atBottom = false;
    else if (closer && distance <= buffer) this.atBottom = true;
    return left;
  }

  /** Re-reads the position without judging it — after layout moved it with no scroll event. @param {Element} el */
  baseline(el) {
    this.#lastTop = el.scrollTop;
    this.#lastHeight = el.scrollHeight;
    this.#lastDistance = distanceToBottom(el);
  }
}
