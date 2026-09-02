const RESET_MS = 500;

/**
 * Buffers typed characters and jumps focus to the next visible node whose label starts with the
 * buffer, cycling from the node after the current focus — the Windows File Explorer behavior
 * called out directly in the spec. Independent of `KeyboardNavController`'s arrow-key handling.
 */
export class TypeaheadController {
  #buffer = "";
  /** @type {ReturnType<typeof setTimeout> | null} */
  #timer = null;

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./roving-focus-controller.js").RovingFocusController} focus
   */
  constructor(host, focus) {
    this.host = host;
    this.focus = focus;
  }

  /**
   * @param {KeyboardEvent} event
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} currentItem
   * @returns {boolean} whether the event was a typeahead character (caller should stop further handling)
   */
  onKeydown(event, currentItem) {
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return false;

    if (this.#timer) clearTimeout(this.#timer);
    this.#buffer += event.key.toLowerCase();
    this.#timer = setTimeout(() => {
      this.#buffer = "";
    }, RESET_MS);

    const visible = [...this.host.visibleItems()];
    const startIndex = Math.max(visible.indexOf(currentItem), 0);
    const ordered = [...visible.slice(startIndex + 1), ...visible.slice(0, startIndex + 1)];
    const match = ordered.find((item) => item.label.toLowerCase().startsWith(this.#buffer));
    if (match) this.focus.focusNode(match);
    return true;
  }
}
