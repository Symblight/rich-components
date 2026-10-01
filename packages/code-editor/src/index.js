export { CdxCodeEditor } from "./components/code-editor/code-editor.js";
export { CdxDiff } from "./features/diff/diff.js";
export { CdxFooter } from "./features/footer/footer.js";
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
/** @typedef {import("./components/code-editor/code-editor.js").CdxSymbolsChangeDetail} CdxSymbolsChangeDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxBeforeChangeDetail} CdxBeforeChangeDetail */
/** @typedef {import("./components/code-editor/code-editor.js").CdxStateOptions} CdxStateOptions */
/** @typedef {import("./core/symbols.js").CdxSymbol} CdxSymbol */
/** @typedef {import("./core/symbols.js").CdxSymbolProvider} CdxSymbolProvider */
