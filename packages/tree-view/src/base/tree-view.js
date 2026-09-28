import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { createRef, ref } from "lit/directives/ref.js";

import "@symblight/wc-material/checkbox";
import "@symblight/wc-material/progress-circular";
import "@symblight/wc-material/skeleton";

import { TreeModelController } from "../controllers/tree-model-controller.js";
import { DataSourceController } from "../controllers/data-source-controller.js";
import { SelectionController } from "../controllers/selection-controller.js";
import { VirtualizationController } from "../controllers/virtualization-controller.js";
import { KeyboardNavController } from "../controllers/keyboard-nav-controller.js";
import { OpenController } from "../controllers/open-controller.js";
import { ReorderController } from "../controllers/reorder-controller.js";
import tokens from "../styles/tokens.css?inline";
import styles from "./tree-view.css?inline";

/**
 * Any consumer object; read through `getItemId`/`getItemLabel`/`getItemChildren`/`isItemDisabled`.
 * @typedef {any} TvxTreeItemData
 */

/**
 * What the `renderItem*` callbacks receive alongside the item.
 * @typedef {object} TvxTreeItemState
 * @property {PropertyKey} id
 * @property {number} level 1-indexed depth
 * @property {boolean} expanded
 * @property {boolean} selected
 * @property {boolean} indeterminate
 * @property {boolean} disabled
 * @property {boolean} hasChildren
 */

/** @typedef {(item: TvxTreeItemData, state: TvxTreeItemState) => unknown} TvxTreeItemRenderer */

/**
 * Lazy loader: `getChildrenCount` decides which items are branches (`0` = leaf, `undefined` =
 * unknown branch), `getTreeItems` fetches a batch (the root when called with no parent).
 * @typedef {object} TvxTreeDataSource
 * @property {(parent?: TvxTreeItemData) => Promise<TvxTreeItemData[]>} getTreeItems
 * @property {(item: TvxTreeItemData) => number | undefined} getChildrenCount
 */

/** @typedef {{ parentId: PropertyKey | null, index: number }} TvxTreeItemPosition */

/** @typedef {import("../controllers/tree-model-controller.js").TreeRow} TreeRow */

const SKELETON_WIDTHS = ["60%", "45%", "72%"];

/**
 * @tag tvx-tree-view
 * @summary A virtualized WAI-ARIA `tree` rendered from data: expansion, selection, keyboard nav,
 * typeahead, reordering and async loading.
 *
 * @csspart tree - Row container.
 * @csspart row - A row's visible line.
 * @csspart chevron - Expand/collapse chevron.
 * @csspart checkbox - Checkbox wrapper (under `checkboxSelection`).
 * @csspart leading - `renderItemLeading` output.
 * @csspart label - Label (or `renderItemLabel` output).
 * @csspart trailing - `renderItemTrailing` output.
 * @csspart placeholder - A loading/skeleton row.
 *
 * @fires {CustomEvent<{ selectedItems: Set<PropertyKey> }>} tvx-selection-change - Whole-tree snapshot after any selection change.
 * @fires {CustomEvent<{ expandedItems: Set<PropertyKey> }>} tvx-expansion-change - Whole-tree snapshot after any expand/collapse.
 * @fires {CustomEvent<{ key: PropertyKey, expanded: boolean }>} tvx-expand-change - One item's expansion toggled.
 * @fires {CustomEvent<{ key: PropertyKey, oldPosition: TvxTreeItemPosition, newPosition: TvxTreeItemPosition }>} tvx-item-position-change - Cancelable; fires before a reorder moves an item.
 * @fires {CustomEvent<{ key: PropertyKey | null, node: TvxTreeItemData | null, items: TvxTreeItemData[] }>} tvx-children-loaded - A `dataSource` batch landed (`key`/`node` null for the root).
 * @fires {CustomEvent<{ key: PropertyKey | null, node: TvxTreeItemData | null, error: unknown }>} tvx-load-error - `dataSource.getTreeItems()` rejected.
 * @fires {CustomEvent<{ key: PropertyKey, node: TvxTreeItemData, newTab: true }>} tvx-open - Cancelable; middle-click / Ctrl+Enter on an item `getHref` didn't resolve.
 */
