import { Facet, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import { iconElement } from "../../core/icons.js";
import { lineSpan } from "./shared.js";

/**
 * @typedef {import("./shared.js").CdxCollapseUnchanged} CdxCollapseUnchanged
 * @typedef {{ fromB: number, endB: number }} ChangeSpan
 * @typedef {{
 *   kind: string,
 *   key: string,
 *   margin: number,
 *   minSize: number,
 *   chunks: (state: import("@codemirror/state").EditorState) => readonly ChangeSpan[],
 * }} CollapseSource
 * A layer whose changes stay visible. `key` changes when its ranges must be rebuilt (new data or
 * new margin/minSize); any other reconfigure keeps what the user already expanded.
 */

/** @type {Facet<CollapseSource>} */
const collapseSource = Facet.define();

/** Expands the collapsed range starting at the given position. */
export const expandCollapsed = /** @type {import("@codemirror/state").StateEffectType<number>} */ (
  StateEffect.define()
);

/** @param {string} kind @param {CdxCollapseUnchanged} spec @param {number} generation
 *  @param {CollapseSource["chunks"]} chunks */
export function collapseUnchanged(kind, spec, generation, chunks) {
  const margin = spec.margin ?? 3;
  const minSize = spec.minSize ?? 4;
  return collapseSource.of({
    kind,
    key: `${generation}:${margin}:${minSize}`,
    margin,
    minSize,
    chunks,
  });
}

/** The "N hidden lines" row: a wavy rule across the gutters and the visible text, with a pill
 *  that reads "Show N lines" on hover. */
export class CollapsedLinesWidget extends WidgetType {
  /** @param {number} lines */
  constructor(lines) {
    super();
    this.lines = lines;
  }

  /** @param {CollapsedLinesWidget} other */
  eq(other) {
    return other.lines === this.lines;
  }

  get estimatedHeight() {
    return 28;
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const root = document.createElement("div");
    root.className = "cdx-collapsed";
    const bar = root.appendChild(document.createElement("div"));
    bar.className = "cdx-collapsed__bar";
    bar.setAttribute("part", "collapsed-lines");

    const label = bar.appendChild(document.createElement("button"));
    label.type = "button";
    // inside contenteditable a focusable button would swallow typing
    label.tabIndex = -1;
    label.className = "cdx-collapsed__label";
    label.setAttribute("part", "collapsed-label");
    const action = view.state.phrase("Show $ lines", this.lines);
    label.setAttribute("aria-label", action);
    const count = label.appendChild(document.createElement("span"));
    count.className = "cdx-collapsed__count";
    count.textContent = view.state.phrase("$ hidden lines", this.lines);
    const show = label.appendChild(document.createElement("span"));
    show.className = "cdx-collapsed__action";
    show.setAttribute("aria-hidden", "true");
    show.append(iconElement("unfold_more"), action);

    root.addEventListener("mousedown", (event) => event.preventDefault());
    root.addEventListener("click", () =>
      view.dispatch({ effects: expandCollapsed.of(view.posAtDOM(root)) }),
    );
    return root;
  }

  ignoreEvent() {
    return true;
  }
}

/** Everything but `margin` lines around each change of every source, in stretches of at least
 *  the largest `minSize`. Like @codemirror/merge's collapseUnchanged, over several layers.
 * @param {import("@codemirror/state").EditorState} state */
function build(state) {
  const sources = state.facet(collapseSource);
  if (!sources.length) return Decoration.none;
  const { doc } = state;
  /** @type {[number, number][]} kept line spans, 1-based */
  const kept = [];
  for (const source of sources) {
    for (const chunk of source.chunks(state)) {
      const [from, to] = lineSpan(doc, chunk.fromB, chunk.endB);
      kept.push([from - source.margin, to + source.margin]);
    }
  }
  kept.sort((a, b) => a[0] - b[0]);
  const minSize = Math.max(...sources.map((source) => source.minSize));
  /** @type {RangeSetBuilder<Decoration>} */
  const builder = new RangeSetBuilder();
  /** @param {number} from @param {number} to */
  const collapse = (from, to) => {
    const lines = to - from + 1;
    if (lines < minSize) return;
    builder.add(
      doc.line(from).from,
      doc.line(to).to,
      Decoration.replace({ widget: new CollapsedLinesWidget(lines), block: true }),
    );
  };
  let next = 1;
  for (const [from, to] of kept) {
    collapse(next, Math.min(from - 1, doc.lines));
    next = Math.max(next, to + 1);
  }
  collapse(next, doc.lines);
  return builder.finish();
}

/** @param {readonly CollapseSource[]} a @param {readonly CollapseSource[]} b */
const sameSources = (a, b) =>
  a.length === b.length &&
  a.every((source) => b.some((other) => other.kind === source.kind && other.key === source.key));

/** Built when the sources change; afterwards it only maps through edits, drops what a click
 *  expanded and what a change now touches — new unchanged stretches don't fold on their own. */
export const collapsedLines = StateField.define({
  create: build,
  update(value, tr) {
    const sources = tr.state.facet(collapseSource);
    if (!sameSources(sources, tr.startState.facet(collapseSource))) return build(tr.state);
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(expandCollapsed))
        next = next.update({ filter: (from) => from !== effect.value });
    }
    if (!next.size) return next;
    /** @type {number[]} */
    const touching = [];
    for (const source of sources) {
      const chunks = source.chunks(tr.state);
      if (chunks === source.chunks(tr.startState)) continue;
      for (const chunk of chunks)
        next.between(chunk.fromB, chunk.endB, (from) => void touching.push(from));
    }
    return touching.length ? next.update({ filter: (from) => !touching.includes(from) }) : next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
