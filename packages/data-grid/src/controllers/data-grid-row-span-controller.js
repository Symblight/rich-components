/**
 * @typedef {object} DataGridRowSpanInfo
 * @property {boolean} owner  // true: this row starts a run and should render this column's cell rowHeight * span tall. false: covered by an earlier owner in this column — render nothing.
 * @property {number} [span]  // only present when owner is true
 */

/**
 * Owns MUI-style "row spanning" for `md-data-grid`: consecutive rows with
 * an equal value in a column merge into one taller cell. Opt-in via the
 * host's `rowSpanning` flag (off by default — unlike resize/sort, silently
 * merging cells is a real behavior change a consumer should ask for).
 *
 * Rendering itself doesn't live here — `md-data-grid-cell` paints a spanning
 * cell by growing past its own row's box (`height: rowHeight * span` +
 * `overflow: visible`) rather than the row's own layout changing at all,
 * so virtualization's scroll/height math never needs to know spanning
 * exists. The tradeoff: if a run's owner (first) row scrolls outside the
 * virtualized window while covered rows are still visible, those rows
 * render blank for that column until scrolled back — documented in the
 * README, not solved here.
 */
export class RowSpanController {
  /** @param {import("../base/data-grid.js").MdDataGrid} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * @param {import("../base/data-grid.js").DataGridColumn} column
   * @returns {boolean}
   */
  isSpannable(column) {
    if (!this.host.rowSpanning) return false;
    if (this.host.rowHeight === "auto") return false;
    // Disallowed for now — a cell that's simultaneously wider AND taller
    // than normal turns the covered-cell bookkeeping into a 2D problem
    // instead of two independent 1D ones, for a combination MUI itself
    // flags as needing careful testing.
    if ((column.colSpan ?? 1) > 1) return false;
    return column.rowSpannable !== false;
  }

  /**
   * Row-span info for every spannable column, computed over `rows` (the
   * exact post-sort, post-pagination list about to be rendered — so runs
   * can never cross a page boundary, and re-sorting naturally re-detects
   * runs against the new adjacency). Empty when `rowSpanning` is off.
   * @param {Record<string, unknown>[]} rows
   * @returns {Map<string, DataGridRowSpanInfo[]>} keyed by column field, each value parallel to `rows`
   */
  computeSpans(rows) {
    const spans = new Map();
    if (!this.host.rowSpanning) return spans;

    for (const column of this.host.columns) {
      if (!this.isSpannable(column)) continue;
      spans.set(column.field, this._computeColumnSpans(rows, column));
    }
    return spans;
  }

  /**
   * @private
   * @param {Record<string, unknown>[]} rows
   * @param {import("../base/data-grid.js").DataGridColumn} column
   * @returns {DataGridRowSpanInfo[]}
   */
  _computeColumnSpans(rows, column) {
    const infos = new Array(rows.length);
    let runStart = 0;

    for (let i = 1; i <= rows.length; i++) {
      const sameAsPrevious =
        i < rows.length &&
        this._spanKey(rows[i], column) === this._spanKey(rows[i - 1], column);
      if (sameAsPrevious) continue;

      infos[runStart] = { owner: true, span: i - runStart };
      for (let covered = runStart + 1; covered < i; covered++) {
        infos[covered] = { owner: false };
      }
      runStart = i;
    }

    return infos;
  }

  /**
   * Equality key for a row's value in `column`, for run detection. Uses
   * `===` — wrap values in `rowSpanValueGetter` for custom grouping/equality
   * (e.g. rounding, case-insensitivity) beyond strict equality.
   * @private
   * @param {Record<string, unknown>} row
   * @param {import("../base/data-grid.js").DataGridColumn} column
   * @returns {unknown}
   */
  _spanKey(row, column) {
    const raw = row[column.field];
    if (column.rowSpanValueGetter) {
      return column.rowSpanValueGetter({
        row,
        column,
        rowIndex: -1,
        value: raw,
      });
    }
    if (column.valueGetter) {
      return column.valueGetter({ row, column, rowIndex: -1, value: raw });
    }
    return raw;
  }
}
