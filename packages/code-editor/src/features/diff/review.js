import {
  acceptChunk,
  getChunks,
  getOriginalDoc,
  rejectChunk,
  unifiedMergeView,
  updateOriginalDoc,
} from "@codemirror/merge";
import { ChangeSet, Facet, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";

import { ChunkHeaderWidget, clearFlash, flashLines, lineSpan } from "./shared.js";

/** Caps diff work so a huge or wildly different file falls back to coarse chunks instead of
 *  holding the main thread. */
export const DIFF_CONFIG = { scanLimit: 500, timeout: 50 };

const FLASH_MS = 1200;

/**
 * @typedef {import("./shared.js").CdxDiffConfig} CdxDiffConfig
 * @typedef {import("./shared.js").CdxChunkModel} CdxChunkModel
 * @typedef {import("@codemirror/merge").Chunk} Chunk
 * @typedef {{ onDecision: (decision: "accepted" | "rejected", count: number) => void }} ReviewHooks
 */

/** @type {Facet<{ config: CdxDiffConfig, hooks: ReviewHooks } | null, { config: CdxDiffConfig, hooks: ReviewHooks } | null>} */
const reviewInput = Facet.define({ combine: (values) => values[0] ?? null });

/** Pending proposals, in document order; empty when no review is active.
 * @param {import("@codemirror/state").EditorState} state @returns {readonly Chunk[]} */
export function reviewChunks(state) {
  return state.facet(reviewInput) ? (getChunks(state)?.chunks ?? []) : [];
}

/** @param {import("@codemirror/state").EditorState} state @param {Chunk} chunk
 *  @param {number} index @param {number} total @returns {CdxChunkModel} */
export function reviewModel(state, chunk, index, total) {
  const original = getOriginalDoc(state);
  const [fromLine, toLine] = lineSpan(state.doc, chunk.fromB, chunk.endB);
  const [fromA, toA] = lineSpan(original, chunk.fromA, chunk.endA);
  return {
    id: `review:${chunk.fromA}`,
    kind: "review",
    index,
    total,
    added: chunk.fromB === chunk.toB ? 0 : toLine - fromLine + 1,
    removed: chunk.fromA === chunk.toA ? 0 : toA - fromA + 1,
    fromLine,
    toLine,
  };
}

/** @param {readonly Chunk[]} chunks @param {number} pos */
const chunkAt = (chunks, pos) =>
  chunks.find((chunk) => chunk.fromB === pos) ??
  chunks.find((chunk) => chunk.fromB <= pos && pos <= chunk.endB);

/** After a decision the caret moves on to the next proposal, like the spec's review flow.
 * @param {EditorView} view @param {number} from */
function moveToNext(view, from) {
  const chunks = reviewChunks(view.state);
  const next = chunks.find((chunk) => chunk.fromB >= from) ?? chunks[0];
  if (!next) return;
  view.dispatch({
    selection: { anchor: next.fromB },
    effects: EditorView.scrollIntoView(next.fromB, { y: "nearest", yMargin: 48 }),
  });
}

/** @param {EditorView} view @param {number} [pos] */
export function acceptAt(view, pos = view.state.selection.main.head) {
  const input = view.state.facet(reviewInput);
  const chunk = chunkAt(reviewChunks(view.state), pos);
  if (!input || !chunk || !acceptChunk(view, chunk.fromB)) return false;
  input.hooks.onDecision("accepted", 1);
  if (chunk.fromB < chunk.toB) {
    view.dispatch({ effects: flashLines.of({ from: chunk.fromB, to: chunk.endB }) });
    setTimeout(() => {
      if (view.dom.isConnected) view.dispatch({ effects: clearFlash.of(null) });
    }, FLASH_MS);
  }
  moveToNext(view, chunk.fromB);
  return true;
}

/** @param {EditorView} view @param {number} [pos] */
export function rejectAt(view, pos = view.state.selection.main.head) {
  const input = view.state.facet(reviewInput);
  const chunk = chunkAt(reviewChunks(view.state), pos);
  if (!input || !chunk || !rejectChunk(view, chunk.fromB)) return false;
  input.hooks.onDecision("rejected", 1);
  moveToNext(view, chunk.fromB);
  return true;
}

/** Every proposal into the review base, as one original-doc change — one undo-free step, one event.
 *  Mirrors @codemirror/merge's acceptChunk per chunk.
 * @param {EditorView} view */
export function acceptAll(view) {
  const input = view.state.facet(reviewInput);
  const chunks = reviewChunks(view.state);
  if (!input || !chunks.length) return false;
  const { state } = view;
  const original = getOriginalDoc(state);
  const specs = chunks.map((chunk) => {
    let insert = state.sliceDoc(chunk.fromB, Math.max(chunk.fromB, chunk.toB - 1));
    if (chunk.fromB !== chunk.toB && chunk.toA <= original.length) insert += state.lineBreak;
    return { from: chunk.fromA, to: Math.min(original.length, chunk.toA), insert };
  });
  const changes = ChangeSet.of(specs, original.length);
  view.dispatch({
    effects: updateOriginalDoc.of({ doc: changes.apply(original), changes }),
    userEvent: "accept",
  });
  input.hooks.onDecision("accepted", chunks.length);
  return true;
}

/** Every proposal reverted in one transaction. Mirrors @codemirror/merge's rejectChunk per chunk.
 * @param {EditorView} view */
export function rejectAll(view) {
  const input = view.state.facet(reviewInput);
  const chunks = reviewChunks(view.state);
  if (!input || !chunks.length) return false;
  const { state } = view;
  const original = getOriginalDoc(state);
  const changes = chunks.map((chunk) => {
    let insert = original.sliceString(chunk.fromA, Math.max(chunk.fromA, chunk.toA - 1));
    if (chunk.fromA !== chunk.toA && chunk.toB <= state.doc.length) insert += state.lineBreak;
    return { from: chunk.fromB, to: Math.min(state.doc.length, chunk.toB), insert };
  });
  view.dispatch({ changes, userEvent: "revert" });
  input.hooks.onDecision("rejected", chunks.length);
  return true;
}

/** @param {import("@codemirror/state").EditorState} state */
function buildHeaders(state) {
  const input = state.facet(reviewInput);
  const chunks = reviewChunks(state);
  if (!input || !chunks.length) return Decoration.none;
  const { config } = input;
  const actions = [
    {
      label: config.rejectLabel,
      variant: /** @type {const} */ ("text"),
      title: `${config.rejectLabel} (Mod-Alt-Backspace)`,
      run: (/** @type {EditorView} */ view, /** @type {number} */ pos) => rejectAt(view, pos),
    },
    {
      label: config.acceptLabel,
      variant: /** @type {const} */ ("filled"),
      icon: "check",
      title: `${config.acceptLabel} (Mod-Alt-Enter)`,
      run: (/** @type {EditorView} */ view, /** @type {number} */ pos) => acceptAt(view, pos),
    },
  ];
  return Decoration.set(
    chunks.map((chunk, index) =>
      Decoration.widget({
        widget: new ChunkHeaderWidget(
          reviewModel(state, chunk, index, chunks.length),
          config,
          actions,
          true,
        ),
        block: true,
        // the merge view's deleted block sits at side -1 on the same position; the header goes above
        side: -2,
      }).range(chunk.fromB),
    ),
  );
}

const headersField = StateField.define({
  create: buildHeaders,
  update(value, tr) {
    const same =
      tr.state.facet(reviewInput) === tr.startState.facet(reviewInput) &&
      reviewChunks(tr.state) === reviewChunks(tr.startState);
    return same ? value.map(tr.changes) : buildHeaders(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Proposals (an agent's, a colleague's) shown inline against `reviewBase`: removed lines as a
 * block above their replacement, a header per chunk with Reject / Accept. Accepting folds the
 * chunk into the review base; rejecting reverts the text.
 * @param {string} reviewBase @param {CdxDiffConfig} config @param {ReviewHooks} hooks
 */
export function reviewFeature(reviewBase, config, hooks) {
  return [
    reviewInput.of({ config, hooks }),
    unifiedMergeView({
      original: reviewBase,
      gutter: false,
      highlightChanges: false,
      syntaxHighlightDeletions: true,
      mergeControls: false,
      diffConfig: DIFF_CONFIG,
    }),
    headersField,
    keymap.of([
      { key: "Mod-Alt-Enter", run: (view) => acceptAt(view) },
      { key: "Mod-Alt-Backspace", run: (view) => rejectAt(view) },
    ]),
  ];
}
