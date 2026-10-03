/** @import { EditorSelection } from "@codemirror/state" */
/** @import { CdxThread, CdxComment, CdxCommentRange } from "../features/comments/shared.js" */
/** @import { CdxSymbol } from "../core/symbols.js" */

/** @typedef {{ line: number, column: number }} CdxLineColumn - 1-based */
/** @typedef {{ errors: number, warnings: number, others: number }} CdxProblemCounts */
/** @typedef {{ align?: "start" | "center" | "end" | "nearest" }} CdxScrollOptions */

/**
 * @typedef {Object} CdxDocApi
 * @property {() => string} getText - O(n) on the first read after an edit
 * @property {() => number} getLength
 * @property {() => number} getLineCount
 * @property {(line: number, column?: number) => number} posAt - clamped to the document
 * @property {(pos: number) => CdxLineColumn} lineAt
 * @property {(from: number, to: number, text: string) => boolean} replace - ignores `readOnly`; `false` when `cdx-before-change` was prevented or nothing is mounted
 * @property {() => boolean} undo - refused under `readOnly`, like CodeMirror's command
 * @property {() => boolean} redo - refused under `readOnly`
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 */

/**
 * @typedef {Object} CdxSelectionApi
 * @property {(anchor: number, head?: number) => void} set - scrolls into view
 * @property {() => EditorSelection | null} get
 * @property {() => string} getText - the main range
 * @property {() => CdxLineColumn | null} getCursor - the main head
 */

/**
 * @typedef {Object} CdxNavigationApi
 * @property {(line: number, column?: number) => boolean} goToLine - caret + center scroll, no focus change
 * @property {() => Promise<void>} openGoToLine - the card takes focus
 * @property {() => void} closeGoToLine
 * @property {(pos: number, options?: CdxScrollOptions) => void} scrollToPosition - no caret change
 * @property {(symbol: CdxSymbol) => void} revealSymbol - caret to `symbol.from` + scroll
 */

/**
 * @typedef {Object} CdxSearchQuery
 * @property {string} search
 * @property {string} replace
 * @property {boolean} caseSensitive
 * @property {boolean} regexp
 * @property {boolean} wholeWord
 */

/**
 * @typedef {Object} CdxSearchApi
 * @property {(query?: Partial<CdxSearchQuery>) => void} open - the panel takes focus
 * @property {() => void} close
 * @property {() => boolean} isOpen
 * @property {(query: Partial<CdxSearchQuery>) => void} setQuery
 * @property {() => CdxSearchQuery} getQuery
 * @property {() => boolean} findNext
 * @property {() => boolean} findPrevious
 * @property {() => boolean} replaceNext - refused under `readOnly`
 * @property {() => boolean} replaceAll - refused under `readOnly`
 * @property {() => boolean} isEnabled - `false` under `no-search`
 */

/**
 * @typedef {Object} CdxDiffApi
 * @property {() => boolean} acceptAll
 * @property {() => boolean} rejectAll
 * @property {() => boolean} next - F7: pending proposals first, then baseline chunks
 * @property {() => boolean} previous - Shift-F7
 * @property {() => void} dismissReview - hides the "Review complete" summary
 * @property {(expanded: boolean) => void} setExpanded - "Diff vs HEAD"; through `<cdx-diff kind="baseline">` when slotted
 * @property {() => boolean} isExpanded
 * @property {() => boolean} isEnabled - `baseline` or `reviewBase` is set
 */

/**
 * @typedef {Object} CdxProblemsApi
 * @property {() => CdxProblemCounts} getCounts
 * @property {() => boolean} first
 * @property {() => boolean} next - F8
 * @property {() => boolean} previous
 * @property {() => void} openQuickFix - Mod-.; no-op when the caret's line has no diagnostics
 */

/**
 * @typedef {Object} CdxCommentsApi
 * @property {(line: number, options?: {range?: CdxCommentRange | null, newThread?: boolean}) => string | null} open - the thread id, or null when cancelled or off
 * @property {() => CdxThread[]} get
 * @property {(thread: CdxThread) => void} add - replaces the thread with its id (uncontrolled)
 * @property {(threadId: string, text: string) => void} setDraft
 * @property {(threadId: string, resolved?: boolean) => void} resolve - acks a cancelled `cdx-comment-resolve`, or resolves (uncontrolled)
 * @property {(threadId: string, commentId: string) => void} remove - acks a cancelled `cdx-comment-delete`, or deletes (uncontrolled)
 * @property {(threadId: string, message: string) => void} fail - a waiting resolve/delete failed
 * @property {(threadId: string, comment?: Partial<CdxComment>, options?: {threadId?: string}) => void} confirmSubmit - the host saved a submitted comment
 * @property {(threadId: string, message: string) => void} failSubmit
 * @property {(resolved?: boolean) => void} resolveAll - one `cdx-comment-resolve` per thread
 * @property {(id?: string) => void} clear - every comment, one comment, or one thread; no events, uncontrolled only
 * @property {(threadId: string) => void} reveal
 * @property {() => void} next
 * @property {() => void} previous
 * @property {() => boolean} isEnabled - a `<cdx-comments slot="comments">` is slotted
 */

/**
 * @typedef {Object} CdxCodeEditorApi
 * @property {CdxDocApi} doc
 * @property {CdxSelectionApi} selection
 * @property {CdxNavigationApi} navigation
 * @property {CdxSearchApi} search
 * @property {CdxDiffApi} diff
 * @property {CdxProblemsApi} problems
 * @property {CdxCommentsApi} comments
 */

/** @typedef {keyof CdxCodeEditorApi} CdxCodeEditorNamespace */

export {};
