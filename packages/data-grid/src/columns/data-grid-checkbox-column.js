import { html } from "lit";

import "../components/checkbox-cell/data-grid-checkbox-cell.js";
import "../components/checkbox-header/data-grid-checkbox-header.js";

/**
 * Reserved `field` for the checkbox column — never a real row field, so it
 * can't collide with a user column.
 */
export const GRID_CHECKBOX_SELECTION_FIELD = "__check__";

/**
 * The column `md-data-grid` prepends to `columns` when `checkboxSelection`
 * is on. An ordinary `DataGridColumn` like any other — `renderCell`/
 * `renderHeader` just render `md-data-grid-checkbox-cell`/
 * `md-data-grid-checkbox-header`, which read/write selection through
 * `dataGridContext` (the same channel `setCellFocus` and column-resize
 * already use) rather than needing anything from `params` beyond `row`/
 * `rowIndex` — this column has no special-cased rendering path inside the
 * grid itself.
 * @type {import("../base/data-grid.js").DataGridColumn}
 */
export const GRID_CHECKBOX_SELECTION_COL_DEF = {
  field: GRID_CHECKBOX_SELECTION_FIELD,
  headerName: "",
  width: 56,
  resizable: false,
  sortable: false,
  rowSpannable: false,
  align: "center",
  headerClassName: "data-grid-header-cell_checkbox",
  cellClassName: "data-grid-cell_checkbox",
  renderHeader: () =>
    html`<md-data-grid-checkbox-header></md-data-grid-checkbox-header>`,
  renderCell: ({ row, rowIndex }) =>
    html`<md-data-grid-checkbox-cell
      .row=${row}
      .rowIndex=${rowIndex}
    ></md-data-grid-checkbox-cell>`,
};
