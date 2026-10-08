export { CdxCodeEditor } from "./components/code-editor/code-editor.js";
export { CdxDiff } from "./features/diff/diff.js";
export { CdxFooter } from "./features/footer/footer.js";
export { CdxComments } from "./features/comments/comments.js";
export { defineCdxPlugin } from "./core/plugin.js";
export { symbolProvider, syntaxTreeSymbols } from "./core/symbols.js";

/** @typedef {import("./core/plugin.js").CdxPlugin} CdxPlugin */
/** @typedef {import("./core/plugin.js").CdxExtensionLoader} CdxExtensionLoader */
/** @typedef {import("./components/code-editor/code-editor.js").CdxChangeDetail} CdxChangeDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxSelectionChangeDetail} CdxSelectionChangeDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxContextMenuDetail} CdxContextMenuDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxReviewBaseChangeDetail} CdxReviewBaseChangeDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxDiffStats} CdxDiffStats */
/** @typedef {import("./components/code-editor/code-editor.js").CdxChunkModel} CdxChunkModel */
/** @typedef {import("./features/diff/shared.js").CdxCollapseUnchanged} CdxCollapseUnchanged */
/** @typedef {import("./components/code-editor/code-editor.js").CdxSymbolsChangeDetail} CdxSymbolsChangeDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxBeforeChangeDetail} CdxBeforeChangeDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxStateOptions} CdxStateOptions */
/** @typedef {import("./core/symbols.js").CdxSymbol} CdxSymbol */
/** @typedef {import("./core/symbols.js").CdxSymbolProvider} CdxSymbolProvider */
/** @typedef {import("./features/comments/shared.js").CdxThread} CdxThread */
/** @typedef {import("./features/comments/shared.js").CdxComment} CdxComment */
/** @typedef {import("./features/comments/shared.js").CdxCommentAuthor} CdxCommentAuthor */
/** @typedef {import("./features/comments/shared.js").CdxCommentDraft} CdxCommentDraft */
/** @typedef {import("./types/api.js").CdxCodeEditorApi} CdxCodeEditorApi */
/** @typedef {import("./types/api.js").CdxCodeEditorNamespace} CdxCodeEditorNamespace */
/** @typedef {import("./types/api.js").CdxDocApi} CdxDocApi */
/** @typedef {import("./types/api.js").CdxSelectionApi} CdxSelectionApi */
/** @typedef {import("./types/api.js").CdxNavigationApi} CdxNavigationApi */
/** @typedef {import("./types/api.js").CdxSearchApi} CdxSearchApi */
/** @typedef {import("./types/api.js").CdxSearchQuery} CdxSearchQuery */
/** @typedef {import("./types/api.js").CdxDiffApi} CdxDiffApi */
/** @typedef {import("./types/api.js").CdxProblemsApi} CdxProblemsApi */
/** @typedef {import("./types/api.js").CdxCommentsApi} CdxCommentsApi */
/** @typedef {import("./types/api.js").CdxLineColumn} CdxLineColumn */
/** @typedef {import("./types/api.js").CdxProblemCounts} CdxProblemCounts */
/** @typedef {import("./types/api.js").CdxScrollOptions} CdxScrollOptions */
