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
