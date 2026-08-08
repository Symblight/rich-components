/**
 * Assembles the `dataGridContext` value from the host and its controllers.
 * A plain function rather than a controller — it only reads current state
 * and returns a snapshot, no lifecycle hooks needed. Shared by both
 * `MdDataGrid` and `MdDataGridTree` (see `../tree/data-grid-tree.js`) — the
 * tree-related fields below read `host._tree`/`host.getDataPath`/etc
 * defensively (via `??`/`?.`) rather than assuming they exist, since a
 * plain `MdDataGrid` host has none of them. `MdDataGridCheckboxCell`/
 * `MdDataGridCheckboxHeader` are shared components consumed by both grid
 * variants and need one consistent, always-fully-populated context shape
 * regardless of which one built it — this stays a single function rather
 * than something `MdDataGridTree` overrides, specifically so that contract
 * can't drift between the two. The context's own `treeData` field is
 * derived from `Boolean(host.getDataPath)` rather than mirroring a host
 * property of the same name — `MdDataGridTree` has no such property itself
 * (it's always in tree *mode*; `getDataPath` alone activates hierarchical
 * rows), so this is the one place that boolean still gets computed for
 * consumers that need a simple yes/no (`MdDataGridCheckboxCell`, etc.).
 * @param {import("./data-grid.js").MdDataGrid & {
 *   getDataPath?: (row: Record<string, unknown>) => PropertyKey[] | undefined,
 *   treeDataExpandedGroupIds?: Set<PropertyKey>,
 *   _tree?: import("../controllers/data-grid-tree-controller.js").TreeController,
 *   _selectTreeDataGroup?: (id: PropertyKey) => void,
 * }} host
 * @returns {import("./data-grid-context.js").DataGridContextValue}
 */
export function buildDataGridContext(host) {
  const { firstRowIndex, lastRowIndex } = host._pagination.pageRange();

  return {
    rowHeight: host.rowHeight,
    getRowId: host.getRowId,
    focusedCell: host._focus.focusedCell,
    setCellFocus: (rowIndex, colIndex) =>
      host._focus.setCellFocus(rowIndex, colIndex),
    clearCellFocus: (rowIndex, colIndex) =>
      host._focus.clearCellFocus(rowIndex, colIndex),
    hasFocus: host._focus.hasFocus,
    focusedRegion: host._focus.focusedRegion,
    focusedHeaderColIndex: host._focus.focusedHeaderColIndex,
    setHeaderFocus: (colIndex) => host._focus.setHeaderFocus(colIndex),
    disableCellHighlight: host.disableCellHighlight,
    page: host.paginationModel?.page ?? 0,
    pageSize: host.paginationModel?.pageSize ?? host._pagination.rowCount,
    pageCount: host._pagination.pageCount,
    rowCount: host._pagination.rowCount,
    firstRowIndex,
    lastRowIndex,
    pageSizeOptions: host.pageSizeOptions,
    setPage: (page) => host._pagination.setPage(page),
    setPageSize: (pageSize) => host._pagination.setPageSize(pageSize),
    startColumnResize: (resizeColIndex, clientX) =>
      host._columnResize.startColumnResize(resizeColIndex, clientX),
    resizeColumn: (clientX) => host._columnResize.resizeColumn(clientX),
    endColumnResize: (clientX) => host._columnResize.endColumnResize(clientX),
    resizingColumnField: host._columnResize.resizingColumnField,
    // The checkbox column's own "select all" state (see
    // MdDataGridCheckboxHeader) needs to span the whole dataset regardless
    // of scroll/pagination/collapse state. Under treeData that means every
    // tree node — real rows *and* synthetic auto-generated groups — not
    // just host.rows, which `_toggleSelectAll()` already treats the same
    // way (see ../tree/data-grid-tree.js).
    rows: host.getDataPath ? (host._tree?.rows ?? []) : host.rows,
    rowSelectionModel: host.rowSelectionModel,
    disableMultipleRowSelection: host.disableMultipleRowSelection,
    toggleRowSelection: (row, rowIndex, modifiers) =>
      host._toggleRowSelection(row, rowIndex, modifiers),
    toggleSelectAll: () => host._toggleSelectAll(),
    detailPanelExpandedRowIds: host.detailPanelExpandedRowIds,
    hasDetailPanelContent: (row, rowIndex) =>
      host._detailPanel.hasContent(row, rowIndex),
    toggleDetailPanel: (id) => host._detailPanel.toggle(id),
    treeData: Boolean(host.getDataPath),
    treeDataExpandedGroupIds: host.treeDataExpandedGroupIds ?? new Set(),
    toggleTreeDataGroup: (id) => host._tree?.toggleExpanded(id),
    toggleTreeDataGroupSelection: (id) => host._selectTreeDataGroup?.(id),
    getRowDepth: (id) => host._tree?.getNode(id)?.depth ?? 0,
    hasChildren: (id) => (host._tree?.getNode(id)?.children.size ?? 0) > 0,
    getTreeDataCheckboxState: (id) =>
      host._tree?.getCheckboxState(id, host.rowSelectionModel) ?? {
        checked: false,
        indeterminate: false,
      },
    getGroupingKey: (id) => host._tree?.getNode(id)?.groupingKey,
  };
}
