/**
 * @typedef {Object} PasteHandler
 * @property {string} id - Stashed on the `paste` node so a later re-render (undo/redo, parseDOM) can look the handler back up.
 * @property {(ctx: {text: string, lines: number, html: string | null, event: ClipboardEvent}) => Record<string, unknown> | null | undefined} match - Called once, synchronously, inside the original paste — the only place `html`/`event` exist. Non-null claims the paste; the return value becomes the node's `attrs.data`.
 * @property {(ctx: {text: string, lines: number, data: Record<string, unknown>}) => HTMLElement} render - May be called again much later (undo/redo, copy-paste of the editor's own HTML) — must be reconstructible from `{text, lines, data}` alone, never from the original event.
 */

export {};
