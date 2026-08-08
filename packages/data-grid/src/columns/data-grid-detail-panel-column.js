import { html } from "lit";

import "../components/detail-toggle-cell/data-grid-detail-toggle-cell.js";

/**
 * Reserved `field` for the detail-panel toggle column — never a real row
 * field, so it can't collide with a user column.
 */
export const GRID_DETAIL_PANEL_TOGGLE_FIELD = "__detail_panel_toggle__";

/**
 * The column `md-data-grid` prepends to `columns` when `getDetailPanelContent`
 * is set. Same shape as `GRID_CHECKBOX_SELECTION_COL_DEF` — an ordinary
 * `DataGridColumn`, no special-cased rendering path inside the grid itself.
 * `width: 52` makes the cell a square matching the default row height;
 * `md-data-grid-detail-toggle-cell` sizes its icon-button's `::part(button)` to
 * `42px`, centered within that (a 5px margin on every side) rather than
 * filling it edge-to-edge. No `renderHeader` — unlike checkbox's "select
 * all", there's no default "expand all" equivalent, so the header cell for
 * this column just stays blank (matches MUI, which doesn't have one out of
 * the box either).
 * @type {import("../base/data-grid.js").DataGridColumn}
 */
export const GRID_DETAIL_PANEL_TOGGLE_COL_DEF = {
  field: GRID_DETAIL_PANEL_TOGGLE_FIELD,
  headerName: "",
  width: 52,
  resizable: false,
  sortable: false,
  rowSpannable: false,
  align: "center",
  cellClassName: "data-grid-cell_detail-toggle",
  renderCell: ({ row, rowIndex }) =>
    html`<md-data-grid-detail-toggle-cell
      .row=${row}
      .rowIndex=${rowIndex}
    ></md-data-grid-detail-toggle-cell>`,
};
