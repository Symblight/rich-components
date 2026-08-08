import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import chevronLeft from "@material-design-icons/svg/outlined/chevron_left.svg?raw";
import chevronRight from "@material-design-icons/svg/outlined/chevron_right.svg?raw";

import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/select";

import { dataGridContext } from "../../base/data-grid-context.js";
import styles from "./data-grid-footer.css?inline";

/**
 * @tag md-data-grid-footer
 * @summary Pagination footer for `md-data-grid` — row count and prev/next
 * controls, driven entirely by `dataGridContext`. The host itself is the
 * rendered footer bar (no wrapper div) — `part="footer"` is set once in the
 * constructor. Composed internally by the grid when `paginationModel` is
 * set and `hidePagination` is `false` — not intended to be used standalone.
 */
@customElement("md-data-grid-footer")
export class MdDataFooter extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @private */
    this._gridConsumer = new ContextConsumer(this, {
      context: dataGridContext,
      subscribe: true,
    });

    this.setAttribute("part", "footer");
  }

  /** @param {Event} event */
  _onPageSizeChange(event) {
    // @symblight/wc-material/select's published .d.ts is a pure
    // `/// <reference>` re-export with no actual module exports, so TS can't
    // resolve a `Select` type from it — duck-type instead.
    const select = /** @type {EventTarget & { value: string }} */ (
      event.target
    );
    this._gridConsumer.value?.setPageSize(Number(select.value));
  }

  render() {
    const grid = this._gridConsumer.value;
    if (!grid) return nothing;

    const {
      page,
      pageSize,
      pageCount,
      rowCount,
      firstRowIndex,
      lastRowIndex,
      pageSizeOptions,
      setPage,
    } = grid;

    // Keep the current pageSize selectable even if it isn't one of the
    // configured options (e.g. a consumer-chosen initial page size). Only
    // applies when pageSizeOptions is non-empty — an explicitly empty list
    // means "no selector at all", not "one option: whatever pageSize is".
    const options =
      pageSizeOptions.length === 0 || pageSizeOptions.includes(pageSize)
        ? pageSizeOptions
        : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

    return html`
      ${
        pageSizeOptions.length > 0
          ? html`
              <span
                class="data-grid-footer__rows-per-page-label"
                part="rows-per-page-label"
              >
                Rows per page:
              </span>
              <md-select
                class="data-grid-footer__page-size-select"
                part="page-size-select"
                variant="outlined"
                .value=${String(pageSize)}
                @change=${this._onPageSizeChange}
              >
                ${options.map(
                (option) =>
                  html`<md-option part="page-size-option" value=${option}
                    >${option}</md-option
                  >`,
              )}
              </md-select>
            `
          : nothing
      }
      <span class="data-grid-footer__count" part="footer-count">
        ${rowCount === 0 ? 0 : firstRowIndex + 1}–${lastRowIndex + 1} of
        ${rowCount}
      </span>
      <md-icon-button
        part="footer-prev"
        ?disabled=${page <= 0}
        @click=${() => setPage(page - 1)}
        aria-label="Previous page"
      >
        <md-icon>${unsafeSVG(chevronLeft)}</md-icon>
      </md-icon-button>
      <md-icon-button
        part="footer-next"
        ?disabled=${page >= pageCount - 1}
        @click=${() => setPage(page + 1)}
        aria-label="Next page"
      >
        <md-icon>${unsafeSVG(chevronRight)}</md-icon>
      </md-icon-button>
    `;
  }
}
