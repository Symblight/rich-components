import { ContextConsumer } from "@lit/context";

import { messageRowContext } from "../../context/message-row-context.js";

/** Mirrors the enclosing message row's `compact` onto the host, so `chx-chat.compact` reaches agent
 *  parts with no wiring. Outside a row nothing is provided and the host's own property stands. */
export class RowCompactController {
  /** @param {import("lit").ReactiveElement & {compact: boolean}} host */
  constructor(host) {
    new ContextConsumer(host, {
      context: messageRowContext,
      subscribe: true,
      callback: (row) => {
        if (row) host.compact = row.compact;
      },
    });
  }
}
