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

  /**
   * From a scroll event. Returns whether this scroll left the bottom.
   * @param {Element} el @param {number} buffer
   * @param {{layoutJumps?: boolean, held?: boolean}} [layout] with `held` (a button down on the
   *   content) no jump leaves: the click focusing a row scrolls it into view, and the release
   *   decides. With `layoutJumps`, no upward jump leaves: with no gesture behind it, it's a
   *   transient shrink that clamped scrollTop, which WebKit, lacking scroll anchoring, never
   *   restores. A row's own shadow DOM can shrink and regrow to the same height (streamed markdown
   *   re-rendering its last blocks), so neither a height change nor a mutation tells it apart. The
   *   caller leaves it off when virtualized (rows measure on every upward scroll) and after a gesture.
   */
  update(el, buffer, { layoutJumps = false, held = false } = {}) {
    const top = el.scrollTop;
    const distance = distanceToBottom(el);
    const left =
      top < this.#lastTop - 0.5 &&
      distance > this.#lastDistance + 0.5 &&
      distance > VERY_BOTTOM &&
      !held &&
      !layoutJumps;
    const closer = distance < this.#lastDistance - 0.5;
    this.#lastTop = top;
    this.#lastDistance = distance;
    if (left) this.atBottom = false;
    else if (closer && distance <= buffer) this.atBottom = true;
    return left;
  }

  /** Re-reads the position without judging it — after layout moved it with no scroll event. @param {Element} el */
  baseline(el) {
    this.#lastTop = el.scrollTop;
    this.#lastDistance = distanceToBottom(el);
  }
}
