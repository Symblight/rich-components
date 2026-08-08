import { customElement } from "lit/decorators.js";

import { MdDataGrid } from "../base/data-grid.js";
import { TreeController } from "../controllers/data-grid-tree-controller.js";
import { GRID_TREE_DATA_GROUPING_COL_DEF } from "../columns/data-grid-tree-data-column.js";
import { buildDataGridContext } from "../base/data-grid-build-context.js";
import { treeDataProperties } from "./data-grid-tree-properties.js";

/** @typedef {import("../base/data-grid.js").DataGridColumn} DataGridColumn */

/**
 * @tag md-data-grid-tree
 * @summary `md-data-grid` with hierarchical rows — extends `MdDataGrid`
 * rather than being an opt-in flag on it, so consumers who don't need tree
 * data never pay for `TreeController` or `md-data-grid-tree-toggle-cell` in
 * their bundle (this file is the only thing that imports either, and it's
 * never re-exported from `data-grid/index.js` — see that file's own
 * comment). First step of a longer-term plan to offer further paid tiers
 * (`MdDataGridLazy`/`MdDataGridLazyTree`) the same way, modeled on how MUI X
 * ships `DataGridPro`/`DataGridPremium` as separate classes extending a base
 * `DataGrid` — lazy-loading/licensing pieces are a separate, later effort.
 *
 * Always tree mode — unlike the `treeData` boolean flag this replaced,
 * there's no separate on/off switch: the tag itself is the activation
 * signal, and `getDataPath` alone (with no second flag to also set) turns
 * hierarchical rows on.
 */
@customElement("md-data-grid-tree")
export class MdDataGridTree extends MdDataGrid {
  static properties = treeDataProperties;

  constructor() {
    super();

    /** @type {((row: Record<string, unknown>) => PropertyKey[] | undefined) | undefined} */
    this.getDataPath = undefined;

    /** @type {Set<PropertyKey>} */
    this.treeDataExpandedGroupIds = new Set();

    /**
     * Shallow-merged onto `GRID_TREE_DATA_GROUPING_COL_DEF` — same shape as
     * an ordinary `DataGridColumn`, lets you override `headerName`/
     * `valueGetter`/etc. for the grouping/toggle column without redefining
     * it from scratch.
     * @type {Partial<DataGridColumn> | undefined}
     */
    this.autoGroupColumnDef = undefined;

    this._tree = new TreeController(this);
    this._tree.build(this.rows);

    // The base constructor (already run, via super() above) built and
    // stored dataGridContext before any of this subclass's own fields
    // existed — harmless in practice (defaults captured then already match
    // what's set above), but rebuilding once more here removes any doubt
    // rather than relying on that coincidence.
    this._gridContextProvider.setValue(buildDataGridContext(this));
  }

  /**
   * Must run before `super.willUpdate()` — the base class's own
   * `willUpdate()` rebuilds `dataGridContext` from current state (see
   * `_contextDependencies()` below), which reads `this._tree` — a stale
   * pre-change tree here would make the very update that changed
   * `rows`/`getDataPath` render against the *previous* tree instead of the
   * new one, one full cycle late.
   * @param {import("lit").PropertyValues} changed
   */
  willUpdate(changed) {
    if (
      changed.has("rows") ||
      changed.has("getRowId") ||
      changed.has("getDataPath")
    ) {
      this._tree.build();
    }
    super.willUpdate(changed);
  }

  /** @returns {string[]} */
  _contextDependencies() {
    return [
      ...super._contextDependencies(),
      "getDataPath",
      "treeDataExpandedGroupIds",
      "autoGroupColumnDef",
    ];
  }

  /** @returns {string[]} */
  _selectionResetDependencies() {
    return [...super._selectionResetDependencies(), "treeDataExpandedGroupIds"];
  }

  /**
   * Collapse-aware, hierarchy-preserving flattening of the tree — sorting
   * happens *within* each group's own children (see
   * `TreeController.sortedVisibleRows()`), never across the whole tree at
   * once, so the hierarchy itself is never disturbed by `sortModel`.
   * `getDataPath` unset stays flat (falls back to `super._sortedRows`) —
   * this class is always in tree *mode*, but with nothing to build a path
   * from there's nothing to nest.
   */
  get _sortedRows() {
    if (!this.getDataPath) return super._sortedRows;
    return this._tree.sortedVisibleRows(
      this._sort.createComparator(),
      this.treeDataExpandedGroupIds,
    );
  }

