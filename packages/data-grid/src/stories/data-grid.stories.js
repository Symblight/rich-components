import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import moreVert from "@material-design-icons/svg/outlined/more_vert.svg?raw";
import renameIcon from "@material-design-icons/svg/outlined/drive_file_rename_outline.svg?raw";
import deleteIcon from "@material-design-icons/svg/outlined/delete.svg?raw";
import starIcon from "@material-design-icons/svg/outlined/star.svg?raw";
import starBorderIcon from "@material-design-icons/svg/outlined/star_border.svg?raw";
import pdfIcon from "@material-design-icons/svg/outlined/picture_as_pdf.svg?raw";
import sellIcon from "@material-design-icons/svg/outlined/sell.svg?raw";
import inventoryIcon from "@material-design-icons/svg/outlined/inventory_2.svg?raw";
import localShippingIcon from "@material-design-icons/svg/outlined/local_shipping.svg?raw";

import "../index.js";
import "../tree/data-grid-tree.js";
// Demo-only: these sibling Material components aren't part of this package —
// they're pulled from @symblight/wc-material purely to dress up the stories
// (row actions menu, transactions card, etc).
import "@symblight/wc-material/card";
import "@symblight/wc-material/chips";
import "@symblight/wc-material/button";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/badge";
import "@symblight/wc-material/list";
import "@symblight/wc-material/dialog";
import "@symblight/wc-material/text-field";

/** @import { DataGridColumn } from "../base/data-grid.js" */
/** @import { MdDataGrid } from "../base/data-grid.js" */
/** @import { MdDataGridTree } from "../tree/data-grid-tree.js" */

const DEPARTMENTS = ["Engineering", "Design", "Marketing", "Sales", "Support"];

/** @param {number} count */
function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    email: `item${i}@example.com`,
    department: DEPARTMENTS[i % DEPARTMENTS.length],
    status: i % 3 === 0 ? "active" : "inactive",
  }));
}

/** @type {DataGridColumn[]} */
const BASIC_COLUMNS = [
  { field: "id", headerName: "ID", width: 80 },
  { field: "name", headerName: "Name" },
  { field: "email", headerName: "Email" },
  { field: "department", headerName: "Department", width: 140 },
  { field: "status", headerName: "Status", width: 120 },
];

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Data Grid",
  component: "md-data-grid",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

// ─── Basic — columns/rows set imperatively, virtualized ─────────────────────

/** @type {Story} */
export const Basic = {
  render: () => html`
    <md-data-grid
      style="height: 320px; width: 720px; display: block;"
      ${ref((el) => {
        const grid = /** @type {MdDataGrid | undefined} */ (
          /** @type {unknown} */ (el)
        );
        if (!grid) return;
        grid.columns = BASIC_COLUMNS;
        grid.rows = makeRows(5000);
      })}
    ></md-data-grid>
  `,
};

// ─── Basic — no rows (empty state) ───────────────────────────────────────────

/** @type {Story} */
export const BasicEmpty = {
  render: () => html`
    <md-data-grid
      style="height: 320px; width: 720px; display: block;"
      ${ref((el) => {
        const grid = /** @type {MdDataGrid | undefined} */ (
          /** @type {unknown} */ (el)
        );
        if (!grid) return;
        grid.columns = BASIC_COLUMNS;
        grid.rows = [];
      })}
    ></md-data-grid>
  `,
};

// ─── Declarative overrides — slot="empty-label" replaces the default "No
// rows" text, slot="footer" replaces the internal pagination footer
// entirely (still shown even with no paginationModel, since it's ordinary
// <slot> fallback-content behavior, not conditional on pagination) ─────────

/** @type {Story} */
export const SlotOverrides = {
  render: () => html`
    <md-data-grid
      style="height: 320px; width: 720px; display: block;"
      ${ref((el) => {
        const grid = /** @type {MdDataGrid | undefined} */ (
          /** @type {unknown} */ (el)
        );
        if (!grid) return;
        grid.rows = [];
      })}
    >
      <md-data-grid-column
        field="id"
        header-name="ID"
        width="80"
      ></md-data-grid-column>
      <md-data-grid-column
        field="name"
        header-name="Name"
      ></md-data-grid-column>
      <md-data-grid-column
        field="email"
        header-name="Email"
      ></md-data-grid-column>
      <md-data-grid-column
        field="department"
        header-name="Department"
        width="140"
      ></md-data-grid-column>
      <md-data-grid-column
        field="status"
        header-name="Status"
        width="120"
      ></md-data-grid-column>
      <span slot="empty-label">No results match your filters.</span>
      <div
        slot="footer"
        style="padding: 0.5rem 1rem; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant);"
      >
        Custom footer content
      </div>
    </md-data-grid>
  `,
};

