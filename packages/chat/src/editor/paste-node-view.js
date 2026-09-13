import { Selection } from "prosemirror-state";

/**
 * Renders a collapsed `paste` node — the matched pasteHandler's `render`, or
 * `getRenderPasteChip()` as fallback. `source` is always `"composer"`: paste chips have no
 * historical form, they unfold to full text once sent. Syncs `chx-code-block-change`/
 * `chx-code-block-lang-change`/`chx-code-block-boundary` (e.g. chx-code-block's
 * `editable`/`langMenu`) back into the outer editor, so an in-place edit survives into
 * getValue()/getHTML() on send and arrowing out of the block returns focus to the textbox.
 */
export class PasteNodeView {
  /**
   * @param {import("prosemirror-model").Node} node
   * @param {import("prosemirror-view").EditorView} view
   * @param {() => number | undefined} getPos
   * @param {{
   *   getRenderPasteChip: () => (detail: {text: string, lines: number, data: Record<string, unknown>, source: "composer"}) => HTMLElement,
   *   getPasteHandlers?: () => import("../types/paste-handler.js").PasteHandler[],
   * }} options
   */
  constructor(node, view, getPos, { getRenderPasteChip, getPasteHandlers }) {
    this.view = view;
    this.getPos = getPos;

    const { text, lines, handlerId, data } = node.attrs;
    const handler = handlerId ? getPasteHandlers?.()?.find((h) => h.id === handlerId) : undefined;
    const render = handler?.render ?? getRenderPasteChip();
    this.dom = render({ text, lines, data, source: "composer" });
    this.dom.setAttribute("contenteditable", "false");

    this.dom.addEventListener("chx-code-block-change", /** @type {EventListener} */ (this.#handleCodeChange));
    this.dom.addEventListener(
      "chx-code-block-lang-change",
      /** @type {EventListener} */ (this.#handleLangChange),
    );
    this.dom.addEventListener(
      "chx-code-block-boundary",
      /** @type {EventListener} */ (this.#handleBoundary),
    );
  }

  /** Emptying the code entirely removes the node — an empty code block isn't a useful thing to send.
   * @param {CustomEvent<{code: string}>} event */
  #handleCodeChange = (event) => {
    const pos = this.getPos();
    if (pos === undefined) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node) return;

    if (event.detail.code === "") {
      this.view.dispatch(this.view.state.tr.delete(pos, pos + node.nodeSize));
      this.view.focus();
      return;
    }

    const { tr } = this.view.state;
    tr.setNodeAttribute(pos, "text", event.detail.code);
    tr.setNodeAttribute(pos, "lines", event.detail.code.split("\n").length);
    // The atom has no in-schema content, so there's no real position "inside" it to track
    // character-for-character the way the ProseMirror CodeMirror example does — this just keeps
    // the outer selection resting next to the node being edited instead of wherever it was stale
    // from before the user clicked in.
    tr.setSelection(Selection.near(tr.doc.resolve(pos + node.nodeSize), 1));
    this.view.dispatch(tr);
  };

  /** Moves the outer selection just before/after this node and refocuses the outer editor —
   *  chx-code-block's own counterpart to arrowHandler() in keymap.js.
   * @param {CustomEvent<{direction: "start" | "end"}>} event */
  #handleBoundary = (event) => {
    const pos = this.getPos();
    if (pos === undefined) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node) return;
    const dir = event.detail.direction === "start" ? -1 : 1;
    const targetPos = dir < 0 ? pos : pos + node.nodeSize;
    const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir);
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    this.view.focus();
  };

  /** @param {CustomEvent<{lang: string}>} event */
  #handleLangChange = (event) => {
    const pos = this.getPos();
    if (pos === undefined) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node) return;
    this.view.dispatch(
      this.view.state.tr.setNodeAttribute(pos, "data", { ...node.attrs.data, lang: event.detail.lang }),
    );
  };

  /** Without this, ProseMirror rebuilds `this.dom` from scratch on every attrs change — including
   *  the one #handleCodeChange itself just dispatched — destroying focus/cursor after one keystroke.
   *  Only pushes into chx-code-block's own `code`/`lang` when they actually differ (undo/redo,
   *  programmatic doc changes), so echoing our own edit back is a no-op.
   * @param {import("prosemirror-model").Node} node
   * @returns {boolean} */
  update(node) {
    if (node.type.name !== "paste") return false;
    const dom = /** @type {HTMLElement & {code?: string, lang?: string}} */ (this.dom);
    if (typeof dom.code === "string" && node.attrs.text !== dom.code) dom.code = node.attrs.text;
    const lang = node.attrs.data?.lang;
    if (typeof dom.lang === "string" && typeof lang === "string" && lang !== dom.lang) dom.lang = lang;
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
      "chx-code-block-change",
      /** @type {EventListener} */ (this.#handleCodeChange),
    );
    this.dom.removeEventListener(
      "chx-code-block-lang-change",
      /** @type {EventListener} */ (this.#handleLangChange),
    );
    this.dom.removeEventListener(
      "chx-code-block-boundary",
      /** @type {EventListener} */ (this.#handleBoundary),
    );
  }
}
