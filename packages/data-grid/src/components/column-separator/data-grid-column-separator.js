import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";

import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-column-separator.css?inline";

const ACTIVE_CLASS = "data-grid-column-separator_active";

/**
 * @tag md-data-grid-column-separator
 * @summary The vertical divider between two header cells of an
 * `md-data-grid`, rendered as an SVG rect rather than a CSS border — a
 * border can't have rounded ends (`rx`) without an extra wrapper element.
 * Always renders (so every column boundary still shows a divider), and
 * doubles as the drag-to-resize handle when `resizable` is set: owns the
 * raw pointer mechanics itself and calls into `dataGridContext`'s resize
 * functions, matching `md-data-grid-cell`'s focus-via-context pattern. The
 * host itself is the positioned/interactive element (no wrapper div) —
 * styles and pointer listeners live directly on `:host`/`this`. Composed
 * internally by `md-data-grid-header-cell` — not intended to be used
 * standalone.
 */
@customElement("md-data-grid-column-separator")
export class MdDataColumnSeparator extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    resizable: { type: Boolean, reflect: true },
    resizeColIndex: { type: Number },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {boolean} */
    this.resizable = false;

    /** @type {number} */
    this.resizeColIndex = 0;

    /** @private */
    this._resizing = false;

    /** @private */
    this._gridConsumer = new ContextConsumer(this, {
      context: dataGridContext,
      subscribe: true,
    });

    this.setAttribute("part", "separator");

    this.addEventListener("pointerdown", this._onPointerDown);
    this.addEventListener("pointermove", this._onPointerMove);
    this.addEventListener("pointerup", this._onPointerUp);
    this.addEventListener("pointercancel", this._onPointerUp);
  }

  /** @private @param {PointerEvent} event */
  _onPointerDown(event) {
    if (!this.resizable) return;
    this.setPointerCapture(event.pointerId);
    // Without this, a fast drag can select the header's own label text (or
    // neighboring text) instead of just resizing the column.
    event.preventDefault();
    event.stopPropagation();
    this._resizing = true;
    this.classList.add(ACTIVE_CLASS);
    this._gridConsumer.value?.startColumnResize(
      this.resizeColIndex,
      event.clientX,
    );
  }

  /** @private @param {PointerEvent} event */
  _onPointerMove(event) {
    if (!this._resizing) return;
    this._gridConsumer.value?.resizeColumn(event.clientX);
  }

  /** @private @param {PointerEvent} event */
  _onPointerUp(event) {
    if (!this._resizing) return;
    this._resizing = false;
    this.classList.remove(ACTIVE_CLASS);
    this._gridConsumer.value?.endColumnResize(event.clientX);
  }

  render() {
    return html`
      <svg
        class="data-grid-column-separator__icon"
        viewBox="0 0 24 24"
        focusable="false"
        aria-hidden="true"
      >
        <rect width="1" height="24" x="11.5" rx="0.5" />
      </svg>
    `;
  }
}