// ─── Row spanning — consecutive equal values in a column merge vertically ──

/** @type {DataGridColumn[]} */
const ROW_SPAN_COLUMNS = [
  { field: "department", headerName: "Department", width: 160 },
  { field: "name", headerName: "Name" },
  { field: "email", headerName: "Email" },
];

/** Grouped by department so equal adjacent values actually merge — row
 * spanning only sees adjacency, not the whole dataset. */
const ROW_SPAN_ROWS = DEPARTMENTS.flatMap((department, deptIndex) =>
  Array.from({ length: 3 }, (_, i) => {
    const id = deptIndex * 3 + i;
    return {
      id,
      department,
      name: `Item ${id}`,
      email: `item${id}@example.com`,
    };
  }),
);

/** @type {Story} */
export const RowSpanning = {
  render: () => html`
    <md-data-grid
      row-spanning
      style="height: 320px; width: 640px; display: block;"
      ${ref((el) => {
        const grid = /** @type {MdDataGrid | undefined} */ (
          /** @type {unknown} */ (el)
        );
        if (!grid) return;
        grid.columns = ROW_SPAN_COLUMNS;
        grid.rows = ROW_SPAN_ROWS;
      })}
    ></md-data-grid>
  `,
};

// ─── Row selection — highlight-based, not checkboxes. Click to select,
// Ctrl/Cmd-click to toggle additively, Shift-click for a range ─────────────

/** @type {Story} */
export const RowSelection = {
  render: () => {
    /** @type {HTMLElement | undefined} */
    let log;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <md-data-grid
          style="height: 320px; width: 720px; display: block;"
          @md-data-grid-row-selection-model-change=${(
            /** @type {CustomEvent} */ e,
          ) => {
            if (!log) return;
            const ids = [...e.detail];
            log.textContent =
              ids.length === 0 ? "No rows selected." : `Selected: ${ids}`;
          }}
          ${ref((el) => {
            const grid = /** @type {MdDataGrid | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.columns = BASIC_COLUMNS;
            grid.rows = makeRows(20);
          })}
        ></md-data-grid>
        <span
          ${ref((el) => (log = /** @type {HTMLElement | undefined} */ (el)))}
          style="font-family: monospace; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);"
        >
          Click a row to select it. Hold Ctrl/Cmd to add/remove one row at a
          time, or Shift to select a range.
        </span>
      </div>
    `;
  },
};

// ─── Checkbox selection — same rowSelectionModel as RowSelection above,
// driven by an md-checkbox column (GRID_CHECKBOX_SELECTION_COL_DEF) instead
// of a plain row highlight ────────────────────────────────────────────────

/** @type {Story} */
export const CheckboxSelection = {
  render: () => {
    /** @type {HTMLElement | undefined} */
    let log;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <md-data-grid
          checkbox-selection
          style="height: 320px; width: 720px; display: block;"
          @md-data-grid-row-selection-model-change=${(
            /** @type {CustomEvent} */ e,
          ) => {
            if (!log) return;
            const ids = [...e.detail];
            log.textContent =
              ids.length === 0 ? "No rows selected." : `Selected: ${ids}`;
          }}
          ${ref((el) => {
            const grid = /** @type {MdDataGrid | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.columns = BASIC_COLUMNS;
            grid.rows = makeRows(20);
          })}
        ></md-data-grid>
        <span
          ${ref((el) => (log = /** @type {HTMLElement | undefined} */ (el)))}
          style="font-family: monospace; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);"
        >
          Check a row's box to select it — checking another adds to the
          selection. The header checkbox selects/clears all 20 rows.
        </span>
      </div>
    `;
  },
};

// ─── Master detail — getDetailPanelContent expands a row into a full-width,
// arbitrary-content row below it, toggled via a prepended icon-button column
// (GRID_DETAIL_PANEL_TOGGLE_COL_DEF) ─────────────────────────────────────────

/** @type {DataGridColumn[]} */
const ORDER_COLUMNS = [
  { field: "id", headerName: "Order", width: 100 },
  { field: "customer", headerName: "Customer" },
  { field: "total", headerName: "Total", width: 120, align: "right" },
];

const ORDER_STATUSES = ["Processing", "Shipped", "Delivered"];

