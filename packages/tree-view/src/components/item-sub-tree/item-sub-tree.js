import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./item-sub-tree.css?inline";

/**
 * @tag tvx-item-sub-tree
 * @summary Purely structural grouping element: `role="group"` plus a default slot for a branch's
 * nested `<tvx-tree-item>` children. Owns no state — `tvx-tree-item` sets `hidden` on it directly.
 */
@customElement("tvx-item-sub-tree")
export class TvxItemSubTree extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
  }

  render() {
    return html`<slot></slot>`;
  }
}
