/**
 * @typedef {{text: string, lines: number, data: Record<string, unknown>}} PasteAttrs
 */

/**
 * Editor hooks an element provides through `EDITOR_EXTENSION`, read live at paste/render time.
 * Any direct child of `chx-message-composer` that defines the symbol extends its editor — the
 * composer and textbox don't know what the extension is.
 * @typedef {{
 *   priority?: number,
 *   handlePaste?: (text: string, lines: number) => Record<string, unknown> | null,
 *   buildPasteElement?: (attrs: PasteAttrs, source: "composer") => HTMLElement | null,
 *   updatePasteElement?: (element: HTMLElement, attrs: PasteAttrs) => void,
 * }} EditorExtension
 *
 * `priority` orders `handlePaste` calls, highest first (default `0`, ties keep child order).
 * `handlePaste` returns the `data` of a collapsed `paste` node, or `null` to pass.
 * `buildPasteElement` renders a `paste` node it owns, or returns `null` for someone else's — the
 * first non-null element wins. `updatePasteElement` pushes later attrs (undo/redo) into that element.
 * The element syncs edits back by dispatching `PASTE_CHANGE_EVENT` / `PASTE_BOUNDARY_EVENT`.
 */

/** `Symbol.for`, so two copies of the package in one bundle still agree. */
export const EDITOR_EXTENSION = Symbol.for("@symblight/chat/editor-extension");

/** Detail `{text?, data?}` — merged into the node's attrs; `text: ""` removes the node. */
export const PASTE_CHANGE_EVENT = "chx-paste-change";

/** Detail `{direction: "start" | "end"}` — moves the caret out of the node and refocuses the editor. */
export const PASTE_BOUNDARY_EVENT = "chx-paste-boundary";

/**
 * @param {() => EditorExtension[]} getExtensions
 * @returns {EditorExtension[]}
 */
export function byPastePriority(getExtensions) {
  return getExtensions()
    .map((extension, index) => ({ extension, index }))
    .sort((a, b) => (b.extension.priority ?? 0) - (a.extension.priority ?? 0) || a.index - b.index)
    .map(({ extension }) => extension);
}
