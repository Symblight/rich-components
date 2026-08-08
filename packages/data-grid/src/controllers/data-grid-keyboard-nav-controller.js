/**
 * Interprets Arrow/Enter/Space-key navigation for `md-data-grid` and calls
 * into `host._focus` (a `FocusController`) to actually move focus — doesn't
 * own any focus state itself. Handles both the `cell` and `columnHeader`
 * regions (see `FocusController`), dispatching on `host._focus.
 * focusedRegion` — the header row and the row viewport are separate
 * sibling elements in the DOM, so a single `keydown` listener on their
 * shared `.data-grid` ancestor is what makes both reachable from one place;
 * see the listener's attachment point in `data-grid.js`.
 * Doesn't know about pagination or virtualization directly either —
 * `onKeydown()` takes row/column counts and an `ensureRowVisible` callback
 * as parameters, supplied by the host.
 */
export class KeyboardNavController {
  /** @param {import("../base/data-grid.js").MdDataGrid} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * @param {KeyboardEvent} event
   * @param {{ rowCount: number, colCount: number, ensureRowVisible: (rowIndex: number) => void }} params
   */
  onKeydown(event, { rowCount, colCount, ensureRowVisible }) {
    if (this.host._focus.focusedRegion === "columnHeader") {
      this._onHeaderKeydown(event, colCount);
      return;
    }
    this._onCellKeydown(event, { rowCount, colCount, ensureRowVisible });
  }

  /**
   * @param {KeyboardEvent} event
   * @param {{ rowCount: number, colCount: number, ensureRowVisible: (rowIndex: number) => void }} params
   */
  _onCellKeydown(event, { rowCount, colCount, ensureRowVisible }) {
    const { rowIndex, colIndex } = this.host._focus.focusedCell;

    // Row 0 is the top of the body — ArrowUp from there hands the grid's
    // single Tab stop to the column header instead of clamping in place,
    // mirroring the WAI-ARIA APG grid pattern's header/body transition.
    if (event.key === "ArrowUp" && rowIndex === 0) {
      event.preventDefault();
      this.host._focus.setHeaderFocus(colIndex);
      this.host._focus.focusHeader(colIndex);
      return;
    }

    const maxRowIndex = Math.max(rowCount - 1, 0);
    const maxColIndex = Math.max(colCount - 1, 0);

    let nextRowIndex = rowIndex;
    let nextColIndex = colIndex;

    switch (event.key) {
      case "ArrowDown":
        nextRowIndex = Math.min(rowIndex + 1, maxRowIndex);
        break;
      case "ArrowUp":
        nextRowIndex = Math.max(rowIndex - 1, 0);
        break;
      case "ArrowRight":
        nextColIndex = Math.min(colIndex + 1, maxColIndex);
        break;
      case "ArrowLeft":
        nextColIndex = Math.max(colIndex - 1, 0);
        break;
      default:
        return;
    }

    if (nextRowIndex === rowIndex && nextColIndex === colIndex) return;

    event.preventDefault();
    ensureRowVisible(nextRowIndex);
    this.host._focus.setCellFocus(nextRowIndex, nextColIndex);
    this.host._focus.focusCell(nextRowIndex, nextColIndex);
  }

  /**
   * @param {KeyboardEvent} event
   * @param {number} colCount
   */
  _onHeaderKeydown(event, colCount) {
    const colIndex = this.host._focus.focusedHeaderColIndex;
    const maxColIndex = Math.max(colCount - 1, 0);

    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        const nextColIndex =
          event.key === "ArrowRight"
            ? Math.min(colIndex + 1, maxColIndex)
            : Math.max(colIndex - 1, 0);
        if (nextColIndex === colIndex) return;
        event.preventDefault();
        this.host._focus.setHeaderFocus(nextColIndex);
        this.host._focus.focusHeader(nextColIndex);
        return;
      }
      case "ArrowDown":
        // Hands the Tab stop back to row 0 at the same column — the mirror
        // image of _onCellKeydown()'s ArrowUp-from-row-0 transition above.
        event.preventDefault();
        this.host._focus.setCellFocus(0, colIndex);
        this.host._focus.focusCell(0, colIndex);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const column = this.host._columns[colIndex];
        if (column && this.host._sort.isSortable(column)) {
          this.host._sort.toggleSort(column.field);
        }
        return;
      }
      default:
        return;
    }
  }
}
