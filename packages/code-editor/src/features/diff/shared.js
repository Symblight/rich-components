import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterWidgetClass,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import { language } from "@codemirror/language";
import { classHighlighter, highlightTree } from "@lezer/highlight";

import { iconElement } from "../../core/icons.js";
import { functionHighlighter } from "../../core/theme.js";

/**
 * @typedef {"review" | "baseline"} CdxDiffKind
 * @typedef {"tertiary" | "neutral" | "primary" | "error"} CdxDiffTone
 * @typedef {{
 *   id: string,
 *   kind: CdxDiffKind,
 *   index: number,
 *   total: number,
 *   added: number,
 *   removed: number,
 *   fromLine: number,
 *   toLine: number,
 * }} CdxChunkModel
 * What a header shows and what `getAuthor`/`getAvatarUrl` receive. Lines are 1-based.
 * @typedef {{
 *   kind: CdxDiffKind,
 *   author: string,
 *   tone: CdxDiffTone,
 *   icon: string,
 *   acceptLabel: string,
 *   rejectLabel: string,
 *   revertLabel: string,
 *   acceptAllLabel: string,
 *   rejectAllLabel: string,
 *   getAuthor?: (chunk?: CdxChunkModel) => string | null | undefined,
 *   getAvatarUrl?: (chunk?: CdxChunkModel) => string | null | undefined,
 * }} CdxDiffConfig
 * @typedef {{ label: string, variant: "filled" | "text" | "danger" | "icon", icon?: string,
 *   title?: string, run: (view: EditorView, pos: number) => unknown }} HeaderAction
 */

/** md-avatar when the consumer gives a URL, the kind's icon otherwise.
 * @param {CdxDiffConfig} config @param {CdxChunkModel | undefined} chunk @param {string} part */
export function authorMark(config, chunk, part) {
  const url = config.getAvatarUrl?.(chunk);
  if (url) {
    const avatar = document.createElement("md-avatar");
    avatar.setAttribute("src", url);
    avatar.setAttribute("part", part);
    avatar.className = "cdx-author-avatar";
    return avatar;
  }
  const icon = iconElement(config.icon);
  icon.setAttribute("part", part);
  icon.classList.add("cdx-author-icon");
  return icon;
}

/** @param {CdxDiffConfig} config @param {CdxChunkModel} [chunk] */
export const authorName = (config, chunk) => config.getAuthor?.(chunk) ?? config.author;

/** The 36dp bar above a chunk, like a CodeLens: author, position, +/− counts and the actions. */
export class ChunkHeaderWidget extends WidgetType {
  /**
   * @param {CdxChunkModel} chunk
   * @param {CdxDiffConfig} config
   * @param {HeaderAction[]} actions
   * @param {boolean} showPosition  "Change 1 of 3" — review only; a HEAD chunk has no queue
   */
  constructor(chunk, config, actions, showPosition) {
    super();
    this.chunk = chunk;
    this.config = config;
    this.actions = actions;
    this.showPosition = showPosition;
  }

  /** @param {ChunkHeaderWidget} other */
  eq(other) {
    const a = this.chunk;
    const b = other.chunk;
    return (
      other.config === this.config &&
      a.index === b.index &&
      a.total === b.total &&
      a.added === b.added &&
      a.removed === b.removed &&
      a.fromLine === b.fromLine &&
      other.actions.length === this.actions.length
    );
  }

