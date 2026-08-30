import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/chips";

import styles from "./chip.css?inline";

/**
 * @tag chx-chip
 * @summary Chip.
 */
@customElement("chx-chip")
export class ChxChip extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html`
      <md-suggestion-chip class="chip">
        <slot name="icon" slot="leading-icon"></slot>
        <slot></slot>
      </md-suggestion-chip>
    `;
  }
}
