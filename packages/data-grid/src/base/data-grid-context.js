import { createContext } from "@lit/context";

/**
 * @typedef {object} DataGridContextValue
 * @property {number | "auto"} rowHeight
 * @property {(row: Record<string, unknown>) => string | number} getRowId
 * @property {{ rowIndex: number, colIndex: number }} focusedCell
 * @property {(rowIndex: number, colIndex: number) => void} setCellFocus
 * @property {(rowIndex: number, colIndex: number) => void} clearCellFocus // drops the highlight on blur — no-op if (rowIndex, colIndex) isn't the currently-focused cell
 * @property {boolean} hasFocus             // false until the user has actually clicked/navigated into a cell — focusedCell's (0,0) default doesn't count
 * @property {"cell" | "columnHeader"} focusedRegion // which one owns the grid's single Tab stop right now
 * @property {number} focusedHeaderColIndex
 * @property {(colIndex: number) => void} setHeaderFocus
 * @property {boolean} disableCellHighlight // when true, md-data-grid-cell skips the focused-cell border highlight
 * @property {number} page                 // current page index, 0 when pagination disabled
 * @property {number} pageSize
 * @property {number} pageCount
 * @property {number} rowCount
 * @property {number} firstRowIndex        // 0-based index of first row on the current page
 * @property {number} lastRowIndex         // 0-based index of last row on the current page
 * @property {number[]} pageSizeOptions    // choices shown in the "Rows per page" selector
 * @property {(page: number) => void} setPage
 * @property {(pageSize: number) => void} setPageSize
 * @property {(resizeColIndex: number, clientX: number) => void} startColumnResize
 * @property {(clientX: number) => void} resizeColumn
 * @property {(clientX: number) => void} endColumnResize
 * @property {string | undefined} resizingColumnField // field of the column currently being drag-resized, or undefined when no resize is in progress — mirrors MUI X's resizingColumnField grid-state field
 * @property {Record<string, unknown>[]} rows                 // the whole dataset, unsorted/unpaginated — only used for the checkbox column's "select all" state, which spans every page
 * @property {Set<PropertyKey>} rowSelectionModel
 * @property {boolean} disableMultipleRowSelection             // when true, md-data-grid-checkbox-header renders nothing — "select all" doesn't apply to single-row selection
 * @property {(row: Record<string, unknown>, rowIndex: number, modifiers: { shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }) => void} toggleRowSelection
 * @property {() => void} toggleSelectAll
 * @property {Set<PropertyKey>} detailPanelExpandedRowIds
 * @property {(row: Record<string, unknown>, rowIndex: number) => boolean} hasDetailPanelContent // whether this row has anything to show — read by md-data-grid-detail-toggle-cell to decide whether to render an affordance at all
 * @property {(id: PropertyKey) => void} toggleDetailPanel
 * @property {boolean} treeData
 * @property {Set<PropertyKey>} treeDataExpandedGroupIds
 * @property {(id: PropertyKey) => void} toggleTreeDataGroup // expand/collapse a group's children — mirrors the public MdDataGrid method of the same name
 * @property {(id: PropertyKey) => void} toggleTreeDataGroupSelection // a group checkbox's cascading select/deselect — distinct from toggleTreeDataGroup above (expand/collapse), keyed directly by the tree node's id since a synthetic group has no real row to resolve via getRowId()
 * @property {(id: PropertyKey) => number} getRowDepth
 * @property {(id: PropertyKey) => boolean} hasChildren
 * @property {(id: PropertyKey) => { checked: boolean, indeterminate: boolean }} getTreeDataCheckboxState
 * @property {(id: PropertyKey) => PropertyKey | undefined} getGroupingKey // the raw path segment a tree node was built from — real or synthetic alike (see TreeController's own `groupingKey` field) — the grouping column's default label when no valueGetter override is given
 */

/** @type {import("@lit/context").Context<symbol, DataGridContextValue>} */
export const dataGridContext = createContext(Symbol("data-grid"));
