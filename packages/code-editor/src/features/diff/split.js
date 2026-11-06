import { language } from "@codemirror/language";
import {
  Compartment,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  BlockType,
  Decoration,
  EditorView,
  gutterLineClass,
  lineNumbers,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";

import { diffText } from "../../core/diff-text.js";
import { indentGuidesFeature, wrapFeature } from "../../core/features.js";
import { cdxHighlighting, cdxTheme } from "../../core/theme.js";
import { baselineField } from "./baseline.js";
import { CollapsedLinesWidget, collapsedLines, expandCollapsed } from "./collapse.js";
import { reviewChunks, reviewOriginal } from "./review.js";
import { addedGutterClass, deletedGutterClass, stickyGeometry } from "./shared.js";

/**
 * @typedef {import("@codemirror/merge").Chunk} Chunk
 * @typedef {import("@codemirror/state").EditorState} State
 * @typedef {import("@codemirror/state").Text} Text
 * @typedef {import("@codemirror/state").Extension} Extension
 * @typedef {"unified" | "split"} CdxDiffLayout
 * @typedef {{ lineNumbers: boolean, indentGuides: boolean, wrap: boolean, tabSize: number, extensions: Extension }} SplitOptions
 * What the original pane takes over from the editor's own settings.
 * @typedef {{ getParent: () => HTMLElement, options: () => SplitOptions }} SplitConfig
 * @typedef {{ original: Text, chunks: readonly Chunk[] }} DiffSource
 * @typedef {{ chunks: readonly Chunk[], collapsed: { from: number, to: number, lines: number }[] }} Projection
 */

/** The review's text when a review is on, else the baseline's: what the left pane shows.
 * @param {State} state @returns {DiffSource | null} */
function diffSource(state) {
  const original = reviewOriginal(state);
  if (original) return { original, chunks: reviewChunks(state) };
  const baseline = state.field(baselineField, false);
  return baseline ? { original: baseline.original, chunks: baseline.chunks } : null;
}

/** Unchanged text lines up one to one, so a position outside a chunk just shifts by what came before.
 * @param {readonly Chunk[]} chunks @param {number} pos @param {boolean} toOriginal */
function acrossChunks(chunks, pos, toOriginal) {
  let shift = 0;
  for (const chunk of chunks) {
    const [from, to, fromOther, toOther] = toOriginal
      ? [chunk.fromB, chunk.toB, chunk.fromA, chunk.toA]
      : [chunk.fromA, chunk.toA, chunk.fromB, chunk.toB];
    if (pos < from) break;
    if (pos < to) return fromOther;
    shift = toOther - to;
  }
  return pos + shift;
}

const removedLine = Decoration.line({ class: "cdx-line-removed" });
const addedLine = Decoration.line({ class: "cdx-line-added" });
const removedText = Decoration.mark({ class: "cdx-text-removed" });
const addedText = Decoration.mark({ class: "cdx-text-added" });

/** Line washes and word marks for one side of the chunks, with the gutter tint that goes with them.
 * @param {readonly Chunk[]} chunks @param {Text} doc @param {boolean} isOriginal */
function changeMarks(chunks, doc, isOriginal) {
  const [line, text, gutter] = isOriginal
    ? [removedLine, removedText, deletedGutterClass]
    : [addedLine, addedText, addedGutterClass];
  /** @type {import("@codemirror/state").Range<Decoration>[]} */
  const ranges = [];
  /** @type {import("@codemirror/state").Range<import("@codemirror/view").GutterMarker>[]} */
  const gutters = [];
  for (const chunk of chunks) {
    const [from, to, end] = isOriginal
      ? [chunk.fromA, chunk.toA, chunk.endA]
      : [chunk.fromB, chunk.toB, chunk.endB];
    if (from === to) continue;
    for (let pos = from; pos <= Math.min(end, doc.length);) {
      const { from: start, to: stop } = doc.lineAt(pos);
      ranges.push(line.range(start));
      gutters.push(gutter.range(start));
      pos = stop + 1;
    }
    // a chunk that is all removed or all added says it through its lines already
    if (chunk.fromA === chunk.toA || chunk.fromB === chunk.toB) continue;
    for (const change of chunk.changes) {
      const [changeFrom, changeTo] = isOriginal
        ? [change.fromA, change.toA]
        : [change.fromB, change.toB];
      if (changeFrom < changeTo) ranges.push(text.range(from + changeFrom, from + changeTo));
    }
  }
  return { lines: Decoration.set(ranges, true), gutter: RangeSet.of(gutters, true) };
}

/** The editor's own text, with the marks of the layer it shows. */
const currentMarks = StateField.define({
  create: (state) => changeMarks(diffSource(state)?.chunks ?? [], state.doc, false),
  update(value, tr) {
    const chunks = diffSource(tr.state)?.chunks;
    if (chunks === diffSource(tr.startState)?.chunks) {
      return tr.docChanged
        ? { lines: value.lines.map(tr.changes), gutter: value.gutter.map(tr.changes) }
        : value;
    }
    return changeMarks(chunks ?? [], tr.state.doc, false);
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.lines),
    gutterLineClass.from(field, (value) => value.gutter),
  ],
});

