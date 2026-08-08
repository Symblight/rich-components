import { MdDataGrid } from "./base/data-grid.js";
import { MdDataCell } from "./components/cell/data-grid-cell.js";
import { MdDataHeaderCell } from "./components/header-cell/data-grid-header-cell.js";
import { MdDataGridColumn } from "./components/column/data-grid-column.js";
import { MdDataFooter } from "./components/footer/data-grid-footer.js";
import { MdDataColumnSeparator } from "./components/column-separator/data-grid-column-separator.js";
import { MdDataColumnTitle } from "./components/column-title/data-grid-column-title.js";
import { MdDataGridCheckboxCell } from "./components/checkbox-cell/data-grid-checkbox-cell.js";
import { MdDataGridCheckboxHeader } from "./components/checkbox-header/data-grid-checkbox-header.js";

declare global {
  interface HTMLElementTagNameMap {
    "md-data-grid": MdDataGrid;
    "md-data-grid-cell": MdDataCell;
    "md-data-grid-header-cell": MdDataHeaderCell;
    "md-data-grid-column": MdDataGridColumn;
    "md-data-grid-footer": MdDataFooter;
    "md-data-grid-column-separator": MdDataColumnSeparator;
    "md-data-grid-column-title": MdDataColumnTitle;
    "md-data-grid-checkbox-cell": MdDataGridCheckboxCell;
    "md-data-grid-checkbox-header": MdDataGridCheckboxHeader;
  }
}
