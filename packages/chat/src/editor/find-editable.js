/** Recursively finds the first contenteditable element in `root`'s subtree, crossing shadow roots.
 * @param {Element | ShadowRoot} root
 * @returns {HTMLElement | null} */
export function findEditableDescendant(root) {
  if (root instanceof HTMLElement && root.isContentEditable) return root;
  if (/** @type {any} */ (root).shadowRoot) {
    const found = findEditableDescendant(/** @type {any} */ (root).shadowRoot);
    if (found) return found;
  }
  for (const child of root.children) {
    const found = findEditableDescendant(child);
    if (found) return found;
  }
  return null;
}

/** `window.getSelection()` doesn't see into a shadow root; `element`'s own root does.
 * @param {HTMLElement} element
 * @returns {Selection | null} */
function getSelectionFor(element) {
  const root = element.getRootNode();
  if (
    root instanceof ShadowRoot &&
    typeof (/** @type {any} */ (root).getSelection) === "function"
  ) {
    return /** @type {any} */ (root).getSelection();
  }
  return window.getSelection();
}

/** Focuses `element` and collapses its selection to the very start or end of its content.
 * @param {HTMLElement} element
 * @param {"start" | "end"} edge */
export function focusEditableEdge(element, edge) {
  element.focus();
  const selection = getSelectionFor(element);
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(edge === "start");
  selection.removeAllRanges();
  selection.addRange(range);
}