  /**
   * @param {DataGridColumn[]} cols
   * @returns {DataGridColumn[]}
   */
  _withLeadingColumns(cols) {
    return this.getDataPath
      ? [
          { ...GRID_TREE_DATA_GROUPING_COL_DEF, ...this.autoGroupColumnDef },
          ...cols,
        ]
      : cols;
  }

  /**
   * With checkboxSelection on, a plain row click goes through the same
   * cascading path as the checkbox itself (`_toggleRowSelection` ->
   * `_selectTreeDataGroup`) rather than the flat single-row `super()`
   * fallback — otherwise checking a box cascades to the parent but clicking
   * the row it's on doesn't, which reads as broken rather than as two
   * intentionally different selection modes. Without checkboxSelection
   * there's no checkbox to be consistent with, so a plain click keeps the
   * base class's single-row/shift/ctrl highlight-selection behavior.
   * @param {MouseEvent} event
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @param {Record<string, unknown>[]} rows
   */
  _handleRowSelectionClick(event, row, rowIndex, rows) {
    if (this.checkboxSelection && this.getDataPath) {
      this._toggleRowSelection(row, rowIndex, {
        shiftKey: event.shiftKey,
        ctrlKey: true,
        metaKey: true,
      });
      return;
    }
    super._handleRowSelectionClick(event, row, rowIndex, rows);
  }

  /**
   * Checkbox-cell click path (via `dataGridContext.toggleRowSelection`),
   * also reused by `_handleRowSelectionClick()` above for a plain row click
   * once checkboxSelection is on — see that call site's own comment for why
   * the two need to agree. Keyed by the tree node's own `.key` rather than
   * `getRowId(row)` — same reasoning as
   * `RowSelectionController._rowId()`/`MdDataGridCheckboxCell._id()`: `row`
   * here can be a synthetic auto-generated group with no real fields for
   * `getRowId()` to read at all.
   * @param {Record<string, unknown>} row
   * @param {number} rowIndex
   * @param {{ shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} modifiers
   */
  _toggleRowSelection(row, rowIndex, modifiers) {
    if (!this.getDataPath) {
      super._toggleRowSelection(row, rowIndex, modifiers);
      return;
    }
    this._selectTreeDataGroup(
      /** @type {PropertyKey} */ (
        /** @type {{ key: PropertyKey }} */ (row).key
      ),
    );
  }

  /**
   * A group checkbox's cascading select/deselect, including upward
   * propagation to ancestors (see `TreeController
   * .computeCascadingSelection()`'s own doc comment for why that's needed —
   * without it, checking every child individually, never the parent's own
   * checkbox, would leave the parent permanently `indeterminate`). Named
   * distinctly from the public `toggleTreeDataGroup(id)` below, which
   * expands/collapses a group's *children* rather than selecting them — the
   * two are unrelated concepts that happen to both apply to a "group id"
   * and are easy to conflate by name alone. Keyed directly by the tree
   * node's id rather than a row object — a synthetic group has no real row
   * to resolve via `getRowId()`.
   * @param {PropertyKey} id
   */
  _selectTreeDataGroup(id) {
    this._selection.applyIds(
      this._tree.computeCascadingSelection(id, this.rowSelectionModel),
    );
  }

  /** Header checkbox "select all" — spans real rows and synthetic group ids too, matching `TreeController.rows`' own collapse-state-ignorant "whole dataset" contract. */
  _toggleSelectAll() {
    if (!this.getDataPath) {
      super._toggleSelectAll();
      return;
    }
    const ids = /** @type {PropertyKey[]} */ (
      this._tree.rows.map((node) => node.key)
    );
    this._selection.toggleAllIds(ids);
  }

  /**
   * Expands/collapses one tree-data group's children, by group id (real
   * row id, or a synthetic auto-generated group's own id).
   * @param {PropertyKey} id
   */
  toggleTreeDataGroup(id) {
    this._tree.toggleExpanded(id);
  }

  /** @param {Set<PropertyKey>} ids */
  setExpandedTreeDataGroups(ids) {
    this._tree.setExpanded(ids);
  }
}