  get estimatedHeight() {
    return 36;
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const { chunk, config } = this;
    const root = document.createElement("div");
    root.className = `cdx-chunk cdx-chunk_tone-${config.tone}`;
    root.setAttribute("role", "group");

    const bar = root.appendChild(document.createElement("div"));
    bar.className = "cdx-chunk__bar";
    bar.setAttribute("part", "chunk-header");

    const author = authorName(config, chunk);
    const name = document.createElement("span");
    name.className = "cdx-chunk__author";
    name.setAttribute("part", "chunk-author");
    name.textContent = author;
    bar.append(authorMark(config, chunk, "chunk-avatar"), name);

    if (this.showPosition) {
      const sep = document.createElement("span");
      sep.className = "cdx-chunk__sep";
      sep.setAttribute("aria-hidden", "true");
      sep.textContent = "·";
      const label = document.createElement("span");
      label.className = "cdx-chunk__label";
      label.setAttribute("part", "chunk-label");
      label.textContent = `Change ${chunk.index + 1} of ${chunk.total}`;
      bar.append(sep, label);
    }

    const stats = document.createElement("span");
    stats.className = "cdx-chunk__stats";
    stats.setAttribute("part", "chunk-stats");
    if (chunk.added) {
      const added = stats.appendChild(document.createElement("span"));
      added.className = "cdx-chunk__added";
      added.textContent = `+${chunk.added}`;
    }
    if (chunk.removed) {
      const removed = stats.appendChild(document.createElement("span"));
      removed.className = "cdx-chunk__removed";
      removed.textContent = `−${chunk.removed}`;
    }
    const grow = document.createElement("span");
    grow.className = "cdx-chunk__grow";
    bar.append(stats, grow);

    for (const action of this.actions) bar.append(actionButton(view, root, action));

    const parts = [];
    if (this.showPosition) parts.push(`Change ${chunk.index + 1} of ${chunk.total}`);
    parts.push(`by ${author}`);
    if (chunk.added) parts.push(`${chunk.added} added`);
    if (chunk.removed) parts.push(`${chunk.removed} removed`);
    root.setAttribute("aria-label", parts.join(", "));
    return root;
  }

  /** Clicks inside the bar are the buttons', never a caret placement. */
  ignoreEvent() {
    return true;
  }
}

/** @param {EditorView} view @param {HTMLElement} root @param {HeaderAction} action */
function actionButton(view, root, action) {
  const button = document.createElement("button");
  button.type = "button";
  // inside contenteditable a focusable button would swallow typing; the keymap covers keyboard use
  button.tabIndex = -1;
  button.className = `cdx-chunk__action cdx-chunk__action_${action.variant}`;
  button.setAttribute("part", `chunk-action chunk-action-${action.label.toLowerCase()}`);
  if (action.title) button.title = action.title;
  if (action.icon) button.append(iconElement(action.icon));
  if (action.variant === "icon") button.setAttribute("aria-label", action.label);
  else button.append(action.label);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    action.run(view, view.posAtDOM(root));
  });
  return button;
}

/** Deleted lines of a HEAD chunk, drawn like the merge view's own deleted block — same classes,
 *  so one set of styles covers both. Highlighted with the editor's current language. */
export class GhostLinesWidget extends WidgetType {
  /** @param {string} text */
  constructor(text) {
    super();
    this.text = text;
  }

  /** @param {GhostLinesWidget} other */
  eq(other) {
    return other.text === this.text;
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const root = document.createElement("div");
    root.className = "cm-deletedChunk";
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("part", "deleted-line");
    const lines = highlightLines(view.state, this.text);
    for (const content of lines) {
      const line = root.appendChild(document.createElement("div"));
      line.className = "cm-deletedLine";
      if (content.childNodes.length) line.append(content);
      else line.append(document.createElement("br"));
    }
    return root;
  }

  ignoreEvent() {
    return true;
  }
}

/** One fragment per line, tokens as `tok-*` spans — a fragment's parse, like the merge view's.
 * @param {import("@codemirror/state").EditorState} state @param {string} text */
function highlightLines(state, text) {
  const lines = [document.createDocumentFragment()];
  /** @param {string} piece @param {string} [classes] */
  const append = (piece, classes) => {
    piece.split("\n").forEach((part, index) => {
      if (index > 0) lines.push(document.createDocumentFragment());
      if (!part) return;
      const target = lines[lines.length - 1];
      if (!classes) {
        target.append(part);
        return;
      }
      const span = document.createElement("span");
      span.className = classes;
      span.textContent = part;
      target.append(span);
    });
  };
  const lang = state.facet(language);
  if (!lang) {
    append(text);
    return lines;
  }
  let pos = 0;
  highlightTree(
    lang.parser.parse(text),
    [classHighlighter, functionHighlighter],
    (from, to, classes) => {
      if (from > pos) append(text.slice(pos, from));
      append(text.slice(from, to), classes);
      pos = to;
    },
  );
  if (pos < text.length) append(text.slice(pos));
  return lines;
}

