import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import { ContextProvider } from "@lit/context";

import "../components/tree-item/tree-item.js";
import "../components/tree-skeleton/tree-skeleton.js";

import { treeViewContext } from "./tree-view-context.js";
import { buildIndexTree } from "../core/index-tree.js";
import { ExpansionController } from "../controllers/expansion-controller.js";
import { SelectionController } from "../controllers/selection-controller.js";
import { RovingFocusController } from "../controllers/roving-focus-controller.js";
import { KeyboardNavController } from "../controllers/keyboard-nav-controller.js";
import { TypeaheadController } from "../controllers/typeahead-controller.js";
import { OpenController } from "../controllers/open-controller.js";
import { DataSourceController } from "../controllers/data-source-controller.js";
import { ReorderController } from "../controllers/reorder-controller.js";
import styles from "./tree-view.css?inline";

/** @tag tvx-tree-view @summary A WAI-ARIA `tree`; composition root for expansion, selection, focus, keyboard nav, typeahead, and async loading. */
@customElement("tvx-tree-view")
export class TvxTreeView extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    items: { attribute: false },
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
    return [styles];
  }

  constructor() {
    super();

    /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem[] | undefined} */
    this._items = undefined;

    /** Opt into ctrl/cmd+click (toggle) and shift+click/shift+arrow (contiguous range) multi-select.
     * Off by default — a plain click then selects exactly one item. */
    this.multiSelect = false;
    /** Disables selection entirely; rows still focus and a branch still toggles expand/collapse on click. */
    this.disableSelection = false;
    /** Renders a checkbox per row (single- or multi-select); clicking it toggles just that item,
     * independent of the ctrl/shift-click modifiers a plain row click uses in multi-select mode. */
    this.checkboxSelection = false;
    /** @type {((node: import("../components/tree-item/tree-item.js").TvxTreeItem) => string | undefined) | undefined} */
    this.getHref = undefined;
    /** @type {{ getTreeItems: (parent?: import("../components/tree-item/tree-item.js").TvxTreeItem) => Promise<import("../components/tree-item/tree-item.js").TvxTreeItem[]>, getChildrenCount: (item: import("../components/tree-item/tree-item.js").TvxTreeItem) => number | undefined } | undefined} */
    this.dataSource = undefined;
    this.reordering = false;
    /** @type {((item: import("../components/tree-item/tree-item.js").TvxTreeItem) => boolean) | undefined} */
    this.isItemReorderable = undefined;
    /** Uncontrolled initial value, applied once the root batch of items exists — unlike `expandedItems`, later writes have no effect.
     * @type {Iterable<PropertyKey> | undefined} */
    this.defaultExpandedItems = undefined;
    /** @see defaultExpandedItems
     * @type {Iterable<PropertyKey> | undefined} */
    this.defaultSelectedItems = undefined;
    this._defaultsApplied = false;

    this._focus = new RovingFocusController(this);
    this._dataSource = new DataSourceController(this, this._focus);
    this._expansion = new ExpansionController(this, this._dataSource);
    this._selection = new SelectionController(this);
    this._typeahead = new TypeaheadController(this, this._focus);
    this._open = new OpenController(this);
    this._reorder = new ReorderController(this);
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    this._liveRegionRef = createRef();
    /** @type {number | null} */
    this._pendingScrollFrame = null;
    this._keyboardNav = new KeyboardNavController(this, {
      expansion: this._expansion,
      focus: this._focus,
      selection: this._selection,
      typeahead: this._typeahead,
      open: this._open,
      reorder: this._reorder,
    });

    /** @private */
    this._contextProvider = new ContextProvider(this, {
      context: treeViewContext,
      initialValue: {
        multiSelect: this.multiSelect,
        disableSelection: this.disableSelection,
        checkboxSelection: this.checkboxSelection,
        getHref: this.getHref,
        reordering: this.reordering,
        isItemReorderable: this.isItemReorderable,
      },
    });

    this.addEventListener("keydown", (event) => this._keyboardNav.onKeydown(event));
    this.addEventListener("auxclick", (event) => this._open.handleAuxClick(event));
    this.addEventListener("tvx-tree-item-toggle", (event) =>
      this._onItemToggle(/** @type {CustomEvent} */ (event)),
    );
    this.addEventListener("tvx-tree-item-activate", (event) =>
      this._onItemActivate(/** @type {CustomEvent} */ (event)),
    );
    this.addEventListener("tvx-tree-item-reorder-drop", (event) =>
      this._reorder.handleDrop(/** @type {CustomEvent} */ (event).detail),
    );
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute("role")) this.setAttribute("role", "tree");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._dataSource.dispose();
    if (this._pendingScrollFrame !== null) {
      cancelAnimationFrame(this._pendingScrollFrame);
      this._pendingScrollFrame = null;
    }
  }

  firstUpdated() {
    this._focus.ensureInitialFocusable();
    // Covers declarative markup and a dataSource resolving its own root fetch (which itself
    // assigns `.items`, see below) — `.items` being assigned *after* connection (e.g. a framework
    // wrapper setting properties post-mount) is the other case, covered by the `items` setter below.
    this._dataSource.loadRoot().then(() => this.#applyDefaultsOnce());
  }

  /** Applies `defaultExpandedItems`/`defaultSelectedItems` exactly once, the first time the root
   * batch of items actually exists — whichever of `firstUpdated()` or the `items` setter gets there
   * first. A call that finds no items yet, or runs before connection (a disconnected item's own
   * `hasChildren` isn't computed yet — see `TvxTreeItem#claimSubTree()` — so `defaultExpandedItems`
   * would silently no-op on it), defers rather than consuming the one shot. */
  #applyDefaultsOnce() {
    if (this._defaultsApplied || !this.isConnected || this.allItems().next().done) return;
    this._defaultsApplied = true;
    if (this.defaultExpandedItems) this._expansion.syncFromExternal(this.defaultExpandedItems);
    if (this.defaultSelectedItems) this._selection.syncFromExternal(this.defaultSelectedItems);
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    if (changed.has("dataSource")) this._dataSource.handleDataSourceChange();

    if (
      changed.has("multiSelect") ||
      changed.has("disableSelection") ||
      changed.has("checkboxSelection") ||
      changed.has("getHref") ||
      changed.has("reordering") ||
      changed.has("isItemReorderable")
    ) {
      this._contextProvider.setValue({
        multiSelect: this.multiSelect,
        disableSelection: this.disableSelection,
        checkboxSelection: this.checkboxSelection,
        getHref: this.getHref,
        reordering: this.reordering,
        isItemReorderable: this.isItemReorderable,
      });
    }
  }

  /** Real `<tvx-tree-item>` elements; setting this is a `replaceChildren()` convenience.
   * @returns {import("../components/tree-item/tree-item.js").TvxTreeItem[] | undefined} */
  get items() {
    return this._items;
  }

  /** @param {import("../components/tree-item/tree-item.js").TvxTreeItem[] | undefined} value */
  set items(value) {
    this._items = value;
    if (value) this.replaceChildren(...value);
    this._focus.ensureInitialFocusable();
    this.requestUpdate("items");
    this.#applyDefaultsOnce();
  }

  /** Live snapshot of selected keys; assigning a new Set re-syncs internal selection state to match
   * (uncontrolled-with-sync, like `items`) — the tree still manages selection on its own, this is optional.
   * @returns {Set<PropertyKey>} */
  get selectedItems() {
    return new Set(this._selection.selected);
  }

  /** @param {Iterable<PropertyKey>} value */
  set selectedItems(value) {
    this._selection.syncFromExternal(value);
    this.requestUpdate("selectedItems");
  }

  /** Live snapshot of expanded keys; assigning a new Set re-syncs internal expansion state to match.
   * @returns {Set<PropertyKey>} */
  get expandedItems() {
    return this._expansion.getExpandedKeys();
  }

  /** @param {Iterable<PropertyKey>} value */
  set expandedItems(value) {
    this._expansion.syncFromExternal(value);
    this.requestUpdate("expandedItems");
  }

  /** Every `tvx-tree-item` in the tree, regardless of expand state.
   * @param {Element} root
   * @returns {IterableIterator<import("../components/tree-item/tree-item.js").TvxTreeItem>} */
  *allItems(root = this) {
    for (const child of root.children) {
      if (child.tagName === "TVX-TREE-ITEM") {
        yield /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (child);
        yield* this.allItems(child);
      } else if (child.tagName === "TVX-ITEM-SUB-TREE") {
        yield* this.allItems(child);
      }
    }
  }

  /** Pre-order DFS that stops descending into a collapsed node's children.
   * @param {Element} root
   * @returns {IterableIterator<import("../components/tree-item/tree-item.js").TvxTreeItem>} */
  *visibleItems(root = this) {
    for (const child of root.children) {
      if (child.tagName === "TVX-TREE-ITEM") {
        const item = /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (
          child
        );
        yield item;
        if (item.expanded) yield* this.visibleItems(item);
      } else if (child.tagName === "TVX-ITEM-SUB-TREE") {
        yield* this.visibleItems(child);
      }
    }
  }

  firstVisibleItem() {
    return this.visibleItems().next().value ?? null;
  }

  lastVisibleItem() {
    let last = null;
    for (const item of this.visibleItems()) last = item;
    return last;
  }

  /**
   * @param {Element} item
   * @returns {import("../components/tree-item/tree-item.js").TvxTreeItem | null}
   */
  firstChildItem(item) {
    for (const child of item.children) {
      if (child.tagName === "TVX-TREE-ITEM") {
        return /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (child);
      }
      if (child.tagName === "TVX-ITEM-SUB-TREE") return this.firstChildItem(child);
    }
    return null;
  }

  /** @param {PropertyKey} key */
  getItemByKey(key) {
    for (const item of this.allItems()) if (item.key === key) return item;
    return null;
  }

  /** Sets a single item's expansion state; no-ops if `id` isn't a currently-mounted item.
   * @param {{ id: PropertyKey, expand: boolean }} options */
  setItemExpansion({ id, expand }) {
    const item = this.getItemByKey(id);
    if (!item) return;
    if (expand) this._expansion.expand(item);
    else this._expansion.collapse(item);
  }

  /** @param {PropertyKey} id
   * @returns {boolean} `false` for an unknown or not-yet-mounted id. */
  isItemExpanded(id) {
    return this.getItemByKey(id)?.expanded ?? false;
  }

  /** Sets a single item's selection state; no-ops if `id` isn't a currently-mounted item. Only
   * touches `id` itself — no cascade to descendants/ancestors, even when `multiSelect` is on.
   * @param {{ id: PropertyKey, selected: boolean }} options */
  setItemSelection({ id, selected }) {
    const item = this.getItemByKey(id);
    if (!item) return;
    this._selection.setSelected(item, selected);
  }

  expandAll() {
    this._expansion.expandAll();
  }

  collapseAll() {
    this._expansion.collapseAll();
  }

  /** Direct child `tvx-tree-item`s of `root`, resolving through `tvx-item-sub-tree` wrappers.
   * @param {Element} root
   * @returns {IterableIterator<import("../components/tree-item/tree-item.js").TvxTreeItem>} */
  *directChildItems(root = this) {
    for (const child of root.children) {
      if (child.tagName === "TVX-TREE-ITEM") {
        yield /** @type {import("../components/tree-item/tree-item.js").TvxTreeItem} */ (child);
      } else if (child.tagName === "TVX-ITEM-SUB-TREE") {
        yield* this.directChildItems(child);
      }
    }
  }

  /** A fresh `IndexTree` snapshot of the live DOM, keyed by `item.key`, built on demand (never cached).
   * @returns {import("../core/index-tree.js").IndexTree<import("../components/tree-item/tree-item.js").TvxTreeItem>} */
  buildIndexTree() {
    return buildIndexTree([...this.directChildItems()], {
      getKey: (item) => item.key,
      getChildren: (item) => [...this.directChildItems(item)],
    });
  }

  /** Writes an announcement into the visually-hidden live region, clearing it first so repeated identical strings still get announced.
   * @param {string} message */
  announce(message) {
    const region = this._liveRegionRef.value;
    if (!region) return;
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }

  /** Coalesces scroll-into-view requests into one `requestAnimationFrame` per frame.
   * @param {Element | null | undefined} element */
  scrollElementIntoView(element) {
    if (!element) return;
    if (this._pendingScrollFrame !== null) cancelAnimationFrame(this._pendingScrollFrame);
    this._pendingScrollFrame = requestAnimationFrame(() => {
      this._pendingScrollFrame = null;
      if (!element.isConnected) return;
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  /** @param {CustomEvent<{ item: import("../components/tree-item/tree-item.js").TvxTreeItem }>} event */
  _onItemToggle(event) {
    this._expansion.toggle(event.detail.item);
    this._focus.focusNode(event.detail.item);
  }

  /** @param {CustomEvent<{ item: import("../components/tree-item/tree-item.js").TvxTreeItem, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean, checkbox: boolean }>} event */
  _onItemActivate(event) {
    const { item, ctrlKey, metaKey, shiftKey, checkbox } = event.detail;
    // A checkbox click always bypasses the ctrl/shift-click modifier semantics a plain row click
    // uses in multi-select mode, and always cascades (see `SelectionController
    // .selectCascading()`) — a leaf's "subtree" is just itself, but the upward half still runs, so
    // checking every leaf under a branch individually ends up selecting that branch too.
    if (checkbox) this._selection.selectCascading(item, this.buildIndexTree());
    else this._selection.activate(item, { ctrlKey, metaKey, shiftKey });
    this._focus.focusNode(item);
  }

  render() {
    return html`
      <div class="tree-view" part="tree">
        <slot></slot>
      </div>
      <div
        class="tree-view__live-region"
        aria-live="polite"
        aria-atomic="true"
        ${ref(this._liveRegionRef)}
      ></div>
    `;
  }
}
