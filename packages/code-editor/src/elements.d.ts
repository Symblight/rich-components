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
import { CdxComments } from "./features/comments/comments.js";
import { CdxCommentsBar } from "./features/comments/comments-bar.js";
import { CdxCommentsNav } from "./components/comments-nav/comments-nav.js";
import { CdxCommentField } from "./components/comment-field/comment-field.js";
import { CdxCommentItem } from "./components/comment-item/comment-item.js";
import { CdxCommentThread } from "./components/comment-thread/comment-thread.js";
import {
  CdxCommentOpenDetail,
  CdxCommentDraftDetail,
  CdxCommentSubmitDetail,
  CdxCommentCancelDetail,
  CdxCommentEditDetail,
  CdxCommentDeleteDetail,
  CdxCommentResolveDetail,
  CdxCommentToggleDetail,
  CdxCommentNavigateDetail,
} from "./features/comments/shared.js";

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
    "cdx-comments": CdxComments;
    "cdx-comments-bar": CdxCommentsBar;
    "cdx-comments-nav": CdxCommentsNav;
    "cdx-comment-field": CdxCommentField;
    "cdx-comment-item": CdxCommentItem;
    "cdx-comment-thread": CdxCommentThread;
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
    "cdx-comment-open": CustomEvent<CdxCommentOpenDetail>;
    "cdx-comment-draft": CustomEvent<CdxCommentDraftDetail>;
    "cdx-comment-submit": CustomEvent<CdxCommentSubmitDetail>;
    "cdx-comment-cancel": CustomEvent<CdxCommentCancelDetail>;
    "cdx-comment-edit": CustomEvent<CdxCommentEditDetail>;
    "cdx-comment-delete": CustomEvent<CdxCommentDeleteDetail>;
    "cdx-comment-resolve": CustomEvent<CdxCommentResolveDetail>;
    "cdx-comment-toggle": CustomEvent<CdxCommentToggleDetail>;
    "cdx-comment-navigate": CustomEvent<CdxCommentNavigateDetail>;
  }
}

export {};