/** Blank room on one side for what the other side has more of. */
class Spacer extends WidgetType {
  /** @param {number} height */
  constructor(height) {
    super();
    this.height = height;
  }

  /** @param {Spacer} other */
  eq(other) {
    return other.height === this.height;
  }

  toDOM() {
    const dom = document.createElement("div");
    dom.className = "cdx-split-spacer";
    dom.setAttribute("aria-hidden", "true");
    dom.style.blockSize = `${this.height}px`;
    return dom;
  }

  /** @param {HTMLElement} dom */
  updateDOM(dom) {
    dom.style.blockSize = `${this.height}px`;
    return true;
  }

  get estimatedHeight() {
    return this.height;
  }

  ignoreEvent() {
    return false;
  }
}

/** @type {import("@codemirror/state").StateEffectType<import("@codemirror/view").DecorationSet>} */
const setSpacers = StateEffect.define({
  map: (value, mapping) => value.map(mapping),
});

const spacers = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setSpacers)) return effect.value;
    return value.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Where the line's text starts: below the block widgets above it, a chunk's header among them.
 * @param {import("@codemirror/view").BlockInfo} block */
function textTop(block) {
  const parts = block.type;
  if (!Array.isArray(parts)) return block.top;
  return parts.find((part) => part.type === BlockType.Text)?.top ?? block.top;
}

/** The pairs of positions that must sit level: both ends of each chunk, and each line in view of
 *  the unchanged text, since a widget or a different wrap can push any of them off.
 * @param {EditorView} original @param {EditorView} current @param {readonly Chunk[]} chunks
 * @returns {[number, number][]} */
function levelPairs(original, current, chunks) {
  /** @type {[number, number][]} */
  const pairs = [];
  const { doc } = current.state;
  const { from: viewFrom, to: viewTo } = current.viewport;
  /** @param {number} fromA @param {number} fromB @param {number} toB */
  const unchanged = (fromA, fromB, toB) => {
    pairs.push([fromA, fromB]);
    for (let pos = Math.max(fromB, viewFrom); pos < Math.min(toB, viewTo);) {
      const line = doc.lineAt(pos);
      if (line.from > fromB) pairs.push([fromA + line.from - fromB, line.from]);
      pos = line.to + 1;
    }
  };
  let fromA = 0;
  let fromB = 0;
  for (const chunk of chunks) {
    unchanged(fromA, fromB, chunk.fromB);
    pairs.push([chunk.fromA, chunk.fromB]);
    fromA = chunk.toA;
    fromB = chunk.toB;
  }
  unchanged(fromA, fromB, doc.length + 1);
  return pairs.filter(([a, b]) => a <= original.state.doc.length && b <= doc.length);
}

/** One view's way through its spacers: `top()` is where a position would sit without them plus the
 *  new ones laid so far, so a round of alignment never builds on the last one. */
class SpacerWalk {
  #iter;
  #installed = 0;
  added = 0;
  /** @type {RangeSetBuilder<Decoration>} */
  builder = new RangeSetBuilder();

  /** @param {EditorView} view */
  constructor(view) {
    this.view = view;
    this.#iter = view.state.field(spacers).iter();
  }

  /** @param {number} pos Skipped when `pos` is inside a fold or a collapsed row. */
  top(pos) {
    const block = this.view.lineBlockAt(pos);
    if (block.from !== pos) return null;
    while (this.#iter.value && this.#iter.from <= pos && this.#iter.value.spec.side < 0) {
      this.#installed += this.#iter.value.spec.widget.height;
      this.#iter.next();
    }
    return textTop(block) - this.#installed + this.added;
  }

  /** @param {number} pos @param {number} height @param {number} [side] */
  add(pos, height, side = -1) {
    this.added += height;
    this.builder.add(
      pos,
      pos,
      Decoration.widget({ widget: new Spacer(height), block: true, side }),
    );
  }

  get height() {
    let installed = 0;
    for (const iter = this.view.state.field(spacers).iter(); iter.value; iter.next()) {
      installed += iter.value.spec.widget.height;
    }
    return this.view.contentHeight - installed + this.added;
  }
}

