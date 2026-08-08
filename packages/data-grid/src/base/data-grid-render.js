import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";

import {
  SKELETON_ROW_COUNT,
  skeletonWidth,
  clampColSpan,
} from "./data-grid-constants.js";

/**
 * `render()`'s three biggest template blocks (header-cell loop,
 * skeleton-rows, and the per-item row loop body), split out purely to
 * shrink `data-grid.js` (per `.claude/plans/data-grid-file-split-plan.md`
 * Phase 2) — plain functions of already-computed values, no state or
 * lifecycle of their own, same tier as `data-grid-build-context.js`.
 * `renderRow` in particular preserves the exact same `repeat()` call/key
 * and DOM shape `render()` already produced: it's called from *inside* the
 * same `repeat(visibleItems, (_item, i) => i, ...)` in `data-grid.js`, so
 * the DOM-recycling contract `_measureAutoRows()` depends on (row divs
 * rebound to a different row while scrolling, tracked via `data-index`) is
 * untouched — this is template code moved to another file, not a change to
 * what gets rendered.
 */

/**
 * The header row's per-column `<md-data-grid-header-cell>` loop, including the
 * colSpan-skip bookkeeping (a column's `colSpan` merges the header cell
 * across N tracks; the next `colSpan - 1` columns render nothing here).
 * @param {import("./data-grid.js").MdDataGrid} host
 * @param {import("./data-grid-types.js").DataGridColumn[]} columns
 * @returns {unknown} a `repeat()` directive result, usable directly inside an `html` template
 */
export function renderHeaderCells(host, columns) {
  let coveredUntil = -1;
  return repeat(
    columns,
    (column) => column.field,
    (column, colIndex) => {
      if (colIndex <= coveredUntil) return nothing;
      const span = clampColSpan(columns, colIndex);
      coveredUntil = colIndex + span - 1;
      const resizeColIndex = coveredUntil;
      const resizable = host._columnResize.isResizable(column, resizeColIndex);
      const sortable = host._sort.isSortable(column);
      const sort = host._sort.getSort(column.field);
      return html`
        <md-data-grid-header-cell
          exportparts="separator, title, sort-icon"
          .column=${column}
          .colIndex=${colIndex}
          .colSpan=${span}
          .resizeColIndex=${resizeColIndex}
          .resizable=${resizable}
          .sortable=${sortable}
          .sort=${sort}
          @click=${() => {
            if (sortable) host._sort.toggleSort(column.field);
          }}
        ></md-data-grid-header-cell>
      `;
    },
  );
}

/**
 * `this.loading && effectiveRows.length === 0`'s placeholder rows — pure
 * function of `columns` + the two already-resolved size values, no
 * controller reads, no host reference needed.
 * @param {import("./data-grid-types.js").DataGridColumn[]} columns
 * @param {string} gridTemplateColumns
 * @param {number} skeletonRowHeight
 * @returns {import("lit").TemplateResult}
 */
export function renderSkeletonRows(
  columns,
  gridTemplateColumns,
  skeletonRowHeight,
) {
  return html`
    <div class="data-grid__skeleton-rows" part="skeleton-rows">
      ${Array.from(
        { length: SKELETON_ROW_COUNT },
        (_, rowIndex) => html`
          <div
            class="data-grid__row"
            part="row"
            style="grid-template-columns: ${gridTemplateColumns}; height: ${skeletonRowHeight}px;"
          >
            ${columns.map(
              (_column, colIndex) => html`
                <div class="data-grid__skeleton-cell" part="cell">
                  <md-skeleton
                    part="skeleton"
                    style="width: ${skeletonWidth(rowIndex, colIndex)}%;"
                  ></md-skeleton>
                </div>
              `,
            )}
          </div>
        `,
      )}
    </div>
  `;
}

/**
 * One virtualized row (or, for a master-detail expanded row, one detail
 * row) — the callback body of `render()`'s `repeat(visibleItems, ...)`.
 * Called with the exact same `item`/`virtualIndex` that loop already
 * computed; produces byte-identical output to the inline version.
 * @param {import("./data-grid.js").MdDataGrid} host
 * @param {import("../controllers/data-grid-detail-panel-controller.js").DetailPanelRenderItem} item
 * @param {number} virtualIndex
 * @param {{
 *   columns: import("./data-grid-types.js").DataGridColumn[],
 *   gridTemplateColumns: string,
 *   effectiveRows: Record<string, unknown>[],
 *   rowSpans: Map<string, (import("../controllers/data-grid-row-span-controller.js").DataGridRowSpanInfo | undefined)[]>,
 * }} params
 * @returns {import("lit").TemplateResult}
 */
export function renderRow(
  host,
  item,
  virtualIndex,
  { columns, gridTemplateColumns, effectiveRows, rowSpans },
) {
  if (item.kind === "detail") {
    return html`
      <div
        class="data-grid__detail-row"
        part="detail-row"
        role="row"
        data-index=${virtualIndex}
      >
        <div
          class="data-grid__detail-row-cell"
          part="detail-cell"
          role="gridcell"
        >
          ${item.content}
        </div>
      </div>
    `;
  }

  const { row, rowIndex } = item;
  const rowClassName = host.getRowClassName?.(row, rowIndex) ?? "";
  const selected = host._selection.isSelected(row);
  /** @type {Record<string, boolean>} */
  const rowClasses = {
    "data-grid__row": true,
    "data-grid__row_selected": selected,
  };
  for (const cls of rowClassName.split(" ")) {
    if (cls) rowClasses[cls] = true;
  }
  const heightStyle =
    typeof host.rowHeight === "number"
      ? `height: ${host.rowHeight}px; --height: ${host.rowHeight}px;`
      : "";
  return html`
    <div
      class=${classMap(rowClasses)}
      part="row ${rowClassName}"
      role="row"
      aria-selected=${selected}
      data-index=${virtualIndex}
      style="grid-template-columns: ${gridTemplateColumns}; ${heightStyle}"
      @mousedown=${host._onRowMouseDown}
      @click=${(/** @type {MouseEvent} */ event) =>
        host._onRowClick(event, row, rowIndex, effectiveRows)}
    >
      ${(() => {
        // Same coveredUntil skip as the header loop — reset per row, since
        // a column's colSpan merges its cells across every row, not just
        // the header.
        let coveredUntil = -1;
        return repeat(
          columns,
          (column) => column.field,
          (column, colIndex) => {
            if (colIndex <= coveredUntil) return nothing;
            const span = clampColSpan(columns, colIndex);
            coveredUntil = colIndex + span - 1;
            const spanInfo = rowSpans.get(column.field)?.[rowIndex];
            // Covered by an earlier row's row-span run for this column —
            // that owner cell paints over this slot by overflowing
            // downward.
            if (spanInfo && !spanInfo.owner) return nothing;
            return html`
              <md-data-grid-cell
                .row=${row}
                .column=${column}
                .rowIndex=${rowIndex}
                .colIndex=${colIndex}
                .colSpan=${span}
                .rowSpan=${spanInfo?.span ?? 1}
              ></md-data-grid-cell>
            `;
          },
        );
      })()}
    </div>
  `;
}
