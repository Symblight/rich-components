import { createContext } from "@lit/context";

/**
 * Per-row state — provided by the row, consumed by `chx-message` and the app's own slotted elements.
 * `Symbol.for` so two copies of the package in one bundle still share the key.
 * @type {import("@lit/context").Context<symbol, import("../types/message.js").ChxRowState | undefined>}
 */
export const messageRowContext = createContext(Symbol.for("@symblight/chat/message-row"));
