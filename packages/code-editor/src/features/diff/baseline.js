import { Chunk } from "@codemirror/merge";
import { Facet, StateEffect, StateField, Text } from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";

import { DIFF_CONFIG } from "./review.js";
import { ChunkHeaderWidget, GhostLinesWidget, lineSpan } from "./shared.js";

/**
 * @typedef {import("./shared.js").CdxDiffConfig} CdxDiffConfig
 * @typedef {import("./shared.js").CdxChunkModel} CdxChunkModel
 * @typedef {{ text: string, config: CdxDiffConfig, expanded: boolean }} BaselineInput
 * @typedef {{ original: Text, chunks: readonly Chunk[], peek: number | null, input: BaselineInput }} BaselineState
 * `peek` is a document position inside the one chunk opened by clicking its gutter mark.
 */

/** @type {Facet<BaselineInput | null, BaselineInput | null>} */
const baselineInput = Facet.define({ combine: (values) => values[0] ?? null });

/** Opens (a position inside a chunk) or closes (null) the one-chunk peek. */
export const setPeek = /** @type {import("@codemirror/state").StateEffectType<number | null>} */ (
  StateEffect.define()
);

/** @param {string} text */
const toText = (text) => Text.of(text.split(/\r\n?|\n/));

/** @param {readonly Chunk[]} chunks @param {number} pos */
export const baselineChunkAt = (chunks, pos) =>
  chunks.find((chunk) => chunk.fromB <= pos && pos <= Math.max(chunk.fromB, chunk.endB));

/** Chunks against the baseline, kept up to date incrementally with every edit. */
export const baselineField = /** @type {StateField<BaselineState | null>} */ (
  StateField.define({
    /** @returns {BaselineState | null} */
    create(state) {
      const input = state.facet(baselineInput);
      if (!input) return null;
      const original = toText(input.text);
      return { original, chunks: Chunk.build(original, state.doc, DIFF_CONFIG), peek: null, input };
    },
    /** @param {BaselineState | null} value @param {import("@codemirror/state").Transaction} tr
     *  @returns {BaselineState | null} */
    update(value, tr) {
      const input = tr.state.facet(baselineInput);
      if (!input) return null;
      if (!value || input.text !== value.input.text) {
        const original = toText(input.text);
        return {
          original,
          chunks: Chunk.build(original, tr.state.doc, DIFF_CONFIG),
          peek: null,
          input,
        };
      }
      let { chunks } = value;
      /** @type {number | null} */
      let peek = value.peek;
      if (tr.docChanged) {
        chunks = Chunk.updateB(chunks, value.original, tr.state.doc, tr.changes, DIFF_CONFIG);
        if (peek !== null) peek = tr.changes.mapPos(peek);
      }
      for (const effect of tr.effects) if (effect.is(setPeek)) peek = effect.value;
      if (peek !== null && !baselineChunkAt(chunks, peek)) peek = null;
      if (chunks === value.chunks && peek === value.peek && input === value.input) return value;
      return { original: value.original, chunks, peek, input };
    },
  })
);

/** @param {BaselineState} baseline @param {Chunk} chunk */
const isExpanded = (baseline, chunk) =>
  baseline.input.expanded ||
  (baseline.peek !== null && baselineChunkAt(baseline.chunks, baseline.peek) === chunk);

/** Expanded chunks: the whole diff when `expanded`, else just the peeked one.
 * @param {import("@codemirror/state").EditorState} state @returns {readonly Chunk[]} */
export function expandedBaselineChunks(state) {
  const baseline = state.field(baselineField, false);
  if (!baseline) return [];
  return baseline.chunks.filter((chunk) => isExpanded(baseline, chunk));
}

/** @param {import("@codemirror/state").EditorState} state */
export function baselineChunks(state) {
  return state.field(baselineField, false)?.chunks ?? [];
}

/** @param {import("@codemirror/state").EditorState} state @param {Chunk} chunk
 *  @param {number} index @param {number} total @returns {CdxChunkModel} */
export function baselineModel(state, chunk, index, total) {
  const baseline = /** @type {BaselineState} */ (state.field(baselineField));
  const [fromLine, toLine] = lineSpan(state.doc, chunk.fromB, chunk.endB);
  const [fromA, toA] = lineSpan(baseline.original, chunk.fromA, chunk.endA);
  return {
    id: `baseline:${chunk.fromA}`,
    kind: "baseline",
    index,
    total,
    added: chunk.fromB === chunk.toB ? 0 : toLine - fromLine + 1,
    removed: chunk.fromA === chunk.toA ? 0 : toA - fromA + 1,
    fromLine,
    toLine,
  };
}

