import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/icon";

/**
 * @tag tvx-tree-directory-icon
 * @summary Folder icon that swaps to an open folder while `expanded` — e.g. from `renderItemLeading`:
 * `(item, { expanded }) => html\`<tvx-tree-directory-icon ?expanded=${expanded}>\``.
 */
@customElement("tvx-tree-directory-icon")
export class TvxTreeDirectoryIcon extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    expanded: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    /** @type {boolean} */
    this.expanded = false;
  }

  render() {
    return html`<md-icon
      ><svg viewBox="0 0 24 24">
        <path
          d=${
            this.expanded
              ? "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"
              : "m9.17 6 2 2H20v10H4V6h5.17M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
          }
        /></svg
    ></md-icon>`;
  }
}
