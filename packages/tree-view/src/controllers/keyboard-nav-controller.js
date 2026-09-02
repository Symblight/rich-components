import { closestTreeItemParent } from "../components/tree-item/tree-item.js";

const DEFAULT_ROW_HEIGHT = 32;

/** Interprets `keydown` per the spec's keyboard table, delegating to the other controllers. */
export class KeyboardNavController {
  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {{
   *   expansion: import("./expansion-controller.js").ExpansionController,
   *   focus: import("./roving-focus-controller.js").RovingFocusController,
   *   selection: import("./selection-controller.js").SelectionController,
   *   typeahead: import("./typeahead-controller.js").TypeaheadController,
   *   open: import("./open-controller.js").OpenController,
   *   reorder: import("./reorder-controller.js").ReorderController,
   * }} controllers
   */
  constructor(host, { expansion, focus, selection, typeahead, open, reorder }) {
    this.host = host;
    this.expansion = expansion;
    this.focus = focus;
    this.selection = selection;
    this.typeahead = typeahead;
    this.open = open;
    this.reorder = reorder;
  }

  /** @param {KeyboardEvent} event */
  onKeydown(event) {
    const target = /** @type {Element} */ (event.target);
    const item = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem | null} */ (
      target?.closest?.("tvx-tree-item")
    );
    if (!item || item.disabled) return;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        // Alt+Arrow reordering, for parity with the drag-and-drop gesture.
        if (event.altKey && this.host.reordering) this.reorder.moveBySibling(item, 1);
        else this.#moveFocus(this.#step(item, 1), event.shiftKey);
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (event.altKey && this.host.reordering) this.reorder.moveBySibling(item, -1);
        else this.#moveFocus(this.#step(item, -1), event.shiftKey);
        return;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (item.hasChildren && !item.expanded) this.expansion.expand(item);
        else if (item.expanded) this.focus.focusNode(this.host.firstChildItem(item));
        return;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (item.expanded) this.expansion.collapse(item);
        else this.focus.focusNode(this.#parentItem(item));
        return;
      }
      case "Home": {
        event.preventDefault();
        this.focus.focusNode(this.host.firstVisibleItem());
        return;
      }
      case "End": {
        event.preventDefault();
        this.focus.focusNode(this.host.lastVisibleItem());
        return;
      }
      case "PageUp": {
        event.preventDefault();
        this.focus.focusNode(this.#page(item, -1));
        return;
      }
      case "PageDown": {
        event.preventDefault();
        this.focus.focusNode(this.#page(item, 1));
        return;
      }
      case "Backspace": {
        // Common "Backspace goes up a level" file-explorer convention.
        event.preventDefault();
        this.focus.focusNode(this.#parentItem(item));
        return;
      }
      case "Enter": {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.open.activate(item);
          return;
        }
        event.preventDefault();
        if (item.hasChildren) this.expansion.toggle(item);
        return;
      }
      case " ": {
        // Space always selects, independent of expansion — Enter owns expand/collapse. Under
        // checkboxSelection, selecting is exclusively the checkbox's job (row clicks don't select
        // either — see tree-item's #onRowClick), so Space mirrors a checkbox click and cascades.
        event.preventDefault();
        if (this.host.checkboxSelection) this.selection.selectCascading(item, this.host.buildIndexTree());
        else this.selection.activate(item);
        return;
      }
      default:
        this.typeahead.onKeydown(event, item);
    }
  }

  /** Moves the roving-tabindex focus to `next` and, with Shift held, extends/shrinks the range
   * selection to it — same `activate({ shiftKey: true })` path shift+click uses, so a fresh
   * Shift+Arrow press with no prior anchor just selects `next` alone (matching shift+click).
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem | null} next
   * @param {boolean} shiftKey */
  #moveFocus(next, shiftKey) {
    if (!next) return;
    this.focus.focusNode(next);
    if (shiftKey) this.selection.activate(next, { shiftKey: true });
  }

  /**
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {1 | -1} direction
   */
  #step(item, direction) {
    const visible = [...this.host.visibleItems()];
    const index = visible.indexOf(item);
    if (index === -1) return null;
    return visible[index + direction] ?? null;
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item */
  #parentItem(item) {
    return closestTreeItemParent(item);
  }

  /**
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   * @param {1 | -1} direction
   */
  #page(item, direction) {
    const visible = [...this.host.visibleItems()];
    const index = visible.indexOf(item);
    if (index === -1) return null;
    const target = index + direction * this.#pageSize(item);
    return visible[Math.min(Math.max(target, 0), visible.length - 1)] ?? null;
  }

  /**
   * Rows-per-viewport estimate, from the item's own row height and the nearest scroll container.
   * @param {import("../components/tree-item/tree-item.js").TvxTreeItem} item
   */
  #pageSize(item) {
    const rowHeight = item.getBoundingClientRect().height || DEFAULT_ROW_HEIGHT;
    const scrollContainer = this.#scrollContainer();
    const availableHeight = scrollContainer?.clientHeight ?? window.innerHeight;
    return Math.max(1, Math.floor(availableHeight / rowHeight));
  }

  /** Nearest scrollable ancestor of the tree host, if any — falls back to the viewport otherwise. */
  #scrollContainer() {
    let node = this.host.parentElement;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
}
