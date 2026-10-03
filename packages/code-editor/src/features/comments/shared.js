/**
 * @typedef {{ id?: string, name: string, avatarUrl?: string }} CdxCommentAuthor
 * @typedef {{
 *   id: string,
 *   author: CdxCommentAuthor,
 *   body: string,
 *   createdAt: number | string,
 *   editedAt?: number | string,
 * }} CdxComment
 * @typedef {{ from: number, to: number }} CdxCommentRange
 * @typedef {{
 *   id: string,
 *   line: number,
 *   range?: CdxCommentRange,
 *   lineText?: string,
 *   comments: CdxComment[],
 *   resolved?: boolean,
 *   collapsed?: boolean,
 *   outdated?: boolean,
 * }} CdxThread
 * `line` is 1-based. `range` holds document offsets and follows edits.
 * @typedef {{
 *   threadId: string | null,
 *   commentId?: string,
 *   line: number,
 *   range: CdxCommentRange | null,
 *   body: string,
 *   isReply: boolean,
 *   isEdit: boolean,
 * }} CdxCommentDraft
 * @typedef {"comment" | "resolved"} CdxCommentTone
 * @typedef {{ action: "resolve", resolved: boolean } | { action: "delete", commentIds: string[] }} CdxThreadPending
 * A thread action the host hasn't answered yet (cancelled event, or controlled `threads`).
 */

/** @param {string} prefix */
export const uid = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

/** @param {CdxThread} thread @returns {CdxCommentTone} */
export function toneOf(thread) {
  return thread.resolved || thread.outdated ? "resolved" : "comment";
}

/** @param {number | string} value */
export function relativeTime(value) {
  const time = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(time)) return "";
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(time).toLocaleDateString();
}

/** Own = same `id`, else same `name`.
 * @param {CdxCommentAuthor} author @param {CdxCommentAuthor} me */
export const isOwn = (author, me) =>
  author.id !== undefined && me.id !== undefined ? author.id === me.id : author.name === me.name;

/** The permission rules the buttons and the bulk methods share.
 * @typedef {import("./comments.js").CdxCommentsConfig} CdxCommentsConfig */

/** @param {CdxCommentsConfig} config @param {CdxThread} thread */
export const canResolveThread = (config, thread) =>
  config.resolvable && (config.canResolve?.(thread) ?? true);

/** @param {CdxCommentsConfig} config @param {CdxComment} comment @param {CdxThread} thread */
export const canEditComment = (config, comment, thread) =>
  isOwn(comment.author, config.author) && (config.canEdit?.(comment, thread) ?? true);

/** @param {CdxCommentsConfig} config @param {CdxComment} comment @param {CdxThread} thread */
export const canDeleteComment = (config, comment, thread) =>
  isOwn(comment.author, config.author) && (config.canDelete?.(comment, thread) ?? true);

/**
 * Event details. `file` is the editor's `filename`; `line` is 1-based.
 * @typedef {{ line: number, file: string, threadId: string | null, source: "gutter" | "keyboard" | "api", range: CdxCommentRange | null }} CdxCommentOpenDetail
 * @typedef {{ threadId: string, line: number, file: string, isReply: boolean, length: number }} CdxCommentDraftDetail
 * @typedef {{ threadId: string, line: number, file: string, body: string, isReply: boolean, range: CdxCommentRange | null, lineText: string }} CdxCommentSubmitDetail
 * @typedef {{ threadId: string, line: number, file: string, isReply: boolean, hadDraft: boolean, reason: "button" | "escape" | "replaced" | "removed", wasSending: boolean }} CdxCommentCancelDetail
 * @typedef {{ threadId: string, line: number, file: string, commentId: string, body: string, previous: string }} CdxCommentEditDetail
 * @typedef {{ threadId: string, line: number, file: string, commentId: string }} CdxCommentDeleteDetail
 * @typedef {{ threadId: string, line: number, file: string, resolved: boolean }} CdxCommentResolveDetail
 * @typedef {{ threadId: string, line: number, file: string, expanded: boolean }} CdxCommentToggleDetail
 * @typedef {{ threadId: string, line: number, file: string, index: number, count: number }} CdxCommentNavigateDetail
 */
