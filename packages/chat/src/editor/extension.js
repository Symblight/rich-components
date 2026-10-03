/**
 * Editor hooks an element provides through `EDITOR_EXTENSION`, read live at paste/render time.
 * Any direct child of `chx-message-composer` that defines the symbol extends its editor — the
 * composer and textbox don't know what the extension is.
 * @typedef {{
 *   handlePaste?: (text: string, lines: number) => Record<string, unknown> | null,
 *   buildPasteElement?: (attrs: {text: string, lines: number, data: Record<string, unknown>}, source: "composer") => HTMLElement,
 * }} EditorExtension
 *
 * `handlePaste` returns the `data` of a collapsed `paste` node, or `null` to insert inline.
 * `buildPasteElement` renders a collapsed `paste` node.
 */

/** `Symbol.for`, so two copies of the package in one bundle still agree. */
export const EDITOR_EXTENSION = Symbol.for("@symblight/chat/editor-extension");