/** @param {import("@codemirror/view").DecorationSet} a @param {import("@codemirror/view").DecorationSet} b */
function sameSpacers(a, b) {
  if (a.size !== b.size) return false;
  const iterB = b.iter();
  for (const iterA = a.iter(); iterA.value; iterA.next(), iterB.next()) {
    if (iterA.from !== iterB.from) return false;
    if (Math.abs(iterA.value.spec.widget.height - iterB.value?.spec.widget.height) > 1)
      return false;
  }
  return true;
}

/** Below this a difference is rounding. */
const EPSILON = 0.01;

/** Levels the two views, like @codemirror/merge's MergeView, whose own spacers aren't exported.
 * @param {EditorView} original @param {EditorView} current @param {readonly Chunk[]} chunks */
function align(original, current, chunks) {
  const a = new SpacerWalk(original);
  const b = new SpacerWalk(current);
  for (const [posA, posB] of levelPairs(original, current, chunks)) {
    const topA = a.top(posA);
    const topB = b.top(posB);
    if (topA === null || topB === null) continue;
    if (topA < topB - EPSILON) a.add(posA, topB - topA);
    else if (topB < topA - EPSILON) b.add(posB, topA - topB);
  }
  const rest = a.height - b.height;
  if (rest < -EPSILON) a.add(original.state.doc.length, -rest, 1);
  else if (rest > EPSILON) b.add(current.state.doc.length, rest, 1);
  for (const { view, builder } of [a, b]) {
    const next = builder.finish();
    if (!sameSpacers(next, view.state.field(spacers))) {
      view.dispatch({ effects: setSpacers.of(next) });
    }
  }
}

/** @type {import("@codemirror/state").StateEffectType<Projection>} */
const project = StateEffect.define();

/** The left pane decides nothing: it shows the chunks and collapsed rows the editor has. */
const projected = StateField.define({
  create: () => ({
    lines: Decoration.none,
    gutter: /** @type {RangeSet<import("@codemirror/view").GutterMarker>} */ (RangeSet.empty),
    collapsed: Decoration.none,
  }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(project)) continue;
      const { chunks, collapsed } = effect.value;
      /** @type {RangeSetBuilder<Decoration>} */
      const builder = new RangeSetBuilder();
      for (const { from, to, lines } of collapsed) {
        builder.add(
          from,
          to,
          Decoration.replace({ widget: new CollapsedLinesWidget(lines), block: true }),
        );
      }
      return { ...changeMarks(chunks, tr.state.doc, true), collapsed: builder.finish() };
    }
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.lines),
    EditorView.decorations.from(field, (value) => value.collapsed),
    gutterLineClass.from(field, (value) => value.gutter),
  ],
});

/** @param {State} state @param {readonly Chunk[]} chunks @returns {Projection["collapsed"]} */
function collapsedInOriginal(state, chunks) {
  const collapsed = [];
  const rows = state.field(collapsedLines, false);
  for (let iter = rows?.iter(); iter?.value; iter.next()) {
    collapsed.push({
      from: acrossChunks(chunks, iter.from, true),
      to: acrossChunks(chunks, iter.to, true),
      lines: iter.value.spec.widget.lines,
    });
  }
  return collapsed;
}

/** The look the left pane shares with the editor, rebuilt when a setting or the language changes.
 * @param {SplitOptions} options @param {import("@codemirror/language").Language | null} lang */
function originalLook(options, lang) {
  return [
    options.lineNumbers ? lineNumbers() : [],
    options.indentGuides ? indentGuidesFeature() : [],
    options.wrap ? wrapFeature() : [],
    EditorState.tabSize.of(options.tabSize),
    lang ? language.of(lang) : [],
    options.extensions,
  ];
}

