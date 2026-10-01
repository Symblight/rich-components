import {
  CdxCodeEditor,
  CdxChangeDetail,
  CdxReviewBaseChangeDetail,
  CdxDiffStats,
  CdxSelectionChangeDetail,
  CdxContextMenuDetail,
  CdxSymbolsChangeDetail,
  CdxBeforeChangeDetail,
} from "./components/code-editor/code-editor.js";
import { CdxGoToLine } from "./components/go-to-line/go-to-line.js";
import { CdxProblemsIndicator } from "./components/problems-indicator/problems-indicator.js";
import { CdxQuickFix } from "./components/quick-fix/quick-fix.js";
import { CdxDiff } from "./features/diff/diff.js";
import { CdxReviewBar } from "./components/review-bar/review-bar.js";
import { CdxStatusBar } from "./components/status-bar/status-bar.js";
import { CdxFooter } from "./features/footer/footer.js";

declare global {
  interface HTMLElementTagNameMap {
    "cdx-code-editor": CdxCodeEditor;
    "cdx-diff": CdxDiff;
    "cdx-review-bar": CdxReviewBar;
    "cdx-footer": CdxFooter;
    "cdx-status-bar": CdxStatusBar;
    "cdx-problems-indicator": CdxProblemsIndicator;
    "cdx-quick-fix": CdxQuickFix;
    "cdx-go-to-line": CdxGoToLine;
  }

  interface HTMLElementEventMap {
    "cdx-change": CustomEvent<CdxChangeDetail>;
    "cdx-contextmenu": CustomEvent<CdxContextMenuDetail>;
    "cdx-selection-change": CustomEvent<CdxSelectionChangeDetail>;
    "cdx-review-base-change": CustomEvent<CdxReviewBaseChangeDetail>;
    "cdx-diff-change": CustomEvent<CdxDiffStats>;
    "cdx-review-complete": CustomEvent<CdxDiffStats["review"]>;
    "cdx-symbols-change": CustomEvent<CdxSymbolsChangeDetail>;
    "cdx-before-change": CustomEvent<CdxBeforeChangeDetail>;
    "cdx-status-click": CustomEvent<{ item: string; index?: number }>;
  }
}

export {};
