/**
 * Owns focus/roving-tabindex state for `md-data-grid` — the `cell` region
 * and the `columnHeader` region, mutually exclusive: `focusedRegion` says
 * which one currently holds the grid's single Tab stop, so exactly one
 * `md-data-grid-cell`/`md-data-grid-header-cell` has `tabindex="0"` at a time no
 * matter which region it's in, per the WAI-ARIA APG composite-widget rule.
 * Deliberately split out from `KeyboardNavController`, which only
 * *interprets* key events and calls into this controller to actually move
 * focus — mirrors keeping "who owns focus state" separate from "what
 * decides where it goes next".
 */
export class FocusController {
  /**
   * @param {import("../base/data-grid.js").MdDataGrid} host
   * @param {{ onFocusChange?: () => void }} [options] `onFocusChange` fires
   *   synchronously from `setCellFocus()`/`clearCellFocus()`, before
   *   `host.requestUpdate()`. Focus state isn't a Lit reactive property (it
   *   changes far more selectively than the host's generic re-render), so
   *   the host uses this to rebuild the shared context immediately, rather
   *   than waiting for the next tracked-property update.
   */
  constructor(host, options = {}) {
    this.host = host;
    this._onFocusChange = options.onFocusChange;

    /** @type {{ rowIndex: number, colIndex: number }} */
    this.focusedCell = { rowIndex: 0, colIndex: 0 };

    /**
     * `focusedCell` starts at (0, 0) so *some* cell always has `tabindex="0"`
     * for basic keyboard accessibility (Tab needs a target to land on) —
     * but that default shouldn't visually read as "focused" before the
     * user has actually clicked or navigated into the grid. This flips true
     * the first time `setCellFocus()` runs for real (click or arrow-key
     * nav), and is what the highlight visual is actually gated on.
     * @type {boolean}
     */
    this.hasFocus = false;

    /**
     * Which region currently owns the grid's single Tab stop. Starts
     * `"cell"` so the existing default (0, 0) body-cell behavior is
     * unchanged — the header only becomes reachable once the user actually
     * navigates there (ArrowUp from row 0, or a direct click/focus on a
     * header cell).
     * @type {"cell" | "columnHeader"}
     */
    this.focusedRegion = "cell";

    /** @type {number} */
    this.focusedHeaderColIndex = 0;
  }

  /**
   * @param {number} rowIndex
   * @param {number} colIndex
   */
  setCellFocus(rowIndex, colIndex) {
    this.focusedCell = { rowIndex, colIndex };
    this.hasFocus = true;
    this.focusedRegion = "cell";
    this._onFocusChange?.();
    this.host.requestUpdate();
  }

  /**
   * Drops the highlight when a cell blurs — but only if it's still the one
   * that's actually focused, not some earlier cell's stale blur. Arrow-key
   * navigation calls `setCellFocus()` for the new cell immediately, then
   * imperatively `.focus()`s it afterward (`focusCell()`, which awaits
   * `updateComplete` first) — so the old cell's `blur` can fire after
   * `focusedCell` has already moved on. Guarding on identity means that
   * stale blur is a no-op instead of clearing a highlight that's already
   * correct.
   * @param {number} rowIndex
   * @param {number} colIndex
   */
  clearCellFocus(rowIndex, colIndex) {
    if (
      this.focusedCell.rowIndex !== rowIndex ||
      this.focusedCell.colIndex !== colIndex
    ) {
      return;
    }
    this.hasFocus = false;
    this._onFocusChange?.();
    this.host.requestUpdate();
  }

  /**
   * @param {number} rowIndex
   * @param {number} colIndex
   */
  async focusCell(rowIndex, colIndex) {
    await this.host.updateComplete;
    if (!this.canTakeFocus()) return;
    const cells =
      /** @type {NodeListOf<import("../components/cell/data-grid-cell.js").MdDataCell>} */ (
        this.host.renderRoot.querySelectorAll("md-data-grid-cell")
      );
    for (const cell of cells) {
      if (cell.rowIndex === rowIndex && cell.colIndex === colIndex) {
        cell.focusCell();
        break;
      }
    }
  }

  /**
   * Hands the grid's single Tab stop to a header cell. No `hasFocus`-style
   * highlight gate here (unlike `setCellFocus()`) — a header cell's only
   * focused-state visual is the browser's native `:focus` outline, which
   * already tracks *real* DOM focus on its own, so there's no separate
   * "logically focused but not highlighted yet" state to reconcile.
   * @param {number} colIndex
   */
  setHeaderFocus(colIndex) {
    this.focusedRegion = "columnHeader";
    this.focusedHeaderColIndex = colIndex;
    this._onFocusChange?.();
    this.host.requestUpdate();
  }

  /**
   * @param {number} colIndex
   */
  async focusHeader(colIndex) {
    await this.host.updateComplete;
    if (!this.canTakeFocus()) return;
    const headers =
      /** @type {NodeListOf<import("../components/header-cell/data-grid-header-cell.js").MdDataHeaderCell>} */ (
        this.host.renderRoot.querySelectorAll("md-data-grid-header-cell")
      );
    for (const header of headers) {
      if (header.colIndex === colIndex) {
        header.focus();
        break;
      }
    }
  }

  /**
   * Guards `focusCell()`/`focusHeader()`'s imperative `.focus()` call
   * against stealing DOM focus away from something the user has
   * legitimately focused *outside* the grid in the meantime. Both methods
   * `await host.updateComplete` before actually moving focus — if, during
   * that gap, a `renderCell`'s own dialog/popover (opened by, say, a mouse
   * click that raced with an in-flight arrow-key navigation) grabbed real
   * focus, blindly proceeding would rip focus back out of it and into the
   * grid, which is exactly the kind of surprise a user mid-dialog doesn't
   * expect. Mirrors MUI's `allowTakingFocus` check in `useGridFocus`.
   *
   * Walks into nested shadow roots to find the *true* focused leaf element
   * — `document.activeElement` only ever reports the outermost custom
   * element hosting the shadow tree that focus is actually inside, not
   * what's focused within it. Taking focus is allowed when nothing is
   * meaningfully focused yet (`document.body`/nothing) or when the truly
   * focused element is already inside this grid — refused only when it's
   * a real element genuinely outside the grid.
   * @returns {boolean}
   */
  canTakeFocus() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    if (!active || active === document.body) return true;

    // `Node.contains()` doesn't cross shadow boundaries (not even the
    // host's own), so an ancestor walk has to step from a ShadowRoot to
    // its `.host` explicitly to keep climbing past one.
    /** @type {Node | null} */
    let node = active;
    while (node) {
      if (node === this.host) return true;
      node = node instanceof ShadowRoot ? node.host : node.parentNode;
    }
    return false;
  }
}