/** Back to the baseline for the chunk at `pos` — work is lost, hence the error-colored button.
 * @param {EditorView} view @param {number} [pos] */
export function revertAt(view, pos = view.state.selection.main.head) {
  const baseline = view.state.field(baselineField, false);
  const chunk = baseline && baselineChunkAt(baseline.chunks, pos);
  if (!baseline || !chunk) return false;
  const { state } = view;
  let insert = baseline.original.sliceString(chunk.fromA, Math.max(chunk.fromA, chunk.toA - 1));
  if (chunk.fromA !== chunk.toA && chunk.toB <= state.doc.length) insert += state.lineBreak;
  view.dispatch({
    changes: { from: chunk.fromB, to: Math.min(state.doc.length, chunk.toB), insert },
    effects: setPeek.of(null),
    userEvent: "revert",
  });
  return true;
}

/** @param {EditorView} view @param {number} pos */
export function togglePeek(view, pos) {
  const baseline = view.state.field(baselineField, false);
  const chunk = baseline && baselineChunkAt(baseline.chunks, pos);
  if (!baseline || !chunk) return false;
  const open = baseline.peek !== null && baselineChunkAt(baseline.chunks, baseline.peek) === chunk;
  view.dispatch({ effects: setPeek.of(open ? null : chunk.fromB) });
  return true;
}

const addedLine = Decoration.line({ class: "cdx-line-added" });

/** @param {import("@codemirror/state").EditorState} state */
function buildDecorations(state) {
  const baseline = state.field(baselineField, false);
  if (!baseline) return Decoration.none;
  const { config, expanded } = baseline.input;
  /** @type {import("./shared.js").HeaderAction[]} */
  const actions = [
    {
      label: config.revertLabel,
      variant: /** @type {const} */ ("danger"),
      title: `${config.revertLabel} to ${config.author}`,
      run: (/** @type {EditorView} */ view, /** @type {number} */ pos) => revertAt(view, pos),
    },
  ];
  if (!expanded) {
    actions.push({
      label: "Close",
      variant: /** @type {const} */ ("icon"),
      icon: "close",
      title: "Close (Escape)",
      run: (view) => view.dispatch({ effects: setPeek.of(null) }),
    });
  }
  /** @type {import("@codemirror/state").Range<Decoration>[]} */
  const ranges = [];
  const all = baseline.chunks;
  all.forEach((chunk, index) => {
    if (!isExpanded(baseline, chunk)) return;
    const model = baselineModel(state, chunk, index, all.length);
    ranges.push(
      Decoration.widget({
        widget: new ChunkHeaderWidget(model, config, actions, false),
        block: true,
        side: -2,
      }).range(chunk.fromB),
    );
    if (chunk.fromA !== chunk.toA) {
      const removed = baseline.original.sliceString(chunk.fromA, Math.max(chunk.fromA, chunk.endA));
      ranges.push(
        Decoration.widget({ widget: new GhostLinesWidget(removed), block: true, side: -1 }).range(
          chunk.fromB,
        ),
      );
    }
    if (chunk.fromB !== chunk.toB) {
      for (let pos = chunk.fromB; pos <= Math.min(chunk.endB, state.doc.length);) {
        const line = state.doc.lineAt(pos);
        ranges.push(addedLine.range(line.from));
        pos = line.to + 1;
      }
    }
  });
  return Decoration.set(ranges, true);
}

const decorationsField = StateField.define({
  create: buildDecorations,
  update(value, tr) {
    return tr.state.field(baselineField, false) === tr.startState.field(baselineField, false)
      ? value.map(tr.changes)
      : buildDecorations(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Changes against a baseline (HEAD): quiet by default — only gutter marks, one chunk opens on a
 * mark click with Revert; `expanded` shows every chunk inline ("Diff vs HEAD").
 * @param {string} text @param {CdxDiffConfig} config @param {boolean} expanded
 */
export function baselineFeature(text, config, expanded) {
  return [
    baselineInput.of({ text, config, expanded }),
    baselineField,
    decorationsField,
    keymap.of([
      {
        key: "Escape",
        run: (view) => {
          if (view.state.field(baselineField, false)?.peek == null) return false;
          view.dispatch({ effects: setPeek.of(null) });
          return true;
        },
      },
    ]),
  ];
}