const ORDERS = Array.from({ length: 10 }, (_, i) => {
  const items =
    // Every third order has no line items — no detail toggle renders for those.
    i % 3 === 0
      ? []
      : Array.from({ length: (i % 4) + 1 }, (_, j) => ({
          name: `Item ${j + 1}`,
          qty: j + 1,
          price: 12.5 + j * 4.25,
        }));
  const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  return {
    id: 1000 + i,
    customer: `Customer ${i}`,
    total: `$${total.toFixed(2)}`,
    status: ORDER_STATUSES[i % ORDER_STATUSES.length],
    items,
  };
});

/** @type {Story} */
export const MasterDetail = {
  render: () => {
    /** @type {HTMLElement | undefined} */
    let log;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <md-data-grid
          style="height: 400px; width: 720px; display: block;"
          @md-data-grid-detail-panel-expanded-row-ids-change=${(
            /** @type {CustomEvent} */ e,
          ) => {
            if (!log) return;
            const ids = [...e.detail];
            log.textContent =
              ids.length === 0 ? "No rows expanded." : `Expanded: ${ids}`;
          }}
          ${ref((el) => {
            const grid = /** @type {MdDataGrid | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.columns = ORDER_COLUMNS;
            grid.rows = ORDERS;
            grid.getDetailPanelContent = (
              /** @type {{ row: Record<string, unknown> }} */ { row },
            ) => {
              const items =
                /** @type {{ name: string, qty: number, price: number }[]} */ (
                  row.items
                );
              if (!items.length) return undefined;
              const subtotal = items.reduce(
                (sum, item) => sum + item.qty * item.price,
                0,
              );
              return html`
                <div
                  style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem 1rem;"
                >
                  <div
                    style="display: flex; align-items: center; justify-content: space-between;"
                  >
                    <strong style="font-size: 0.9375rem;"
                      >Items in order #${row.id}</strong
                    >
                    <md-assist-chip variant="outlined">
                      <md-icon slot="leading-icon"
                        >${unsafeSVG(localShippingIcon)}</md-icon
                      >
                      ${row.status}
                    </md-assist-chip>
                  </div>
                  <div
                    style="display: flex; flex-direction: column; gap: 0.375rem;"
                  >
                    ${items.map(
                      (item) => html`
                        <div
                          style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; background-color: var(--md-sys-color-surface-container-low, #f2f2f7);"
                        >
                          <md-icon
                            style="color: var(--md-sys-color-on-surface-variant); font-size: 1.25rem;"
                          >
                            ${unsafeSVG(inventoryIcon)}
                          </md-icon>
                          <span style="flex: 1;">${item.name}</span>
                          <md-badge
                            value=${item.qty}
                            style="--md-badge-color: var(--md-sys-color-secondary-container, #e0e0e0); --md-badge-on-color: var(--md-sys-color-on-secondary-container, #333);"
                          ></md-badge>
                          <span
                            style="min-width: 4.5rem; text-align: right; font-variant-numeric: tabular-nums;"
                          >
                            $${(item.qty * item.price).toFixed(2)}
                          </span>
                        </div>
                      `,
                    )}
                  </div>
                  <div
                    style="display: flex; align-items: baseline; justify-content: flex-end; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--md-sys-color-outline-variant);"
                  >
                    <span
                      style="color: var(--md-sys-color-on-surface-variant); font-size: 0.8125rem;"
                      >Subtotal</span
                    >
                    <strong>$${subtotal.toFixed(2)}</strong>
                  </div>
                </div>
              `;
            };
          })}
        ></md-data-grid>
        <span
          ${ref((el) => (log = /** @type {HTMLElement | undefined} */ (el)))}
          style="font-family: monospace; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);"
        >
          Click the arrow to expand an order's line items. Orders with no items
          (every third row) have no arrow at all.
        </span>
      </div>
    `;
  },
};

// ─── Loading — md-progress-linear between the header and body, toggled via
// a ref (the grid never fetches anything itself) ────────────────────────────

/** @type {Story} */
export const LoadingWithRows = {
  render: () => {
    /** @type {MdDataGrid | undefined} */
    let grid;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <md-data-grid
          style="height: 320px; width: 720px; display: block;"
          ${ref((el) => {
            grid = /** @type {MdDataGrid | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.columns = BASIC_COLUMNS;
            grid.rows = makeRows(20);
          })}
        ></md-data-grid>
        <div style="display: flex; gap: 0.5rem;">
          <md-button
            @click=${() => {
              if (!grid) return;
              grid.loading = true;
              setTimeout(() => {
                if (grid) grid.loading = false;
              }, 2000);
            }}
          >
            Simulate 2s reload (progress bar + overlay over existing rows)
          </md-button>
        </div>
      </div>
    `;
  },
};

// ─── Loading — rows still empty (first load), skeleton rows instead ────────

