/**
 * @typedef {{
 *   pos: number,
 *   line: number,
 *   selection: import("@codemirror/state").EditorSelection,
 *   region: "content" | "gutter" | "diff-gutter",
 *   clientX: number,
 *   clientY: number,
 *   originalEvent: MouseEvent,
 * }} CdxContextMenuDetail
 * `pos` is the document offset under the pointer (the caret for the keyboard); `line` is 1-based.
 * Cancel the event to suppress the native menu.
 */

export class ContextMenuController {
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   */
  constructor(host, editor) {
    this.#editor = editor;
    host.addEventListener("contextmenu", (event) => this.#handle(host, event));
  }

  /** @param {HTMLElement} host @param {MouseEvent} event */
  #handle(host, event) {
    const view = this.#editor.view;
    const path = event.composedPath();
    if (!view || !path.includes(view.dom)) return;

    const region = path.some(
      (el) => el instanceof Element && el.classList.contains("cdx-vcs-gutter"),
    )
      ? "diff-gutter"
      : path.some((el) => el instanceof Element && el.classList.contains("cm-gutters"))
        ? "gutter"
        : "content";

    // no pointer coordinates: opened from the keyboard (ContextMenu key, Shift+F10)
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    let { clientX, clientY } = event;
    let pos;
    if (fromKeyboard) {
      pos = view.state.selection.main.head;
      const rect = view.coordsAtPos(pos);
      if (rect) [clientX, clientY] = [rect.left, rect.bottom];
    } else if (region === "content") {
      pos = view.posAtCoords({ x: clientX, y: clientY }, false);
    } else {
      pos = view.lineBlockAtHeight(clientY - view.documentTop).from;
    }

    // like other editors: right-clicking outside the selection moves the caret there first
    if (region === "content" && !fromKeyboard) {
      const inside = view.state.selection.ranges.some(
        (range) => !range.empty && pos >= range.from && pos <= range.to,
      );
      if (!inside) view.dispatch({ selection: { anchor: pos } });
    }

    /** @type {CdxContextMenuDetail} */
    const detail = {
      pos,
      line: view.state.doc.lineAt(pos).number,
      selection: view.state.selection,
      region,
      clientX,
      clientY,
      originalEvent: event,
    };
    const custom = new CustomEvent("cdx-contextmenu", {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    host.dispatchEvent(custom);
    if (custom.defaultPrevented) event.preventDefault();
  }
}
