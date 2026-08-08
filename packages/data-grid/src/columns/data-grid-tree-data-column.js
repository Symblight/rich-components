import { html } from "lit";

import "../components/tree-toggle-cell/data-grid-tree-toggle-cell.js";

/**
 * Reserved `field` for the treeData grouping/toggle column — never a real
 * row field, so it can't collide with a user column. Mirrors
 * `GRID_CHECKBOX_SELECTION_FIELD`/`GRID_DETAIL_PANEL_TOGGLE_FIELD`.
 */
export const GRID_TREE_DATA_GROUPING_FIELD = "__tree_data_group__";

/**
 * Base definition for the treeData grouping column — same shape as
 * `GRID_CHECKBOX_SELECTION_COL_DEF`/`GRID_DETAIL_PANEL_TOGGLE_COL_DEF`, an
 * ordinary `DataGridColumn`, no special-cased rendering path inside the
 * grid itself. Unlike those two (fixed-width, icon-only), this column
 * carries a variable-length label alongside the toggle, so it stays
 * resizable (default `true`, left unset) with a `minWidth` floor rather
 * than a fixed `width`.
 *
 * A future `autoGroupColumnDef` grid property will let consumers override
 * `headerName`/`valueGetter`/etc. by shallow-merging onto this base — not
 * wired up yet (tracked alongside `_columns`/`_effectiveRows` treeData
 * rendering wiring, the next slice of this feature).
 * @type {import("../base/data-grid.js").DataGridColumn}
 */
export const GRID_TREE_DATA_GROUPING_COL_DEF = {
  field: GRID_TREE_DATA_GROUPING_FIELD,
  headerName: "Group",
  minWidth: 160,
  sortable: false,
  rowSpannable: false,
  renderCell: ({ row, column, rowIndex }) =>
    html`<md-data-grid-tree-toggle-cell
      .row=${row}
      .column=${column}
      .rowIndex=${rowIndex}
    ></md-data-grid-tree-toggle-cell>`,
};
