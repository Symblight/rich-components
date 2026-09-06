/**
 * Renders a collapsed `paste` node. `node.attrs.handlerId` set → look up
 * that pasteHandler and call its own `render`; unset, or the handler is no
 * longer registered (e.g. removed since the doc was created), fall back to
 * `getRenderPasteChip()` — chx-textbox's own default (or the app's
 * `renderPasteChip`) — same graceful-degradation reasoning as CommandNodeView
 * but one step more defensive (that one renders an empty `<span>` on a
 * missing template id). editor/ stays component-free either way — the
 * renderer is always supplied from outside.
 */
export class PasteNodeView {
  /**
   * @param {import("prosemirror-model").Node} node
   * @param {{
   *   getRenderPasteChip: () => (detail: {text: string, lines: number, data: Record<string, unknown>}) => HTMLElement,
   *   getPasteHandlers?: () => import("../types/paste-handler.js").PasteHandler[],
   * }} options
   */
  constructor(node, { getRenderPasteChip, getPasteHandlers }) {
    const { text, lines, handlerId, data } = node.attrs;
    const handler = handlerId ? getPasteHandlers?.()?.find((h) => h.id === handlerId) : undefined;
    const render = handler?.render ?? getRenderPasteChip();
    this.dom = render({ text, lines, data });
    this.dom.setAttribute("contenteditable", "false");
  }
}
