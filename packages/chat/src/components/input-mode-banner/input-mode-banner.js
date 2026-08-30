import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./input-mode-banner.css?inline";

/**
 * @tag chx-input-mode-banner
 * @summary Input mode banner.
 */
@customElement("chx-input-mode-banner")
export class ChxInputModeBanner extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {};

  constructor() {
    super();
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html`input mode banner`;
  }
}
