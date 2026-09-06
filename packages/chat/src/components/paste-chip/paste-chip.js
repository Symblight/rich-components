import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../chip/chip.js";

import styles from "./paste-chip.css?inline";

/**
 * @tag chx-paste-chip
 * @summary Default rendering for a collapsed long paste (see paste-plugin.js) — a `chx-chip`
 * with a document icon and an "N lines" label, both overridable via slots.
 */
@customElement("chx-paste-chip")
export class ChxPasteChip extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    lines: { type: Number, attribute: true },
  };

  constructor() {
    super();

    /** @type {number} Line count of the collapsed paste — feeds the default label. */
    this.lines = 0;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html`
      <chx-chip>
        <slot name="icon" slot="icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"
            ></path>
          </svg>
        </slot>
        <slot>${this.lines} lines</slot>
      </chx-chip>
    `;
  }
}
