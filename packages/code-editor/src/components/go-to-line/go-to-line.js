import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import tokens from "../../styles/tokens.css?inline";
import styles from "./go-to-line.css?inline";

/** @typedef {{ value: string }} CdxGoToLineSubmitDetail */
/** @typedef {{ refocus: boolean }} CdxGoToLineCancelDetail */

/**
 * @tag cdx-go-to-line
 * @summary "Go to line" card: `line` or `line:column`, Enter to go, Escape to close.
 */
@customElement("cdx-go-to-line")
export class CdxGoToLine extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    lineCount: { type: Number, attribute: "line-count" },
    position: { type: String },
    invalid: { type: Boolean, reflect: true },
  };

  static styles = [tokens, styles];

  constructor() {
    super();

    /** @type {number} Shown as the valid range. */
    this.lineCount = 1;

    /** @type {string} The caret's `line:column`, as the placeholder. */
    this.position = "1:1";

    /** @type {boolean} */
    this.invalid = false;
  }

  /** Puts the caret in the field, selecting what's there — every Ctrl-G. */
  async focusInput() {
    await this.updateComplete;
    const input = /** @type {HTMLInputElement | null} */ (this.renderRoot.querySelector("input"));
    input?.focus();
    input?.select();
  }

  firstUpdated() {
    this.focusInput();
  }

  /** @param {KeyboardEvent} event */
  handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      /** @type {CdxGoToLineCancelDetail} */
      const detail = { refocus: true };
      this.dispatchEvent(new CustomEvent("cdx-go-to-line-cancel", { detail }));
    } else if (event.key === "Enter") {
      event.preventDefault();
      /** @type {CdxGoToLineSubmitDetail} */
      const detail = { value: /** @type {HTMLInputElement} */ (event.currentTarget).value };
      this.dispatchEvent(new CustomEvent("cdx-go-to-line-submit", { detail }));
    }
  };

  /** Closes when focus leaves the card, without pulling it back to the text. @param {FocusEvent} event */
  handleFocusout = (event) => {
    const next = /** @type {Node | null} */ (event.relatedTarget);
    if (next && this.renderRoot.contains(next)) return;
    /** @type {CdxGoToLineCancelDetail} */
    const detail = { refocus: false };
    this.dispatchEvent(new CustomEvent("cdx-go-to-line-cancel", { detail }));
  };

  render() {
    return html`
      <div class="go-to-line" part="card" @focusout=${this.handleFocusout}>
        <label class="go-to-line__label" part="label" for="input">Go to line</label>
        <input
          id="input"
          class="go-to-line__input"
          part="input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
          placeholder=${this.position}
          aria-describedby="hint"
          aria-invalid=${this.invalid ? "true" : "false"}
          @keydown=${this.handleKeydown}
        />
        <small id="hint" class="go-to-line__hint" part="hint">
          ${this.invalid ? "Enter a line, or line:column" : `Line or line:column, 1–${this.lineCount}`}
        </small>
      </div>
    `;
  }
}
