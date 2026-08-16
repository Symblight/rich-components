import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./message-list.css?inline";

/**
 * @tag chx-message-list
 * @summary  Message list.
 *
 */
@customElement("chx-message-list")
export class ChxMessageList extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html` message list `;
  }
}
