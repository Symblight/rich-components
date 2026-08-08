/**
 * Owns pagination math and mutation for `md-data-grid`. Reads/writes the
 * host's `rows`/`paginationModel`/`paginationMode`/`rowCount` properties
 * directly; doesn't know about virtualization or scroll — resetting scroll
 * on page change is wired up by the host, not here.
 */
export class PaginationController {
  /** @param {import("../base/data-grid.js").MdDataGrid} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * Rows sliced to the current page (client mode) or passed through as-is
   * (server mode / no pagination). Takes the rows to paginate as a param
   * (rather than always reading `host.rows` itself) so the host can run
   * them through sorting first — see `SortController`.
   * @param {Record<string, unknown>[]} [rows]
   */
  effectiveRows(rows = this.host.rows) {
    const { paginationModel, paginationMode } = this.host;
    if (!paginationModel || paginationMode === "server") return rows;
    const { page, pageSize } = paginationModel;
    const firstRowIndex = Math.min(
      pageSize * page,
      Math.max(rows.length - 1, 0),
    );
    const lastRowIndex = Math.min(
      firstRowIndex + pageSize - 1,
      rows.length - 1,
    );
    return rows.slice(firstRowIndex, lastRowIndex + 1);
  }

  /** @returns {number} */
  get rowCount() {
    const { rowCount, rows } = this.host;
    return rowCount !== undefined ? rowCount : rows.length;
  }

  /** @returns {number} */
  get pageCount() {
    const { paginationModel } = this.host;
    if (!paginationModel) return 1;
    return Math.max(1, Math.ceil(this.rowCount / paginationModel.pageSize));
  }

  /** @returns {{ firstRowIndex: number, lastRowIndex: number }} */
  pageRange() {
    const { paginationModel } = this.host;
    const rowCount = this.rowCount;
    if (!paginationModel) {
      return { firstRowIndex: 0, lastRowIndex: Math.max(rowCount - 1, 0) };
    }
    const { page, pageSize } = paginationModel;
    const firstRowIndex = Math.min(pageSize * page, Math.max(rowCount - 1, 0));
    const lastRowIndex = Math.min(firstRowIndex + pageSize - 1, rowCount - 1);
    return { firstRowIndex, lastRowIndex };
  }

  /** @param {number} page */
  setPage(page) {
    const { paginationModel } = this.host;
    if (!paginationModel) return;
    const clamped = Math.min(Math.max(page, 0), this.pageCount - 1);
    if (clamped === paginationModel.page) return;
    this.host.paginationModel = { ...paginationModel, page: clamped };
    this._dispatchChange();
  }

  /** @param {number} pageSize */
  setPageSize(pageSize) {
    const { paginationModel } = this.host;
    if (!paginationModel) return;
    this.host.paginationModel = { page: 0, pageSize };
    this._dispatchChange();
  }

  /** @private */
  _dispatchChange() {
    this.host.dispatchEvent(
      new CustomEvent("md-data-grid-pagination-model-change", {
        detail: { ...this.host.paginationModel },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
