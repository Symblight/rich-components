/** `window.getSelection()` doesn't see into a shadow root; `container`'s own root does.
 * @param {HTMLElement} container
 * @returns {Selection | null} */
function getSelectionFor(container) {
  const root = container.getRootNode();
  if (root instanceof ShadowRoot && typeof (/** @type {any} */ (root).getSelection) === "function") {
    return /** @type {any} */ (root).getSelection();
  }
  return window.getSelection();
}

/** Caret position as a plain character offset — survives a full content replacement, a Range doesn't.
 * @param {HTMLElement} container
 * @returns {number} */
export function getCaretOffset(container) {
  const selection = getSelectionFor(container);
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer)) return 0;

  const preRange = range.cloneRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

/** True when the caret is a plain collapsed position inside `container`, not a range selection.
 * @param {HTMLElement} container
 * @returns {boolean} */
export function isCaretCollapsed(container) {
  const selection = getSelectionFor(container);
  if (!selection || selection.rangeCount === 0) return true;
  return selection.getRangeAt(0).collapsed;
}

/** Inverse of {@link getCaretOffset}. Clamps to the end if `offset` overshoots.
 * @param {HTMLElement} container
 * @param {number} offset */
export function setCaretOffset(container, offset) {
  const selection = getSelectionFor(container);
  if (!selection) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  /** @type {Text | null} */
  let lastNode = null;
  /** @type {Text | null} */
  let node = /** @type {Text | null} */ (walker.nextNode());
  while (node) {
    if (remaining <= node.length) {
      placeCaret(selection, node, remaining);
      return;
    }
    remaining -= node.length;
    lastNode = node;
    node = /** @type {Text | null} */ (walker.nextNode());
  }
  if (lastNode) placeCaret(selection, lastNode, lastNode.length);
}

/** @param {Selection} selection @param {Text} node @param {number} offset */
function placeCaret(selection, node, offset) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
