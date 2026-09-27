import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextProvider } from "@lit/context";

import { messageRowContext } from "../../context/message-row-context.js";

/** @import { ChxRowState } from "../../types/message.js" */

/**
 * @tag chx-message-row
 * @summary Message row.
 */
@customElement("chx-message-row")
export class ChxMessageRow extends ReactiveElement {
  // light DOM, no shadow root — the chx-message inside stays in chx-infinity-scroll's tree, so the
  // exportparts chain doesn't grow a level
  createRenderRoot() {
    return this;
  }

  /** @type {ContextProvider<typeof messageRowContext, ChxMessageRow>} */
  #provider = new ContextProvider(this, { context: messageRowContext });

  /** Set synchronously, so a chx-message connecting right after already reads the current state.
   *  @param {ChxRowState | undefined} value */
  set row(value) {
    this.#provider.setValue(value);
  }

  /** @returns {ChxRowState | undefined} */
  get row() {
    return this.#provider.value;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = "flex";
    this.style.flexDirection = "column";
    // FocusBehaviorController finds rows by role — the chx-message inside drops its own
    this.setAttribute("role", "article");
  }

  // RowMeasurer awaits the row's first element; the row itself is ready before the message renders
  async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    const message = /** @type {import("lit").ReactiveElement | null} */ (
      this.querySelector(":scope > chx-message")
    );
    if (message) await message.updateComplete;
    return result;
  }
}