class ClassMarker extends GutterMarker {
  /** @param {string} elementClass */
  constructor(elementClass) {
    super();
    this.elementClass = elementClass;
  }
}

/** The merge view's deletion widget isn't exported; it's the only other block widget carrying a
 *  `buildDOM` — checked by shape so the gutter can tint its rows too. */
/** @param {WidgetType} widget */
export const isDeletedBlock = (widget) =>
  widget instanceof GhostLinesWidget || "buildDOM" in /** @type {object} */ (widget);

const headerGutterClasses = /** @type {Record<string, ClassMarker>} */ ({});
const deletedGutterClass = new ClassMarker("cdx-gutter-deleted");

/** Tints every gutter beside a header or a deleted block, so the fills run edge to edge. */
const gutterBackdrop = gutterWidgetClass.of((_view, widget) => {
  if (widget instanceof ChunkHeaderWidget) {
    const tone = widget.config.tone;
    return (headerGutterClasses[tone] ??= new ClassMarker(
      `cdx-gutter-chunk-header cdx-gutter-chunk-header_tone-${tone}`,
    ));
  }
  return isDeletedBlock(widget) ? deletedGutterClass : null;
});

export const addedGutterClass = new ClassMarker("cdx-gutter-added");

/** Keeps the headers' sticky bar exactly over the visible text area: it sticks to the gutter's
 *  right edge and spans the scroller's visible width, whatever the horizontal scroll. */
export const stickyGeometry = ViewPlugin.define((view) => {
  const measure = () =>
    view.requestMeasure({
      read: () => ({
        gutters:
          /** @type {HTMLElement | null} */ (view.dom.querySelector(".cm-gutters"))?.offsetWidth ??
          0,
        width: view.scrollDOM.clientWidth,
      }),
      write: ({ gutters, width }) => {
        view.dom.style.setProperty("--cdx-gutters-width", `${gutters}px`);
        view.dom.style.setProperty("--cdx-text-width", `${Math.max(0, width - gutters)}px`);
      },
    });
  measure();
  return {
    /** @param {import("@codemirror/view").ViewUpdate} update */
    update(update) {
      if (update.geometryChanged || update.viewportChanged) measure();
    },
  };
});

/** A brief green wash over lines just accepted; cleared by `clearFlash` after the animation. */
export const flashLines =
  /** @type {import("@codemirror/state").StateEffectType<{ from: number, to: number }>} */ (
    StateEffect.define()
  );
export const clearFlash = /** @type {import("@codemirror/state").StateEffectType<null>} */ (
  StateEffect.define()
);
const flashDecoration = Decoration.line({ class: "cdx-line-flash" });

const flashField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(clearFlash)) next = Decoration.none;
      else if (effect.is(flashLines)) {
        const { from, to } = effect.value;
        const ranges = [];
        for (let pos = from; pos <= to;) {
          const line = tr.state.doc.lineAt(pos);
          ranges.push(flashDecoration.range(line.from));
          pos = line.to + 1;
        }
        next = Decoration.set(ranges);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** What both layers share: gutter tints, the sticky-header geometry, the accept flash. */
export const diffBase = [gutterBackdrop, stickyGeometry, flashField];

/** @param {import("@codemirror/state").Text} doc @param {number} from @param {number} to
 *  @returns {[number, number]} 1-based first/last line of a range that may end past the doc */
export function lineSpan(doc, from, to) {
  const first = doc.lineAt(Math.min(from, doc.length)).number;
  const last = doc.lineAt(Math.max(Math.min(to, doc.length), Math.min(from, doc.length))).number;
  return [first, last];
}
