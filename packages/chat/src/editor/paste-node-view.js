/**
 * Renders a collapsed `paste` node — the matched pasteHandler's `render`, or
 * `getRenderPasteChip()` as fallback. `source` is always `"composer"`: paste chips have no
 * historical form, they unfold to full text once sent.
 */
export class PasteNodeView {
  /**
   * @param {import("prosemirror-model").Node} node
   * @param {{
   *   getRenderPasteChip: () => (detail: {text: string, lines: number, data: Record<string, unknown>, source: "composer"}) => HTMLElement,
   *   getPasteHandlers?: () => import("../types/paste-handler.js").PasteHandler[],
   * }} options
   */
  constructor(node, { getRenderPasteChip, getPasteHandlers }) {
    const { text, lines, handlerId, data } = node.attrs;
    const handler = handlerId ? getPasteHandlers?.()?.find((h) => h.id === handlerId) : undefined;
    const render = handler?.render ?? getRenderPasteChip();
    this.dom = render({ text, lines, data, source: "composer" });
    this.dom.setAttribute("contenteditable", "false");
  }
}
