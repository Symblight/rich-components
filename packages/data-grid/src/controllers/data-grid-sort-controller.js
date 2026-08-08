/**
 * Owns column sorting for `md-data-grid`. Reads/writes the host's
 * `sortModel`/`columns`/`disableColumnSorting` directly. Single-column sort
 * only — clicking a header's title replaces `sortModel` wholesale rather
 * than accumulating entries, matching the `sortModel: [{ field, sort:
 * 'rating' }]` shape the host is initialized/controlled with (still an
 * array, so a future multi-sort mode wouldn't be a breaking API change).
 */
export class SortController {
  /** @param {import("../base/data-grid.js").MdDataGrid} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * @param {import("../base/data-grid.js").DataGridColumn} column
   * @returns {boolean}
   */
  isSortable(column) {
    if (this.host.disableColumnSorting) return false;
    return column.sortable !== false;
  }

  /**
   * A column's current sort direction, or `undefined` if it isn't the
   * active sort field (or its `sort` is explicitly `null`/`undefined` —
   * present in the model but the rule doesn't apply).
   * @param {string} field
   * @returns {"asc" | "desc" | undefined}
   */
  getSort(field) {
    return (
      this.host.sortModel.find((item) => item.field === field)?.sort ??
      undefined
    );
  }

  /**
   * Cycles a column's sort: none -> asc -> desc -> none. Replaces
   * `sortModel` wholesale (single-column sort) and dispatches
   * `md-data-grid-sort-model-change`.
   * @param {string} field
   */
  toggleSort(field) {
    const current = this.getSort(field);
    const next =
      current === "asc" ? "desc" : current === "desc" ? undefined : "asc";
    this.host.sortModel = next ? [{ field, sort: next }] : [];
    this.host.dispatchEvent(
      new CustomEvent("md-data-grid-sort-model-change", {
        detail: [...this.host.sortModel],
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Builds a pairwise comparator for the currently active `sortModel`, or
   * `null` when nothing is actively sorting (an entry's `sort` is
   * `null`/`undefined`, or `sortModel` is empty) — callers treat `null` as
   * "leave order alone." Extracted as a factory (computed once) rather than
   * a bare `compareRows(a, b)` method precisely so `active`/`columnsByField`
   * aren't recomputed on every pairwise comparison — `sortedRows()` below
   * calls this once per sort; `TreeController.sortedVisibleRows()` calls it
   * once per render pass and reuses the same comparator across every
   * group's own `.sort()`, which is the whole reason this needed pulling
   * out of the single flat `.sort()` call it used to live inside.
   * @returns {((a: Record<string, unknown>, b: Record<string, unknown>) => number) | null}
   */
  createComparator() {
    const active = this.host.sortModel.filter((item) => item.sort);
    if (active.length === 0) return null;

    const columnsByField = new Map(
      this.host.columns.map((column) => [column.field, column]),
    );

    return (a, b) => {
      for (const { field, sort } of active) {
        const column = columnsByField.get(field);
        const cmp = this._compare(
          this._valueFor(a, column, field),
          this._valueFor(b, column, field),
        );
        if (cmp !== 0) return sort === "desc" ? -cmp : cmp;
      }
      return 0;
    };
  }

  /**
   * `rows` sorted per `host.sortModel`. Entries whose `sort` is
   * `null`/`undefined` are skipped (their rule doesn't apply). Returns
   * `rows` itself (no copy) when nothing is actually sorting, so callers
   * can cheaply tell "did this change anything" via reference equality.
   * @param {Record<string, unknown>[]} rows
   * @returns {Record<string, unknown>[]}
   */
  sortedRows(rows) {
    const comparator = this.createComparator();
    return comparator ? rows.slice().sort(comparator) : rows;
  }

  /**
   * @private
   * @param {Record<string, unknown>} row
   * @param {import("../base/data-grid.js").DataGridColumn | undefined} column
   * @param {string} field
   * @returns {unknown}
   */
  _valueFor(row, column, field) {
    const raw = row[field];
    return column?.valueGetter
      ? column.valueGetter({ row, column, rowIndex: -1, value: raw })
      : raw;
  }

  /**
   * @private
   * @param {unknown} a
   * @param {unknown} b
   * @returns {number}
   */
  _compare(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "boolean" && typeof b === "boolean")
      return Number(a) - Number(b);
    return String(a).localeCompare(String(b));
  }
}
