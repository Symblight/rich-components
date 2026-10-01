import { RangeSetBuilder, StateField } from "@codemirror/state";
import { gutter, GutterMarker, gutterLineClass } from "@codemirror/view";

import { baselineChunkAt, baselineField, expandedBaselineChunks, togglePeek } from "./baseline.js";
import { reviewChunks } from "./review.js";
import { addedGutterClass, isDeletedBlock } from "./shared.js";

/** @typedef {"added" | "modified" | "deleted" | "deleted-end" | "deleted-row"} MarkKind */

class ChangeMarker extends GutterMarker {
  /** @param {MarkKind} kind @param {boolean} peekable */
  constructor(kind, peekable) {
    super();
    this.kind = kind;
    this.elementClass = `cdx-vcs-marker cdx-vcs-marker_${kind}${peekable ? " cdx-vcs-marker_peekable" : ""}`;
  }

  /** @param {GutterMarker} other */
  eq(other) {
    return other instanceof ChangeMarker && other.elementClass === this.elementClass;
  }
}

const marker = /** @type {Record<string, ChangeMarker>} */ ({});
/** @param {MarkKind} kind @param {boolean} [peekable] */
const markerOf = (kind, peekable = false) =>
  (marker[`${kind}:${peekable}`] ??= new ChangeMarker(kind, peekable));

/**
 * @typedef {{
 *   marks: import("@codemirror/state").RangeSet<GutterMarker>,
 *   lineClasses: import("@codemirror/state").RangeSet<GutterMarker>,
 * }} GutterState
 */

/** @param {import("@codemirror/state").EditorState} state @returns {GutterState} */
function build(state) {
  const { doc } = state;
  /** @type {Map<number, ChangeMarker>} line start → mark; review marks win over baseline ones */
  const marks = new Map();
  /** @type {Set<number>} */
  const addedLines = new Set();

  /** @param {number} from @param {number} to @param {ChangeMarker} mark @param {boolean} added */
  const markLines = (from, to, mark, added) => {
    for (let pos = from; pos <= Math.min(to, doc.length);) {
      const line = doc.lineAt(pos);
      if (!marks.has(line.from)) marks.set(line.from, mark);
      if (added) addedLines.add(line.from);
      pos = line.to + 1;
    }
  };

  for (const chunk of reviewChunks(state)) {
    if (chunk.fromB !== chunk.toB) markLines(chunk.fromB, chunk.endB, markerOf("added"), true);
  }
  const expanded = new Set(expandedBaselineChunks(state));
  for (const chunk of state.field(baselineField, false)?.chunks ?? []) {
    if (expanded.has(chunk)) {
      if (chunk.fromB !== chunk.toB) markLines(chunk.fromB, chunk.endB, markerOf("added"), true);
      continue;
    }
    if (chunk.fromB === chunk.toB) {
      // nothing left in the document — the mark sits on the seam where lines were removed
      const pos = Math.min(chunk.fromB, doc.length);
      const line = doc.lineAt(pos);
      const atEnd = pos === doc.length && pos > line.from;
      if (!marks.has(line.from))
        marks.set(line.from, markerOf(atEnd ? "deleted-end" : "deleted", true));
      continue;
    }
    markLines(
      chunk.fromB,
      chunk.endB,
      markerOf(chunk.fromA === chunk.toA ? "added" : "modified", true),
      false,
    );
  }

  /** @type {RangeSetBuilder<GutterMarker>} */
  const markBuilder = new RangeSetBuilder();
  for (const from of [...marks.keys()].sort((a, b) => a - b)) {
    markBuilder.add(from, from, /** @type {ChangeMarker} */ (marks.get(from)));
  }
  /** @type {RangeSetBuilder<GutterMarker>} */
  const classBuilder = new RangeSetBuilder();
  for (const from of [...addedLines].sort((a, b) => a - b)) {
    classBuilder.add(from, from, addedGutterClass);
  }
  return { marks: markBuilder.finish(), lineClasses: classBuilder.finish() };
}

const gutterField = StateField.define({
  create: build,
  update(value, tr) {
    const same =
      reviewChunks(tr.state) === reviewChunks(tr.startState) &&
      tr.state.field(baselineField, false) === tr.startState.field(baselineField, false);
    return same ? value : build(tr.state);
  },
  provide: (field) => gutterLineClass.from(field, (value) => value.lineClasses),
});

const deletedRow = markerOf("deleted-row");

/**
 * The 10dp change column left of the line numbers, shared by both layers: baseline marks
 * (clickable, open a peek), review/expanded added lines, and a bar beside removed-line blocks.
 * Always present while a diff layer is on, so text never shifts when a mark appears.
 */
export const changesGutter = [
  gutterField,
  gutter({
    class: "cdx-vcs-gutter",
    markers: (view) => view.state.field(gutterField).marks,
    widgetMarker: (_view, widget) => (isDeletedBlock(widget) ? deletedRow : null),
    initialSpacer: () => markerOf("added"),
    domEventHandlers: {
      mousedown(view, line, event) {
        if (/** @type {MouseEvent} */ (event).button !== 0) return false;
        const baseline = view.state.field(baselineField, false);
        if (!baseline || !baselineChunkAt(baseline.chunks, line.from)) return false;
        return togglePeek(view, line.from);
      },
    },
  }),
];
