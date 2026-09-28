/** Typeahead buffer resets after this many ms without typing. */
const TYPEAHEAD_RESET_MS = 500;
/** Row height (px) used for PageUp/PageDown before a row has been measured. */
const DEFAULT_ROW_HEIGHT = 38;

/** The WAI-ARIA tree keyboard table, plus typeahead. Focus moves through `host.focusItem()`. */
export class KeyboardNavController {
  #typed = "";
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #typedTimer;

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./tree-model-controller.js").TreeModelController} model
   * @param {import("./selection-controller.js").SelectionController} selection
   * @param {import("./reorder-controller.js").ReorderController} reorder
   * @param {import("./open-controller.js").OpenController} open
   */
  constructor(host, model, selection, reorder, open) {
    this.host = host;
    this.model = model;
    this.selection = selection;
    this.reorder = reorder;
    this.open = open;
  }

  /** @param {KeyboardEvent} event
   * @param {PropertyKey} id the row the key was pressed on */
  onKeydown(event, id) {
    const { host, model } = this;
    const index = model.indexOf(id);
    const disabled = model.isDisabled(id);
    const expanded = model.isExpanded(id);
    /** @param {PropertyKey | null} target */
    const focus = (target) => {
      event.preventDefault();
      host.focusItem(target);
    };

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        const step = event.key === "ArrowDown" ? 1 : -1;
        if (event.altKey && host.reordering) {
          event.preventDefault();
          if (!disabled) this.reorder.moveBySibling(id, step);
          return;
        }
        const next = model.itemFrom(index + step, step);
        focus(next);
        if (next !== null && event.shiftKey) this.selection.activate(next, { shiftKey: true });
        return;
      }
      case "ArrowRight":
        event.preventDefault();
        if (!model.hasChildren(id)) return;
        if (expanded) focus(model.childIds(id)[0] ?? null);
        else model.expand(id);
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (expanded) model.collapse(id);
        else focus(model.parentId(id));
        return;
      case "Backspace": // file-explorer convention: go up a level
        return focus(model.parentId(id));
      case "Home":
        return focus(model.itemFrom(0, 1));
      case "End":
        return focus(model.itemFrom(model.rows.length - 1, -1));
      case "PageDown":
      case "PageUp": {
        const step = event.key === "PageDown" ? 1 : -1;
        const last = model.rows.length - 1;
        const target = Math.min(Math.max(index + step * this.#pageSize(index), 0), last);
        return focus(model.itemFrom(target, step === 1 ? -1 : 1));
      }
      case "Enter":
        event.preventDefault();
        if (disabled) return;
        if (event.ctrlKey || event.metaKey) this.open.activate(id);
        else if (model.hasChildren(id)) model.toggle(id);
        return;
      case " ": // Space always selects; with checkboxes it behaves like a checkbox click
        event.preventDefault();
        if (host.checkboxSelection) this.selection.toggleCascading(id);
        else this.selection.activate(id);
        return;
      default:
        this.#typeahead(event, index);
    }
  }

  /** Jumps to the next row (wrapping around) whose label starts with what was typed.
   * @param {KeyboardEvent} event
   * @param {number} index */
  #typeahead(event, index) {
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    clearTimeout(this.#typedTimer);
    this.#typed += event.key.toLowerCase();
    this.#typedTimer = setTimeout(() => (this.#typed = ""), TYPEAHEAD_RESET_MS);

    const count = this.model.rows.length;
    for (let step = 1; step <= count; step++) {
      const id = this.model.idAt((index + step) % count);
      if (id !== null && this.model.label(id).toLowerCase().startsWith(this.#typed)) {
        this.host.focusItem(id);
        return;
      }
    }
  }

  /** How many rows fit in the visible part of the tree. @param {number} index */
  #pageSize(index) {
    const rowHeight = this.host.rowElement(index)?.offsetHeight || DEFAULT_ROW_HEIGHT;
    const viewport = Math.min(this.host.clientHeight || Infinity, window.innerHeight);
    return Math.max(1, Math.floor(viewport / rowHeight));
  }
}