/** The read-only pane left of the editor; lives while the editor has something to compare against. */
class OriginalPane {
  #look = new Compartment();
  /** @type {SplitOptions} */
  #options;
  /** @type {import("@codemirror/language").Language | null} */
  #language;
  /** @type {Text} */
  #original;
  #mirror = {
    /** @param {Event} event */
    handleEvent: (event) => {
      const [from, to] =
        event.currentTarget === this.view.scrollDOM
          ? [this.view.scrollDOM, this.current.scrollDOM]
          : [this.current.scrollDOM, this.view.scrollDOM];
      if (Math.abs(to.scrollTop - from.scrollTop) >= 1) to.scrollTop = from.scrollTop;
    },
  };

  /**
   * @param {EditorView} current
   * @param {SplitConfig} config
   * @param {Text} original
   * @param {() => void} onHeights
   */
  constructor(current, config, original, onHeights) {
    this.current = current;
    this.#options = config.options();
    this.#language = current.state.facet(language);
    this.#original = original;
    const parent = config.getParent();
    this.view = new EditorView({
      state: EditorState.create({
        doc: original,
        extensions: [
          cdxTheme,
          cdxHighlighting,
          stickyGeometry,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.editorAttributes.of({ class: "cdx-split-original" }),
          EditorView.contentAttributes.of({ part: "original-content" }),
          spacers,
          projected,
          this.#look.of(originalLook(this.#options, this.#language)),
          EditorView.updateListener.of((update) => {
            if (heightsMoved(update)) onHeights();
          }),
        ],
      }),
      root: /** @type {Document | ShadowRoot} */ (current.root),
      dispatchTransactions: (transactions, view) => {
        view.update(transactions);
        this.#forwardExpand(transactions);
      },
    });
    parent.prepend(this.view.dom);
    this.view.scrollDOM.addEventListener("scroll", this.#mirror);
    current.scrollDOM.addEventListener("scroll", this.#mirror);
  }

  /** A click on a collapsed row here opens it in the editor, which then projects it back.
   * @param {readonly import("@codemirror/state").Transaction[]} transactions */
  #forwardExpand(transactions) {
    const chunks = diffSource(this.current.state)?.chunks ?? [];
    for (const transaction of transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(expandCollapsed)) {
          this.current.dispatch({
            effects: expandCollapsed.of(acrossChunks(chunks, effect.value, false)),
          });
        }
      }
    }
  }

  /** @param {DiffSource} source @param {SplitOptions} options */
  sync(source, options) {
    const lang = this.current.state.facet(language);
    const lookChanged =
      lang !== this.#language ||
      Object.keys(options).some(
        (key) =>
          options[/** @type {keyof SplitOptions} */ (key)] !==
          this.#options[/** @type {keyof SplitOptions} */ (key)],
      );
    const changes =
      source.original !== this.#original
        ? diffText(this.view.state.doc.toString(), source.original.toString())
        : undefined;
    this.#original = source.original;
    this.#language = lang;
    this.#options = options;
    this.view.dispatch({
      changes,
      effects: [
        project.of({
          chunks: source.chunks,
          collapsed: collapsedInOriginal(this.current.state, source.chunks),
        }),
        ...(lookChanged ? [this.#look.reconfigure(originalLook(options, lang))] : []),
      ],
    });
  }

  destroy() {
    this.view.scrollDOM.removeEventListener("scroll", this.#mirror);
    this.current.scrollDOM.removeEventListener("scroll", this.#mirror);
    this.view.destroy();
    this.view.dom.remove();
  }
}

/** Heights a round of alignment has to answer; not the round's own spacers, or it would never end.
 * @param {import("@codemirror/view").ViewUpdate} update */
function heightsMoved(update) {
  return (
    (update.heightChanged || update.viewportChanged) &&
    !update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setSpacers)))
  );
}

/**
 * Side by side: the editor stays the one view with the document, undo, comments and every event; a
 * read-only pane beside it shows the text it's compared against. A view plugin in a compartment, so
 * switching layout never recreates the editor, and reconnects and tab switches rebuild the pane.
 * @param {SplitConfig} config
 */
export function splitDiff(config) {
  return [
    EditorView.editorAttributes.of({ class: "cdx-split-current" }),
    spacers,
    currentMarks,
    ViewPlugin.define((view) => {
      /** @type {OriginalPane | null} */
      let pane = null;
      /** @type {DiffSource | null} */
      let shown = null;
      /** @type {unknown} */
      let shownRows;
      let frame = -1;

      const scheduleAlign = () => {
        if (frame >= 0) return;
        frame = requestAnimationFrame(() => {
          frame = -1;
          const chunks = diffSource(view.state)?.chunks;
          if (pane && chunks) align(pane.view, view, chunks);
        });
      };

      const sync = () => {
        const source = diffSource(view.state);
        if (!source) {
          pane?.destroy();
          pane = shown = null;
          return;
        }
        pane ??= new OriginalPane(view, config, source.original, scheduleAlign);
        pane.sync(source, config.options());
        shown = source;
        shownRows = view.state.field(collapsedLines, false);
        scheduleAlign();
      };

      sync();
      return {
        /** @param {import("@codemirror/view").ViewUpdate} update */
        update(update) {
          const source = diffSource(update.state);
          const stale =
            source?.original !== shown?.original ||
            source?.chunks !== shown?.chunks ||
            update.state.field(collapsedLines, false) !== shownRows ||
            update.state.facet(language) !== update.startState.facet(language) ||
            update.transactions.some((tr) => tr.reconfigured);
          if (stale) sync();
          else if (heightsMoved(update)) scheduleAlign();
        },
        destroy() {
          cancelAnimationFrame(frame);
          pane?.destroy();
        },
      };
    }),
  ];
}
