import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/skeleton";

import styles from "./tree-skeleton.css?inline";

/** Hard cap on rendered rows — a branch reporting a huge count still only inserts this many. */
const MAX_ROWS = 8;

/**
 * @tag tvx-tree-skeleton
 * @summary Decorative row-shaped shimmer bars shown in a branch's sub-tree while its *known*
 * child count is loading — `DataSourceController` inserts one of these instead of the generic
 * `<tvx-tree-item loading>` row whenever `getChildrenCount` already reported a definite number.
 * Deliberately not a `<tvx-tree-item>`: the tree's traversal (`allItems`/`visibleItems`/selection/
 * keyboard nav in `base/tree-view.js`) only recognizes `TVX-TREE-ITEM`/`TVX-ITEM-SUB-TREE` tag
 * names and silently skips anything else, so this never becomes a focus stop or nav target — the
 * live-region "Loading N items." announcement carries all the information assistive tech gets.
 */
@customElement("tvx-tree-skeleton")
export class TvxTreeSkeleton extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    count: { type: Number },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();
    /** Expected child count — rendered row count is `min(count, MAX_ROWS)`, at least 1. */
    this.count = 1;
  }

  connectedCallback() {
    super.connectedCallback();
    // Not in the constructor — a custom element constructor must not gain attributes/children,
    // browsers enforce this and throw on document.createElement() otherwise.
    if (!this.hasAttribute("aria-hidden")) this.setAttribute("aria-hidden", "true");
  }

  render() {
    const rows = Math.min(Math.max(this.count, 1), MAX_ROWS);
    return html`${Array.from(
      { length: rows },
      () => html`
        <div class="tree-skeleton__row" part="row">
          <md-skeleton class="tree-skeleton__bar" part="bar"></md-skeleton>
        </div>
      `,
    )}`;
  }
}
