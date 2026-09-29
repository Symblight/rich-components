import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./editor.css?inline";

@customElement("edx-editor")
export class EdxEditor extends LitElement {
  static styles = [styles];

  render() {
    return html`<div part="content"></div>`;
  }
}
