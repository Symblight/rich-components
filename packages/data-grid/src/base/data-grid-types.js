/**
 * Shared `md-data-grid` JSDoc typedefs, split out of `data-grid.js` (per
 * `.claude/plans/data-grid-file-split-plan.md` Phase 1a) purely to shrink
 * that file — `data-grid.js` re-declares each of these as a one-line
 * forwarding `@typedef {import("./data-grid-types.js").X} X` so every
 * existing `import("./data-grid.js").DataGridColumn`-style reference
 * elsewhere in this package keeps working unchanged.
 */

/**
 * @typedef {object} DataGridColumn
 * @property {string} field
 * @property {string} [headerName]
 * @property {number} [width]        // px; omitted columns share remaining space (grid `1fr`)
 * @property {number} [minWidth]     // px; only applies when `width` is unset — floor on the flexible column
 * @property {number} [maxWidth]     // px; only applies when `width` is unset — ceiling on the flexible column
 * @property {number} [colSpan]      // default 1; spans this many column tracks in the header AND every row — the next (colSpan - 1) columns render no header/data cell of their own for that row
 * @property {boolean} [resizable]   // default true — set false to opt this column out of drag-to-resize
 * @property {boolean} [sortable]    // default true — set false to opt this column out of click-to-sort
 * @property {boolean} [rowSpannable] // default true — set false to opt this column out of row spanning when the grid's rowSpanning is on
 * @property {"left" | "right" | "center"} [align]  // default "left"
 * @property {(params: DataGridCellParams) => unknown} [valueGetter]
 * @property {(params: DataGridCellParams) => import("lit").TemplateResult | string | number} [renderCell]
 * @property {(column: DataGridColumn) => import("lit").TemplateResult | string} [renderHeader]
 * @property {(params: DataGridCellParams) => unknown} [rowSpanValueGetter] // computes the equality key used to detect consecutive-equal-value runs; falls back to valueGetter, then the raw field value
 * @property {string | ((params: DataGridCellParams) => string)} [cellClassName] // extra class name(s) (space-separated) applied to every md-data-grid-cell in this column — a plain string, or computed per cell
 * @property {string | ((column: DataGridColumn) => string)} [headerClassName] // extra class name(s) (space-separated) applied to this column's md-data-grid-header-cell — a plain string, or computed from the column
 */

/**
 * @typedef {object} DataGridCellParams
 * @property {Record<string, unknown>} row
 * @property {DataGridColumn} column
 * @property {number} rowIndex
 * @property {unknown} value
 */

/**
 * @typedef {object} DataGridPaginationModel
 * @property {number} page
 * @property {number} pageSize
 */

/**
 * One entry of `sortModel`. `sort: null | undefined` means the field is
 * tracked but the rule doesn't apply (no active direction) — distinct from
 * omitting the entry entirely, but both render/sort the same way.
 * @typedef {object} DataGridSortItem
 * @property {string} field
 * @property {"asc" | "desc" | null | undefined} sort
 */

/**
 * An entry for `updateRows()`. Matched against existing rows via
 * `getRowId()`. Without `_action`, the entry shallow-merges onto the
 * existing row (or is inserted as a new row if no match is found). With
 * `_action: "delete"`, the matching row is removed.
 * @typedef {Record<string, unknown> & { _action?: "delete" }} DataGridRowUpdate
 */

// Forces this file to be treated as a module (rather than a global script)
// so `import("./data-grid-types.js").X`-style type references resolve —
// there's otherwise no runtime import/export in a JSDoc-typedef-only file.
export {};
