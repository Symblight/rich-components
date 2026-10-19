/** px left to scroll before `el` rests at its bottom. @param {Element} el */
export function distanceToBottom(el) {
  return el.scrollHeight - el.clientHeight - el.scrollTop;
}

/**
 * Calls `find` now and then once per animation frame until it returns something, up to `maxFrames`
 * checks — for content that mounts on a render cycle the caller doesn't own.
 * @template T
 * @param {() => T | null | undefined} find
 * @param {number} [maxFrames]
 * @returns {Promise<T | undefined>}
 */
export async function pollFrames(find, maxFrames = 30) {
  for (let frame = 0; frame < maxFrames; frame++) {
    const found = find();
    if (found) return found;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return undefined;
}

/**
 * Whether `event`, heard on `scroller`, can start a user scroll of it. Excluded: a horizontal wheel
 * or a pinch (`ctrlKey`), and a press on content — only one on the scroller itself (its scrollbar).
 * @param {Event} event @param {Element | undefined} scroller
 */
export function isScrollGesture(event, scroller) {
  if (event.type === "wheel") {
    const { deltaY, ctrlKey } = /** @type {WheelEvent} */ (event);
    return Boolean(deltaY) && !ctrlKey;
  }
  if (event.type === "pointerdown") return event.target === scroller;
  return true;
}
