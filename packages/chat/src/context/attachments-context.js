import { createContext } from "@lit/context";

/**
 * Currently attached files — provided by `chx-chat` (a `ContextProvider`,
 * kept in sync with `chx-attachments`' own slotted children via the
 * bubbling `chx-attachments-change` event), consumed by `chx-textbox` (a
 * `ContextConsumer`) to drive its `textbox_attached` row-gap without
 * depending on `:has()`/`::slotted()` support.
 * @type {import("@lit/context").Context<symbol, File[]>}
 */
export const attachmentsContext = createContext(Symbol("chx-attachments"));