/** @type {Story} */
export const LoadingSkeleton = {
  render: () => {
    /** @type {MdDataGrid | undefined} */
    let grid;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <md-data-grid
          loading
          style="height: 320px; width: 720px; display: block;"
          ${ref((el) => {
            grid = /** @type {MdDataGrid | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.columns = BASIC_COLUMNS;
            grid.rows = [];
          })}
        ></md-data-grid>
        <div style="display: flex; gap: 0.5rem;">
          <md-button
            @click=${() => {
              if (!grid) return;
              grid.rows = makeRows(20);
              grid.loading = false;
            }}
          >
            Finish loading (reveals real rows)
          </md-button>
        </div>
      </div>
    `;
  },
};

// ─── Column resize — drag handles on the header, live width readout ────────

/** @type {DataGridColumn[]} */
const RESIZE_COLUMNS = [
  { field: "id", headerName: "ID", width: 80, resizable: false },
  { field: "name", headerName: "Name", minWidth: 120, maxWidth: 400 },
  { field: "email", headerName: "Email" },
  { field: "department", headerName: "Department", width: 140 },
  { field: "status", headerName: "Status", width: 120 },
];

/** @type {Story} */
export const ColumnResize = {
  render: () => {
    /** @type {HTMLElement | undefined} */
    let log;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <md-data-grid
          style="height: 320px; width: 720px; display: block;"
          @md-data-grid-column-resize=${(/** @type {CustomEvent} */ e) => {
            if (!log) return;
            const { field, width, phase } = e.detail;
            log.textContent = `${field}: ${Math.round(width)}px (${phase})`;
          }}
          ${ref((el) => {
            const grid = /** @type {MdDataGrid | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.columns = RESIZE_COLUMNS;
            grid.rows = makeRows(20);
          })}
        ></md-data-grid>
        <span
          ${ref((el) => (log = /** @type {HTMLElement | undefined} */ (el)))}
          style="font-family: monospace; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);"
        >
          Drag a column's right edge to resize (ID is not resizable).
        </span>
      </div>
    `;
  },
};

// ─── Pagination — client mode ────────────────────────────────────────────────

/** @type {Story} */
export const PaginationClient = {
  render: () => html`
    <md-data-grid
      style="height: 320px; width: 720px; display: block;"
      ${ref((el) => {
        const grid = /** @type {MdDataGrid | undefined} */ (
          /** @type {unknown} */ (el)
        );
        if (!grid) return;
        grid.columns = BASIC_COLUMNS;
        grid.rows = makeRows(42);
        grid.paginationModel = { page: 0, pageSize: 8 };
      })}
    ></md-data-grid>
  `,
};

// ─── Pagination — server mode ────────────────────────────────────────────────

/** @param {number} page @param {number} pageSize */
function fetchServerPage(page, pageSize) {
  // Simulates a server that only ever returns one page's worth of rows.
  const all = makeRows(42);
  return {
    rows: all.slice(page * pageSize, (page + 1) * pageSize),
    totalCount: all.length,
  };
}

/** @type {Story} */
export const PaginationServer = {
  render: () => html`
    <md-data-grid
      pagination-mode="server"
      style="height: 320px; width: 720px; display: block;"
      @md-data-grid-pagination-model-change=${(
        /** @type {CustomEvent} */ e,
      ) => {
        const grid = /** @type {MdDataGrid} */ (
          /** @type {unknown} */ (e.target)
        );
        const { page, pageSize } = e.detail;
        const { rows, totalCount } = fetchServerPage(page, pageSize);
        grid.rows = rows;
        grid.rowCount = totalCount;
      }}
      ${ref((el) => {
        const grid = /** @type {MdDataGrid | undefined} */ (
          /** @type {unknown} */ (el)
        );
        if (!grid) return;
        grid.columns = BASIC_COLUMNS;
        grid.paginationMode = "server";
        grid.paginationModel = { page: 0, pageSize: 8 };
        const { rows, totalCount } = fetchServerPage(0, 8);
        grid.rows = rows;
        grid.rowCount = totalCount;
      })}
    ></md-data-grid>
  `,
};

// ─── Pagination — hidden footer, driven by external buttons ────────────────

/** @type {Story} */
export const HidePagination = {
  render: () => {
    /** @type {MdDataGrid | undefined} */
    let grid;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <md-data-grid
          hide-pagination
          style="height: 320px; width: 720px; display: block;"
          ${ref((el) => {
            grid = /** @type {MdDataGrid | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.columns = BASIC_COLUMNS;
            grid.rows = makeRows(42);
            grid.paginationModel = { page: 0, pageSize: 8 };
          })}
        ></md-data-grid>
        <div style="display: flex; gap: 0.5rem;">
          <md-button
            @click=${() => grid?.setPage((grid.paginationModel?.page ?? 0) - 1)}
          >
            Previous
          </md-button>
          <md-button
            @click=${() => grid?.setPage((grid.paginationModel?.page ?? 0) + 1)}
          >
            Next
          </md-button>
        </div>
      </div>
    `;
  },
};

// ─── Transactions card — reference screenshot recreation ────────────────────

const CATEGORY_COLORS = {
  Food: { bg: "#e3f2e5", fg: "#2e7d43" },
  Rent: { bg: "#e6edfb", fg: "#2f5fc4" },
  Subscriptions: { bg: "#fbe6ef", fg: "#c23a72" },
};

const TRANSACTIONS = [
  {
    id: 1,
    date: "05.07",
    description: "RIMI Vilnius",
    method: "Card •1234",
    amount: 38.37,
    category: "Food",
  },
  {
    id: 2,
    date: "05.07",
    description: "Nuoma / Rent transfer",
    method: "Bank transfer",
    amount: 860.2,
    category: "Rent",
  },
  {
    id: 3,
    date: "07.07",
    description: "TELIA LIETUVA",
    method: "Card •1234",
    amount: 57.9,
    category: "Subscriptions",
  },
  {
    id: 4,
    date: "08.07",
    description: "NETFLIX.COM",
    method: "Card •5678",
    amount: 12.99,
    category: "Subscriptions",
  },
  {
    id: 5,
    date: "09.07",
    description: "Paysera LT · перевод",
    method: "Paysera",
    amount: 61.06,
    category: null,
    pending: true,
  },
  {
    id: 6,
    date: "12.07",
    description: "Barbora / Maxima",
    method: "Card •1234",
    amount: 52.1,
    category: "Food",
  },
];

/** @type {DataGridColumn[]} */
const TRANSACTION_COLUMNS = [
  { field: "date", headerName: "Дата", width: 72 },
  { field: "description", headerName: "Описание" },
  { field: "method", headerName: "Способ оплаты", width: 130 },
  {
    field: "amount",
    headerName: "Сумма",
    width: 110,
    align: "right",
    valueGetter: ({ row }) => `−${row.amount.toFixed(2)} €`,
  },
  {
    field: "category",
    headerName: "Категория",
    width: 140,
    align: "right",
    renderCell: ({ row }) => {
      if (!row.category) {
        return html`<md-assist-chip
          style="--md-chip-border-width: 0.063rem; --md-chip-container-color: transparent;"
        >
          Выбрать
        </md-assist-chip>`;
      }
      const { bg, fg } = CATEGORY_COLORS[row.category];
      return html`<md-assist-chip
        style="--md-chip-container-color: ${bg}; --md-chip-label-color: ${fg}; --md-chip-border-width: 0;"
      >
        ${row.category}
      </md-assist-chip>`;
    },
  },
];

/** @type {Story} */
export const TransactionsCard = {
  render: () => html`
    <md-card style="width: 620px;">
      <md-data-grid
        class="transactions-grid"
        style="height: 300px; width: 100%; display: block;"
        ${ref((el) => {
          const grid = /** @type {MdDataGrid | undefined} */ (
            /** @type {unknown} */ (el)
          );
          if (!grid) return;
          grid.columns = TRANSACTION_COLUMNS;
          grid.rows = TRANSACTIONS;
          grid.getRowClassName = (row) => (row.pending ? "row--pending" : "");
        })}
      ></md-data-grid>
    </md-card>
    <style>
      /* getRowClassName's output is mirrored onto each row's part attribute
         (in addition to its shadow-internal class), so it's targetable from
         outside via ::part() — this is how a consumer highlights a row. */
      .transactions-grid::part(row--pending) {
        background-color: color-mix(
          in oklch,
          var(--md-sys-color-tertiary-container),
          transparent 40%
        );
      }
    </style>
  `,
};

// ─── Row actions — 3-dot menu with Rename (md-dialog) and Delete ────────────
//
// The menu is a native `[popover]` element (not a library component): it
// renders in the browser's top layer, which is what lets it escape the
// virtualized grid's `overflow: auto` viewport instead of being clipped by
// it. Position is computed from the trigger button's rect on click.

/** @param {number} count */
function makeActionRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    email: `item${i}@example.com`,
    department: DEPARTMENTS[i % DEPARTMENTS.length],
    status: i % 3 === 0 ? "active" : "inactive",
  }));
}

/** @type {Story} */
export const RowActions = {
  render: () => {
    /** @type {MdDataGrid | undefined} */
    let grid;
    /** @type {any} */
    let dialog;
    /** @type {any} */
    let nameField;
    /** @type {Record<string, unknown> | undefined} */
    let renameTarget;

    /** @param {MouseEvent} event */
    function toggleMenu(event) {
      const button = /** @type {HTMLElement} */ (event.currentTarget);
      const menu = /** @type {any} */ (button.nextElementSibling);
      const rect = button.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.right - 176}px`;
      menu.togglePopover();
    }

    /** @param {Event} event */
    function closeMenu(event) {
      /** @type {any} */ (
        /** @type {HTMLElement} */ (event.currentTarget).closest("[popover]")
      )?.hidePopover();
    }

    /** @param {Record<string, unknown>} row */
    function openRename(row) {
      renameTarget = row;
      if (nameField) nameField.value = /** @type {string} */ (row.name);
      dialog?.show();
    }

    function submitRename() {
      if (!renameTarget || !nameField) return;
      grid?.updateRows([{ id: renameTarget.id, name: nameField.value }]);
      dialog?.close();
    }

    /** @param {Record<string, unknown>} row */
    function deleteRow(row) {
      grid?.updateRows([{ id: row.id, _action: "delete" }]);
    }

    /** @type {DataGridColumn[]} */
    const columns = [
      { field: "id", headerName: "ID", width: 80 },
      { field: "name", headerName: "Name" },
      { field: "email", headerName: "Email" },
      { field: "department", headerName: "Department", width: 140 },
      { field: "status", headerName: "Status", width: 120 },
      {
        field: "actions",
        headerName: "",
        width: 64,
        align: "center",
        renderCell: ({ row }) => html`
          <md-icon-button
            tabindex="0"
            aria-label="Row actions"
            @click=${toggleMenu}
          >
            <md-icon>${unsafeSVG(moreVert)}</md-icon>
          </md-icon-button>
          <div popover class="row-actions-menu">
            <md-list>
              <md-list-item
                button
                @click=${(/** @type {Event} */ e) => {
                  closeMenu(e);
                  openRename(row);
                }}
              >
                <md-icon slot="leading">${unsafeSVG(renameIcon)}</md-icon>
                Rename
              </md-list-item>
              <md-list-item
                button
                @click=${(/** @type {Event} */ e) => {
                  closeMenu(e);
                  deleteRow(row);
                }}
              >
                <md-icon slot="leading">${unsafeSVG(deleteIcon)}</md-icon>
                Delete
              </md-list-item>
            </md-list>
          </div>
        `,
      },
    ];

    return html`
      <md-data-grid
        style="height: 320px; width: 780px; display: block;"
        ${ref((el) => {
          grid = /** @type {MdDataGrid | undefined} */ (
            /** @type {unknown} */ (el)
          );
          if (!grid) return;
          grid.columns = columns;
          grid.rows = makeActionRows(8);
        })}
      ></md-data-grid>

      <md-dialog ${ref((el) => (dialog = el))}>
        <div slot="headline"><h3 style="margin: 0;">Rename item</h3></div>
        <md-text-field
          label="Name"
          autofocus
          ${ref((el) => (nameField = el))}
        ></md-text-field>
        <div
          slot="footer"
          style="display: flex; justify-content: flex-end; gap: 0.5rem;"
        >
          <md-button variant="text" @click=${() => dialog?.close()}
            >Cancel</md-button
          >
          <md-button variant="tonal" @click=${submitRename}>Save</md-button>
        </div>
      </md-dialog>

      <style>
        .row-actions-menu {
          margin: 0;
          padding: 0.25rem;
          border: none;
          border-radius: 0.5rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          width: 176px;
        }
      </style>
    `;
  },
};

// ─── Auto row height — rowHeight="auto", each row sized to its own content
// (an inbox list: most rows are one line, an attachment chip makes a row
// taller) — every column here uses renderCell, since under "auto" a cell's
// own vertical centering falls to whatever renderCell renders, not the
// grid's line-height-based default (see data-grid-cell.css) ─────────────────

/**
 * @typedef {object} InboxMessage
 * @property {string} sender
 * @property {string} subject
 * @property {string} preview
 * @property {string} time
 * @property {string} [attachment]
 */

/** @type {InboxMessage[]} */
const INBOX_TEMPLATES = [
  {
    sender: "CloudHost Billing",
    subject: "Failed to process card payment",
    preview:
      "We couldn't charge your card ending in 4242 for this month's invoice — please update your billing details.",
    time: "13:30",
  },
  {
    sender: "CloudHost Billing",
    subject: "Action required: payment method expiring",
    preview: "Your subscription will be paused in 3 days without an update.",
    time: "13:30",
  },
  {
    sender: "Outdoor Supply Co.",
    subject: "Summer water sports sale is here! 🏄",
    preview: "Biggest wetsuit and paddleboard sale of the year — ends Sunday.",
    time: "Aug 4",
  },
  {
    sender: "Ieva Petraityte",
    subject: "Invoice for this month's services",
    preview:
      "Hi, please find the invoice attached below. Let me know if you have any questions — thanks!",
    time: "Aug 4",
    attachment: "invoice_20260804.pdf",
  },
  {
    sender: "Flavio Rossi",
    subject: "Big news and a ton of new things shipped!",
    preview:
      "Hi there — we've been heads down building, and here's what's new this month across the whole product.",
    time: "Aug 4",
  },
  {
    sender: "Northgate Bank",
    subject: "Plan your future today",
    preview: "How much would you like to earn in retirement? Let's talk.",
    time: "Aug 4",
  },
  {
    sender: "GreenMart",
    subject: "Weekly deals inside 🔥",
    preview:
      "Fresh produce specials this week, delivered straight to your door.",
    time: "Aug 4",
  },
  {
    sender: "RideShare",
    subject: "Your trip receipt",
    preview:
      "Thanks for riding with us. Here's your receipt and a full trip summary for your records.",
    time: "Aug 4",
    attachment: "receipt_trip_2291.pdf",
  },
];

/** @param {number} count */
function makeInboxRows(count) {
  return Array.from({ length: count }, (_, i) => {
    const template = INBOX_TEMPLATES[i % INBOX_TEMPLATES.length];
    return { id: i, starred: false, ...template };
  });
}

/** @type {Story} */
export const AutoRowHeight = {
  render: () => {
    /** @type {MdDataGrid | undefined} */
    let grid;

    /**
     * @param {MouseEvent} event
     * @param {InboxMessage & { id: number, starred: boolean }} row
     */
    function toggleStar(event, row) {
      // Without this, the click bubbles up to the row's own click handler
      // and selects the row too — starring a message shouldn't also select it.
      event.stopPropagation();
      grid?.updateRows([{ id: row.id, starred: !row.starred }]);
    }

    /** @type {DataGridColumn[]} */
    const columns = [
      {
        field: "starred",
        headerName: "",
        width: 44,
        renderCell: ({ row }) => html`
          <div
            style="display: flex; align-items: center; justify-content: center; height: 100%;"
          >
            <md-icon-button
              variant="standard"
              toggle
              ?selected=${row.starred}
              aria-label="Star this email"
              @click=${(/** @type {MouseEvent} */ event) =>
                toggleStar(event, /** @type {any} */ (row))}
            >
              <md-icon slot="selected">${unsafeSVG(starIcon)}</md-icon>
              <md-icon>${unsafeSVG(starBorderIcon)}</md-icon>
            </md-icon-button>
          </div>
        `,
      },
      {
        field: "sender",
        headerName: "From",
        width: 180,
        renderCell: ({ value }) => html`
          <div
            style="display: flex; align-items: center; height: 100%; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
          >
            ${value}
          </div>
        `,
      },
      {
        field: "subject",
        headerName: "Message",
        // renderHeader in addition to renderCell — a custom header isn't
        // tied to auto row height at all, just shown alongside it here
        // since this story already demonstrates renderCell throughout.
        renderHeader: () => html`
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <md-icon
              style="font-size: 1.125rem; color: var(--md-sys-color-on-surface-variant);"
            >
              ${unsafeSVG(sellIcon)}
            </md-icon>
            <span>Promotions</span>
            <md-badge
              value="3"
              style="--md-badge-color: #2e7d32; --md-badge-on-color: #fff;"
            ></md-badge>
          </div>
        `,
        // Reuses renderCell to lay out the two things that actually vary a
        // row's content height: the subject/preview line (always present,
        // truncated to one line) and an attachment chip (only on some rows)
        // stacked below it — a row with an attachment ends up taller than
        // one without, which is exactly what rowHeight="auto" measures and
        // reflects in real (not estimated) scroll math.
        renderCell: ({ row }) => html`
          <div
            style="display: flex; flex-direction: column; justify-content: center; gap: 0.25rem; min-width: 0; height: 100%; padding-block: 0.5rem;"
          >
            <div
              style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
            >
              <span style="font-weight: 500;"
                >${/** @type {any} */ (row).subject}</span
              >
              <span
                style="color: var(--md-sys-color-on-surface-variant); margin-inline-start: 0.35rem;"
                >${/** @type {any} */ (row).preview}</span
              >
            </div>
            ${
              /** @type {any} */ (row).attachment
                ? html`
                    <md-assist-chip
                      variant="outlined"
                      style="width: fit-content;"
                    >
                      <span slot="leading-icon" style="color: #d32f2f;"
                        >${unsafeSVG(pdfIcon)}</span
                      >
                      ${/** @type {any} */ (row).attachment}
                    </md-assist-chip>
                  `
                : nothing
            }
          </div>
        `,
      },
      {
        field: "time",
        headerName: "",
        width: 80,
        align: "right",
        renderCell: ({ value }) => html`
          <div
            style="display: flex; align-items: center; justify-content: flex-end; height: 100%; color: var(--md-sys-color-on-surface-variant); font-size: 0.8125rem;"
          >
            ${value}
          </div>
        `,
      },
    ];

    return html`
      <md-data-grid
        row-height="auto"
        checkbox-selection
        disable-column-sorting
        style="height: 480px; width: 640px; display: block;"
        ${ref((el) => {
          grid = /** @type {MdDataGrid | undefined} */ (
            /** @type {unknown} */ (el)
          );
          if (!grid) return;
          grid.columns = columns;
          grid.rows = makeInboxRows(500);
        })}
      ></md-data-grid>
    `;
  },
};

// ─── Tree data — hierarchical rows via getDataPath, expand/collapse through
// a prepended grouping/toggle column (GRID_TREE_DATA_GROUPING_COL_DEF,
// customized here via autoGroupColumnDef), cascading checkbox selection ────

/** @type {DataGridColumn[]} */
const TREE_DATA_COLUMNS = [
  { field: "headcount", headerName: "Headcount", width: 120, align: "right" },
  { field: "location", headerName: "Location", width: 160 },
];

const TREE_DATA_ROWS = [
  // "Engineering"/"Frontend"/"Backend" are real rows — each has its own
  // headcount/location *and* children, showing a real row can be an
  // ancestor too, not just a leaf.
  {
    id: "eng",
    path: ["Engineering"],
    headcount: 42,
    location: "Remote",
  },
  {
    id: "fe",
    path: ["Engineering", "Frontend"],
    headcount: 18,
    location: "Berlin",
  },
  { id: "ada", path: ["Engineering", "Frontend", "Ada"], location: "Berlin" },
  {
    id: "grace",
    path: ["Engineering", "Frontend", "Grace"],
    location: "Berlin",
  },
  {
    id: "be",
    path: ["Engineering", "Backend"],
    headcount: 24,
    location: "Austin",
  },
  { id: "alan", path: ["Engineering", "Backend", "Alan"], location: "Austin" },
  // "Sales" has no row of its own — GRID_TREE_DATA_GROUPING_COL_DEF
  // auto-generates a synthetic group for it from these two leaves' paths.
  { id: "rachel", path: ["Sales", "Rachel"], location: "New York" },
  { id: "tom", path: ["Sales", "Tom"], location: "Chicago" },
];

// Renders <md-data-grid-tree>, not the shared meta.component "md-data-grid"
// above — the only story in this file that does, since treeData now lives
// on that dedicated subclass (data-grid-tree.js) rather than as a flag on
// the base grid.
/** @type {Story} */
export const TreeData = {
  render: () => {
    /** @type {HTMLElement | undefined} */
    let log;
    return html`
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <md-data-grid-tree
          checkbox-selection
          style="height: 400px; width: 640px; display: block;"
          @md-data-grid-row-selection-model-change=${(
            /** @type {CustomEvent} */ e,
          ) => {
            if (!log) return;
            const ids = [...e.detail];
            log.textContent =
              ids.length === 0 ? "No rows selected." : `Selected: ${ids}`;
          }}
          ${ref((el) => {
            const grid = /** @type {MdDataGridTree | undefined} */ (
              /** @type {unknown} */ (el)
            );
            if (!grid) return;
            grid.getDataPath = (row) =>
              /** @type {{ path: string[] }} */ (row).path;
            grid.autoGroupColumnDef = { headerName: "Team" };
            grid.columns = TREE_DATA_COLUMNS;
            grid.rows = TREE_DATA_ROWS;
          })}
        ></md-data-grid-tree>
        <span
          ${ref((el) => (log = /** @type {HTMLElement | undefined} */ (el)))}
          style="font-family: monospace; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);"
        >
          Collapsed by default — click a group's arrow to expand it.
          "Engineering"/"Frontend"/"Backend" are real rows with their own
          headcount; "Sales" has no row of its own and is auto-generated from
          its two members' paths. Checking a group's box cascades to every
          descendant, with an indeterminate state on partial selection.
        </span>
      </div>
    `;
  },
};
