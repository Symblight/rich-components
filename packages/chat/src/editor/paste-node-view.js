import { Selection } from "prosemirror-state";

import "../components/paste-chip/paste-chip.js";
import { PASTE_BOUNDARY_EVENT, PASTE_CHANGE_EVENT } from "./extension.js";

/**
 * Last-resort default — a `paste` node (a restored draft, undo) no extension claims.
 * @param {{lines: number}} detail
 * @returns {HTMLElement}
 */
function defaultBuildElement({ lines }) {
  const chip = /** @type {import("../components/paste-chip/paste-chip.js").ChxPasteChip} */ (
    document.createElement("chx-paste-chip")
  );
  chip.lines = lines;
  return chip;
}

/**
 * Renders a collapsed `paste` node — the first editor extension whose `buildPasteElement` claims
 * it, or `defaultBuildElement` above. `source` is always `"composer"`: a collapsed paste unfolds
 * to full text once sent. An editable element (e.g. chx-code-block via chx-code-block-paste) syncs
 * back through `PASTE_CHANGE_EVENT`/`PASTE_BOUNDARY_EVENT`, so an in-place edit survives into
 * getValue()/getHTML() and leaving the element returns focus to the textbox.
 */
export class PasteNodeView {
  /** @type {import("./extension.js").EditorExtension | undefined} */
  #owner;

  /**
   * @param {import("prosemirror-model").Node} node
   * @param {import("prosemirror-view").EditorView} view
   * @param {() => number | undefined} getPos
   * @param {{getExtensions: () => import("./extension.js").EditorExtension[]}} options
   */
  constructor(node, view, getPos, { getExtensions }) {
    this.view = view;
    this.getPos = getPos;

    const { text, lines, data } = node.attrs;
    /** @type {HTMLElement | null} */
    let dom = null;
    for (const extension of getExtensions()) {
      dom = extension.buildPasteElement?.({ text, lines, data }, "composer") ?? null;
      if (dom) {
        this.#owner = extension;
        break;
      }
    }
    this.dom = dom ?? defaultBuildElement({ lines });
    this.dom.setAttribute("contenteditable", "false");

    this.dom.addEventListener(
      PASTE_CHANGE_EVENT,
      /** @type {EventListener} */ (this.#handleChange),
    );
    this.dom.addEventListener(
      PASTE_BOUNDARY_EVENT,
      /** @type {EventListener} */ (this.#handleBoundary),
    );
  }

  /** @returns {{pos: number, node: import("prosemirror-model").Node} | null} */
  #current() {
    const pos = this.getPos();
    if (pos === undefined) return null;
    const node = this.view.state.doc.nodeAt(pos);
    return node ? { pos, node } : null;
  }

  /** Emptying the text entirely removes the node — an empty paste isn't a useful thing to send.
   * @param {CustomEvent<{text?: string, data?: Record<string, unknown>}>} event */
  #handleChange = (event) => {
    const current = this.#current();
    if (!current) return;
    const { pos, node } = current;
    const { text, data } = event.detail;

    if (text === "") {
      this.view.dispatch(this.view.state.tr.delete(pos, pos + node.nodeSize));
      this.view.focus();
      return;
    }

    const { tr } = this.view.state;
    if (typeof text === "string") {
      tr.setNodeAttribute(pos, "text", text);
      tr.setNodeAttribute(pos, "lines", text.split("\n").length);
      // An atom has no inner positions to track, so just keep the outer selection beside this node.
      tr.setSelection(Selection.near(tr.doc.resolve(pos + node.nodeSize), 1));
    }
    if (data) tr.setNodeAttribute(pos, "data", { ...node.attrs.data, ...data });
    this.view.dispatch(tr);
  };

  /** Counterpart to arrowHandler() in keymap.js — the element hands focus back at its edge.
   * @param {CustomEvent<{direction: "start" | "end"}>} event */
  #handleBoundary = (event) => {
    const current = this.#current();
    if (!current) return;
    const { pos, node } = current;
    const dir = event.detail.direction === "start" ? -1 : 1;
    const targetPos = dir < 0 ? pos : pos + node.nodeSize;
    const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir);
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    this.view.focus();
  };

  /** Without this, ProseMirror rebuilds `this.dom` on every attrs change — including the one
   *  #handleChange just dispatched — destroying focus/cursor after one keystroke.
   * @param {import("prosemirror-model").Node} node
   * @returns {boolean} */
  update(node) {
    if (node.type.name !== "paste") return false;
    const { text, lines, data } = node.attrs;
    this.#owner?.updatePasteElement?.(this.dom, { text, lines, data });
    return true;
  }

  /** Keeps clicks inside `this.dom` from becoming a NodeSelection; preventDefault on mousedown also
   *  stops the browser moving its own selection there, which ProseMirror would otherwise resync to
   *  — except when the real (shadow-piercing) target is itself contenteditable, e.g. chx-code-block's
   *  own `editable` body, which needs that native mousedown to focus/place its caret normally.
   * @param {Event} event
   * @returns {boolean} */
  stopEvent(event) {
    const inside = this.dom.contains(/** @type {Node | null} */ (event.target));
    if (inside && event.type === "mousedown") {
      const target = /** @type {MouseEvent} */ (event).composedPath?.()[0];
      if (!(target instanceof HTMLElement) || !target.isContentEditable) event.preventDefault();
    }
    return inside;
  }

  destroy() {
    this.dom.removeEventListener(
      PASTE_CHANGE_EVENT,
      /** @type {EventListener} */ (this.#handleChange),
    );
    this.dom.removeEventListener(
      PASTE_BOUNDARY_EVENT,
      /** @type {EventListener} */ (this.#handleBoundary),
    );
  }
}
