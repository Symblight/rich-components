/**
 * `MdDataGrid.properties` body, split out purely to shrink `data-grid.js`
 * (per `.claude/plans/data-grid-file-split-plan.md` Phase 1c) — a plain
 * object literal with no closures, safe to hoist verbatim. `data-grid.js`
 * assigns `static properties = dataGridProperties;`.
 * @type {import("lit").PropertyDeclarations}
 */
export const dataGridProperties = {
  // noAccessor: true — a custom get/set pair is defined below instead, so
  // an assignment while <md-data-grid-column> children are present can
  // warn (DeclarativeColumnsController.sync() is the one legitimate writer
  // in that case, and marks itself via _isSyncing so its own writes don't
  // trip the warning).
  columns: { state: true, noAccessor: true },
  rows: { state: true },
  rowHeight: {
    attribute: "row-height",
    converter: {
      fromAttribute: (value) => (value === "auto" ? "auto" : Number(value)),
      toAttribute: (value) => String(value),
    },
  },
  headerHeight: { type: Number, attribute: "header-height" },
  overscan: { type: Number },
  getRowId: { state: true },
  getRowClassName: { state: true },
  paginationModel: { state: true },
  paginationMode: { attribute: "pagination-mode" },
  pageSizeOptions: { state: true },
  rowCount: { type: Number, attribute: "row-count" },
  sortModel: { state: true },
  rowSpanning: { type: Boolean, attribute: "row-spanning", reflect: true },
  loading: { type: Boolean, attribute: "loading", reflect: true },
  rowSelectionModel: { state: true },
  hidePagination: {
    type: Boolean,
    attribute: "hide-pagination",
    reflect: true,
  },
  disableCellHighlight: {
    type: Boolean,
    attribute: "disable-cell-highlight",
    reflect: true,
  },
  disableColumnResize: {
    type: Boolean,
    attribute: "disable-column-resize",
    reflect: true,
  },
  disableColumnSorting: {
    type: Boolean,
    attribute: "disable-column-sorting",
    reflect: true,
  },
  disableMultipleRowSelection: {
    type: Boolean,
    attribute: "disable-multiple-row-selection",
    reflect: true,
  },
  disableRowSelectionOnClick: {
    type: Boolean,
    attribute: "disable-row-selection-on-click",
    reflect: true,
  },
  checkboxSelection: {
    type: Boolean,
    attribute: "checkbox-selection",
    reflect: true,
  },
  getDetailPanelContent: { state: true },
  detailPanelExpandedRowIds: { state: true },
};
