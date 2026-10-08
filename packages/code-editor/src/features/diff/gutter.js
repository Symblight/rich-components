import { RangeSetBuilder, StateField } from "@codemirror/state";
import { gutter, GutterMarker, gutterLineClass } from "@codemirror/view";

import { baselineChunkAt, baselineField, expandedBaselineChunks, togglePeek } from "./baseline.js";
import { reviewChunks } from "./review.js";
import { gutterHover } from "../../core/gutter-hover.js";
import { addedGutterClass, isDeletedBlock } from "./shared.js";

/** @typedef {"added" | "modified" | "deleted" | "deleted-end" | "deleted-row"} MarkKind */

/** Where a line sits in a run of same-kind bars: only the run's ends are rounded. */
/** @typedef {"single" | "first" | "middle" | "last"} RunEdge */

class ChangeMarker extends GutterMarker {
  /** @param {MarkKind} kind @param {boolean} peekable @param {RunEdge} edge */
  constructor(kind, peekable, edge) {
    super();
    this.kind = kind;
    this.peekable = peekable;
    this.elementClass =
      `cdx-vcs-marker cdx-vcs-marker_${kind} cdx-vcs-marker_${edge}` +
      (peekable ? " cdx-vcs-marker_peekable" : "");
  }

  /** @param {GutterMarker} other */
  eq(other) {
    return other instanceof ChangeMarker && other.elementClass === this.elementClass;
  }
}

const marker = /** @type {Record<string, ChangeMarker>} */ ({});
/** @param {MarkKind} kind @param {boolean} [peekable] @param {RunEdge} [edge] */
const markerOf = (kind, peekable = false, edge = "single") =>
  (marker[`${kind}:${peekable}:${edge}`] ??= new ChangeMarker(kind, peekable, edge));

/** @param {ChangeMarker | undefined} a @param {ChangeMarker | undefined} b */
const joins = (a, b) =>
  !!a &&
  !!b &&
  a.kind === b.kind &&
  a.peekable === b.peekable &&
  (a.kind === "added" || a.kind === "modified");

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
    const mark = /** @type {ChangeMarker} */ (marks.get(from));
    const line = doc.lineAt(from);
    const up = line.number > 1 && joins(mark, marks.get(doc.line(line.number - 1).from));
    const down = line.number < doc.lines && joins(mark, marks.get(doc.line(line.number + 1).from));
    /** @type {RunEdge} */
    const edge = up ? (down ? "middle" : "last") : down ? "first" : "single";
    markBuilder.add(from, from, markerOf(mark.kind, mark.peekable, edge));
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

/** Hovering any line of a HEAD chunk's mark widens the whole chunk's bar — one marker, not N. */
const chunkHover = gutterHover({
  gutter: "cdx-vcs-gutter",
  className: "cdx-vcs-marker_hovered",
  onlyOverGutter: true,
  rangeAt(view, block) {
    const baseline = view.state.field(baselineField, false);
    const chunk = baseline && baselineChunkAt(baseline.chunks, block.from);
    // an expanded chunk is shown inline and has no peek to open
    if (!chunk || expandedBaselineChunks(view.state).includes(chunk)) return null;
    return [chunk.fromB, Math.max(chunk.fromB, chunk.endB)];
  },
});

/**
 * The 10dp change column left of the line numbers, shared by both layers: baseline marks
 * (clickable, open a peek), review/expanded added lines, and a bar beside removed-line blocks.
 * Always present while a diff layer is on, so text never shifts when a mark appears.
 */
export const changesGutter = [
  gutterField,
  chunkHover,
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
