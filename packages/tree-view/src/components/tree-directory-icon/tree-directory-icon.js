import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";

import "@symblight/wc-material/icon";

import { toggledItemsContext } from "../../base/toggled-items-context.js";

/** @tag tvx-tree-directory-icon */
@customElement("tvx-tree-directory-icon")
export class TvxTreeDirectoryIcon extends LitElement {
  constructor() {
    super();
    this._toggled = new ContextConsumer(this, { context: toggledItemsContext, subscribe: true });
  }

  get _expanded() {
    const item = this.closest("tvx-tree-item");
    if (!item) return false;
    const map = this._toggled.value;
    return map?.has(item.key) ? map.get(item.key) : item.expanded;
  }

  #renderIcon() {
    return html`<svg viewBox="0 0 24 24">
      <path
        d="m9.17 6 2 2H20v10H4V6h5.17M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
      />
    </svg>`;
  }

  #renderExpandedIcon() {
    return html`<svg viewBox="0 0 24 24">
      <path
        d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"
      />
    </svg>`;
  }

  render() {
    return html`<md-icon
      >${this._expanded ? this.#renderExpandedIcon() : this.#renderIcon()}</md-icon
    >`;
  }
}
