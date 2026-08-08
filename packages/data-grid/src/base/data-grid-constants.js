/**
 * Module-level constants and tiny pure helpers used by `data-grid.js`,
 * split out purely to shrink that file (per
 * `.claude/plans/data-grid-file-split-plan.md` Phase 1b) — same tier as
 * `data-grid-build-context.js`, no runtime behavior change.
 */

export const DEFAULT_ROW_HEIGHT = 52;
export const DEFAULT_HEADER_HEIGHT = 48;
export const DEFAULT_OVERSCAN = 8;
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const SKELETON_ROW_COUNT = 8;

/**
 * Initial size guess for a detail-panel row, used only until it's actually
 * rendered and measured (same "guess corrected by real measurement" pattern
 * `rowHeight: "auto"` already uses for ordinary rows) — content is arbitrary
 * and typically taller than one row, so a plain row's own estimate wouldn't
 * be a reasonable starting point.
 */
export const DETAIL_PANEL_ESTIMATED_HEIGHT = 128;

/**
 * Deterministic pseudo-random width (40–85%) for a skeleton cell, seeded by
 * its position — stable across re-renders (no jumping around on every
 * loading-state re-render, unlike `Math.random()`) while still varying per
 * cell/row, mimicking real text of differing lengths.
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {number}
 */
export function skeletonWidth(rowIndex, colIndex) {
  const seed = Math.sin(rowIndex * 12.9898 + colIndex * 78.233) * 43758.5453;
  const fraction = seed - Math.floor(seed);
  return 40 + Math.round(fraction * 45);
}

/**
 * A column's `colSpan`, clamped so it never reaches past the last column.
 * Shared by the header and every row's cell loop — both skip the next
 * `span - 1` columns and render one cell spanning `span` tracks instead.
 * @param {import("./data-grid-types.js").DataGridColumn[]} columns
 * @param {number} colIndex
 * @returns {number}
 */
export function clampColSpan(columns, colIndex) {
  return Math.max(
    1,
    Math.min(columns[colIndex].colSpan ?? 1, columns.length - colIndex),
  );
}

/** @param {Record<string, unknown>} row */
export const defaultGetRowId = (row) => /** @type {string | number} */ (row.id);