@customElement("tvx-tree-view")
export class TvxTreeView extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    items: { attribute: false },
    getItemId: { attribute: false },
    getItemLabel: { attribute: false },
    getItemChildren: { attribute: false },
    isItemDisabled: { attribute: false },
    renderItemLeading: { attribute: false },
    renderItemLabel: { attribute: false },
    renderItemTrailing: { attribute: false },
    noVirtualization: { type: Boolean, reflect: true, attribute: "no-virtualization" },
    multiSelect: { type: Boolean, reflect: true, attribute: "multi-select" },
    disableSelection: { type: Boolean, reflect: true, attribute: "disable-selection" },
    checkboxSelection: { type: Boolean, reflect: true, attribute: "checkbox-selection" },
    getHref: { attribute: false },
    dataSource: { attribute: false },
    reordering: { type: Boolean, reflect: true },
    isItemReorderable: { attribute: false },
    defaultExpandedItems: { attribute: false },
    defaultSelectedItems: { attribute: false },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  #model = new TreeModelController(this, (id) => this.#dataSource.loadChildren(id));
  #dataSource = new DataSourceController(this, this.#model);
  #selection = new SelectionController(this, this.#model);
  #reorder = new ReorderController(this, this.#model);
  #open = new OpenController(this, this.#model);
  #keyboard = new KeyboardNavController(
    this,
    this.#model,
    this.#selection,
    this.#reorder,
    this.#open,
  );
  #virtualization = new VirtualizationController(
    this,
    () => this.#model.rows,
    () => (this.#focusedId === null ? -1 : this.#model.indexOf(this.#focusedId)),
  );

  /** Row that last had focus; it keeps the Tab stop (roving tabindex). @type {PropertyKey | null} */
  #focusedId = null;
  #defaultsApplied = false;
  /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
  #liveRegion = createRef();

  constructor() {
    super();
    /** Tree data — any shape, read through the `getItem*` accessors below. @type {TvxTreeItemData[] | undefined} */
    this.items = undefined;
    /** @type {(item: TvxTreeItemData) => PropertyKey} */
    this.getItemId = (item) => item.id;
    /** @type {(item: TvxTreeItemData) => string} */
    this.getItemLabel = (item) => item.label;
    /** @type {(item: TvxTreeItemData) => TvxTreeItemData[] | undefined} */
    this.getItemChildren = (item) => item.children;
    /** @type {(item: TvxTreeItemData) => boolean} */
    this.isItemDisabled = (item) => !!item.disabled;
    /** @type {TvxTreeItemRenderer | undefined} */
    this.renderItemLeading = undefined;
    /** Replaces the plain-text label. @type {TvxTreeItemRenderer | undefined} */
    this.renderItemLabel = undefined;
    /** @type {TvxTreeItemRenderer | undefined} */
    this.renderItemTrailing = undefined;
    /** Renders every row instead of only the visible ones. @type {boolean} */
    this.noVirtualization = false;
    /** Ctrl/Cmd+click toggles, Shift+click/Shift+arrow selects a range. @type {boolean} */
    this.multiSelect = false;
    /** Turns selection off; rows still focus and branches still toggle. @type {boolean} */
    this.disableSelection = false;
    /** A checkbox per row; checking a branch checks its whole subtree. @type {boolean} */
    this.checkboxSelection = false;
    /** @type {((item: TvxTreeItemData) => string | undefined) | undefined} */
    this.getHref = undefined;
    /** @type {TvxTreeDataSource | undefined} */
    this.dataSource = undefined;
    /** Enables drag-and-drop and Alt+↑/↓ reordering. @type {boolean} */
    this.reordering = false;
    /** @type {((item: TvxTreeItemData) => boolean) | undefined} */
    this.isItemReorderable = undefined;
    /** Applied once, when the first items exist. @type {Iterable<PropertyKey> | undefined} */
    this.defaultExpandedItems = undefined;
    /** Applied once, when the first items exist. @type {Iterable<PropertyKey> | undefined} */
    this.defaultSelectedItems = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute("role")) this.setAttribute("role", "tree");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#dataSource.dispose();
  }

  /** @param {import("lit").PropertyValues<this>} changed */
  willUpdate(changed) {
    // dataSource too: each node asks it for its child count once, when added
    if (
      changed.has("items") ||
      changed.has("getItemId") ||
      changed.has("getItemChildren") ||
      changed.has("dataSource")
    ) {
      this.#model.setItems(this.items ?? []);
      this.#applyDefaultsOnce();
    }
    if (changed.has("multiSelect")) this.toggleAttribute("aria-multiselectable", this.multiSelect);
    this.#virtualization.sync(this.#model.rows);
  }

  /** @param {import("lit").PropertyValues<this>} changed */
  updated(changed) {
    if (changed.has("dataSource")) this.#dataSource.reset();
    this.#virtualization.measure(this.renderRoot.querySelectorAll("[data-index]"));
  }

  #applyDefaultsOnce() {
    if (this.#defaultsApplied || this.#model.rootIds.length === 0) return;
    this.#defaultsApplied = true;
    if (this.defaultExpandedItems) this.#model.setExpandedItems(this.defaultExpandedItems);
    if (this.defaultSelectedItems) this.#selection.setSelectedItems(this.defaultSelectedItems);
  }

  // ─── public API ───

  /** Selected ids; assigning replaces the selection. @returns {Set<PropertyKey>} */
  get selectedItems() {
    return new Set(this.#selection.selected);
  }

  /** @param {Iterable<PropertyKey>} ids */
  set selectedItems(ids) {
    this.#selection.setSelectedItems(ids);
  }

  /** Expanded ids; assigning replaces the expansion. @returns {Set<PropertyKey>} */
  get expandedItems() {
    return new Set(this.#model.expanded);
  }

  /** @param {Iterable<PropertyKey>} ids */
  set expandedItems(ids) {
    this.#model.setExpandedItems(ids);
  }

  /** @param {PropertyKey} id
   * @returns {TvxTreeItemData | null} */
  getItem(id) {
    return this.#model.item(id) ?? null;
  }

  /** @param {{ id: PropertyKey, expand: boolean }} options */
  setItemExpansion({ id, expand }) {
    if (expand) this.#model.expand(id);
    else this.#model.collapse(id);
  }

  /** @param {PropertyKey} id */
  isItemExpanded(id) {
    return this.#model.isExpanded(id);
  }

  /** Selects or deselects one item (no cascade). @param {{ id: PropertyKey, selected: boolean }} options */
  setItemSelection({ id, selected }) {
    this.#selection.setSelected(id, selected);
  }

  expandAll() {
    this.#model.expandAll();
  }

  collapseAll() {
    this.#model.collapseAll();
  }

  /** @returns {PropertyKey | null} */
  get focusedKey() {
    return this.#focusedId;
  }

  /** Gives `id` the Tab stop, focuses its row and scrolls it into view.
   * @param {PropertyKey | null} id */
  async focusItem(id) {
    if (id === null) return;
    this.#focusedId = id;
    this.requestUpdate();
    await this.updateComplete; // the focused row is always rendered, even when off-screen
    const index = this.#model.indexOf(id);
    if (index === -1) return;
    this.rowElement(index)?.focus({ preventScroll: true });
    this.#virtualization.scrollToIndex(index);
  }

  /** The rendered row at `index`, if it's in the DOM. @param {number} index
   * @returns {HTMLElement | null} */
  rowElement(index) {
    return this.renderRoot.querySelector(`[data-index="${index}"]`);
  }

  /** Screen-reader announcement; cleared first so a repeated message is announced again.
   * @param {string} message */
  announce(message) {
    const region = this.#liveRegion.value;
    if (!region) return;
    region.textContent = "";
    requestAnimationFrame(() => (region.textContent = message));
  }

  // ─── events ───

  /** Id of the item row an event came from. @param {Event} event */
  #rowId(event) {
    const row = event
      .composedPath()
      .find((node) => node instanceof HTMLElement && node.classList.contains("tree-view__item"));
    return row ? this.#model.idAt(Number(/** @type {HTMLElement} */ (row).dataset.index)) : null;
  }

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    const id = this.#rowId(event);
    if (id !== null) this.#keyboard.onKeydown(event, id);
  };

  /** Focus that arrived by mouse or Tab moves the Tab stop too. */
  #onFocusIn = (/** @type {FocusEvent} */ event) => {
    const id = this.#rowId(event);
    if (id === null || id === this.#focusedId) return;
    this.#focusedId = id;
    this.requestUpdate();
  };

  /** Middle-click = open in new tab. */
  #onAuxClick = (/** @type {MouseEvent} */ event) => {
    const id = this.#rowId(event);
    if (id === null || event.button !== 1 || this.#model.isDisabled(id)) return;
    event.preventDefault();
    this.#open.activate(id);
  };

  /** Clicking a row toggles a branch and — unless checkboxes do the selecting — selects it.
   * @param {MouseEvent} event
   * @param {PropertyKey} id */
  #onRowClick(event, id) {
    if (this.#model.hasChildren(id)) this.#model.toggle(id);
    if (!this.checkboxSelection) this.#selection.activate(id, event);
  }

  // ─── render ───

  render() {
    const rows = this.#model.rows;
    const virtual = this.#virtualization.enabled;
    const visible = virtual
      ? this.#virtualization.visibleRows()
      : rows.map((_, index) => ({ index, start: 0 }));
    // the Tab stop: the focused row if it's still visible, otherwise the first row
    const tabStopId =
      this.#focusedId !== null && this.#model.indexOf(this.#focusedId) !== -1
        ? this.#focusedId
        : this.#model.itemFrom(0, 1);

    return html`
      <div
        class=${classMap({ "tree-view": true, "tree-view_virtualized": virtual })}
        part="tree"
        style=${virtual ? `block-size: ${this.#virtualization.totalSize()}px` : nothing}
        @keydown=${this.#onKeydown}
        @focusin=${this.#onFocusIn}
        @auxclick=${this.#onAuxClick}
      >
        ${repeat(
          visible,
          ({ index }) => rows[index].key,
          ({ index, start }) => {
            const row = rows[index];
            const top = virtual ? start : null;
            return row.kind === "item"
              ? this.#renderItem(row, index, top, row.id === tabStopId)
              : this.#renderPlaceholder(row, index, top);
          },
        )}
      </div>
      <div
        class="tree-view__live-region"
        aria-live="polite"
        aria-atomic="true"
        ${ref(this.#liveRegion)}
      ></div>
    `;
  }

  /** Indent level + (when virtualized) the row's vertical position.
   * @param {number} level
   * @param {number | null} top */
  #rowStyle(level, top) {
    return styleMap({
      "--_tvx-level": String(level),
      transform: top === null ? undefined : `translateY(${top}px)`,
    });
  }

  /**
   * @param {TreeRow} row
   * @param {number} index
   * @param {number | null} top
   * @param {boolean} isTabStop
   */
  #renderItem(row, index, top, isTabStop) {
    const { id, level } = row;
    const item = this.#model.item(id);
    const hasChildren = this.#model.hasChildren(id);
    const expanded = this.#model.isExpanded(id);
    const disabled = this.#model.isDisabled(id);
    const { selected, indeterminate } = this.#selection.stateOf(id);
    /** @type {TvxTreeItemState} */
    const state = { id, level, expanded, selected, indeterminate, disabled, hasChildren };
    const labelId = `tvx-label-${index}`;

    return html`
      <div
        class=${classMap({
          "tree-view__item": true,
          "tree-view__item_expanded": expanded,
          "tree-view__item_selected": selected,
          "tree-view__item_disabled": disabled,
        })}
        role="treeitem"
        data-index=${index}
        tabindex=${isTabStop ? "0" : "-1"}
        aria-level=${level}
        aria-setsize=${row.setsize}
        aria-posinset=${row.posinset}
        aria-expanded=${hasChildren ? String(expanded) : nothing}
        aria-selected=${String(selected)}
        aria-disabled=${disabled ? "true" : nothing}
        aria-current=${!this.multiSelect && selected ? "true" : nothing}
        aria-labelledby=${labelId}
        style=${this.#rowStyle(level, top)}
        @click=${(/** @type {MouseEvent} */ event) => this.#onRowClick(event, id)}
      >
        <div class="tree-view__row" part="row">
          <span
            class="tree-view__chevron"
            part="chevron"
            aria-hidden="true"
            @click=${(/** @type {Event} */ event) => {
              if (!hasChildren) return;
              event.stopPropagation(); // toggle only, don't select
              this.#model.toggle(id);
            }}
          >
            ${hasChildren ? chevronIcon : nothing}
          </span>
          ${
            this.checkboxSelection && !this.disableSelection
              ? html`
                  <span
                    class="tree-view__checkbox"
                    part="checkbox"
                    @click=${(/** @type {Event} */ event) => {
                      event.stopPropagation(); // checkbox only, don't toggle expansion
                      this.#selection.toggleCascading(id);
                    }}
                  >
                    <md-checkbox
                      class="tree-view__checkbox-control"
                      .checked=${selected}
                      .indeterminate=${indeterminate}
                      ?disabled=${disabled}
                      tabindex="-1"
                    ></md-checkbox>
                  </span>
                `
              : nothing
          }
          <span class="tree-view__leading" part="leading" aria-hidden="true"
            >${this.renderItemLeading?.(item, state) ?? nothing}</span
          >
          <span class="tree-view__label" part="label" id=${labelId}
            >${this.renderItemLabel ? this.renderItemLabel(item, state) : this.#model.label(id)}</span
          >
          <span class="tree-view__trailing" part="trailing"
            >${this.renderItemTrailing?.(item, state) ?? nothing}</span
          >
        </div>
      </div>
    `;
  }

  /** A spinner row (unknown child count) or a shimmer bar (known count) while a branch loads.
   * @param {TreeRow} row
   * @param {number} index
   * @param {number | null} top */
  #renderPlaceholder(row, index, top) {
    const isSpinner = row.kind === "loading";
    return html`
      <div
        class="tree-view__placeholder"
        role=${isSpinner ? "treeitem" : "none"}
        aria-disabled=${isSpinner ? "true" : nothing}
        aria-level=${row.level}
        data-index=${index}
        style=${this.#rowStyle(row.level, top)}
      >
        <div class="tree-view__row tree-view__row_placeholder" part="placeholder">
          ${
            isSpinner
              ? html`
                  <span class="tree-view__spinner" aria-hidden="true">
                    <md-progress-circular></md-progress-circular>
                  </span>
                  <span class="tree-view__label">Loading…</span>
                `
              : html`<md-skeleton
                  class="tree-view__skeleton"
                  style="inline-size: ${SKELETON_WIDTHS[(row.posinset - 1) % SKELETON_WIDTHS.length]}"
                ></md-skeleton>`
          }
        </div>
      </div>
    `;
  }
}

const chevronIcon = html`<svg class="tree-view__chevron-icon" viewBox="0 0 24 24">
  <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
</svg>`;
