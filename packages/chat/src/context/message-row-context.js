import { ContextConsumer, createContext } from "@lit/context";

/**
 * Per-row state — provided by the row, consumed by `chx-message` and the app's own slotted elements.
 * `Symbol.for` so two copies of the package in one bundle still share the key.
 * @type {import("@lit/context").Context<symbol, import("../types/message.js").ChxRowState | undefined>}
 */
export const messageRowContext = createContext(Symbol.for("@symblight/chat/message-row"));

/**
 * Mirrors the enclosing row's `compact` onto `host`, so `chx-chat.compact` reaches agent parts with
 * no wiring. Outside a row nothing is provided and the host's own property stands.
 * @param {import("lit").ReactiveElement & {compact: boolean}} host
 */
export function consumeRowCompact(host) {
  new ContextConsumer(host, {
    context: messageRowContext,
    subscribe: true,
    callback: (row) => {
      if (row) host.compact = row.compact;
    },
  });
}
