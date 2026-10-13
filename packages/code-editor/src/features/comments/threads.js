import { RangeSet, StateEffect, StateField } from "@codemirror/state";
import {
  BlockType,
  Decoration,
  EditorView,
  gutter,
  GutterMarker,
  lineNumberMarkers,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";

import "../../components/comment-thread/comment-thread.js";
import { iconElement } from "../../core/icons.js";
import { stickyGeometry } from "../diff/shared.js";
import { canDeleteComment, canEditComment, canResolveThread, toneOf } from "./shared.js";

/**
 * @typedef {import("./shared.js").CdxThread} CdxThread
 * @typedef {import("./shared.js").CdxCommentRange} CdxCommentRange
 * @typedef {import("./comments.js").CdxCommentsConfig} CdxCommentsConfig
 * @typedef {import("../../components/comment-thread/comment-thread.js").CdxThreadModel} CdxThreadModel
 * @typedef {import("../../components/comment-thread/comment-thread.js").CdxDraftView} CdxDraftView
 * @typedef {Omit<CdxThread, "line" | "outdated" | "lineText" | "range">} ThreadData
 * @typedef {import("./shared.js").CdxThreadPending} CdxThreadPending
 * @typedef {{ id: string, pos: number, range?: CdxCommentRange, lineText: string,
 *   data: ThreadData, collapsed?: boolean, outdated: boolean, given: number,
 *   pending?: CdxThreadPending | null, error?: string }} Entry
 * `given` is the line the thread came in with, to tell a consumer's echo from a move.
 * @typedef {CdxDraftView & { threadId: string, pos: number, line: number, range: CdxCommentRange | null }} Draft
 * @typedef {{ entries: readonly Entry[], draft: Draft | null, models: Map<string, ModelRecord>,
 *   lines: Map<number, ModelRecord[]>, decorations: import("@codemirror/view").DecorationSet }} CommentsState
 * `lines`: records by line start, so the gutter doesn't scan every thread for every line.
 * @typedef {{ api: CommentsApi, entry: Entry, line: number, draft: Draft | null, locked: boolean,
 *   config: CdxCommentsConfig, model: CdxThreadModel }} ModelRecord
 * @typedef {{
 *   config: () => CdxCommentsConfig | null,
 *   ui: (view: EditorView, threadId: string, detail: { action: string } & Record<string, any>) => void,
 *   canAdd: (line: number) => boolean,
 *   open: (view: EditorView, line: number) => void,
 *   toggle: (threadId: string) => void,
 *   text: (threadId: string) => string | null,
 * }} CommentsApi
 */

export const setThreadsEffect =
  /** @type {import("@codemirror/state").StateEffectType<CdxThread[]>} */ (StateEffect.define());
export const putThreadEffect =
  /** @type {import("@codemirror/state").StateEffectType<CdxThread>} */ (StateEffect.define());
/** `apply` returns the next data, or null to remove the thread. */
export const patchThreadEffect =
  /** @type {import("@codemirror/state").StateEffectType<{ id: string, apply: (data: ThreadData) => ThreadData | null }>} */ (
    StateEffect.define()
  );
export const collapseEffect =
  /** @type {import("@codemirror/state").StateEffectType<{ id: string, collapsed: boolean | undefined }>} */ (
    StateEffect.define()
  );
export const pendingEffect =
  /** @type {import("@codemirror/state").StateEffectType<{ id: string, pending: CdxThreadPending | null, error: string }>} */ (
    StateEffect.define()
  );
export const draftEffect =
  /** @type {import("@codemirror/state").StateEffectType<Draft | null>} */ (StateEffect.define());
/** Rebuilds every model: the carrier's config changed. */
export const refreshEffect = /** @type {import("@codemirror/state").StateEffectType<null>} */ (
  StateEffect.define()
);

/** @param {import("@codemirror/state").Text} doc @param {number} line */
const lineStart = (doc, line) => doc.line(Math.min(Math.max(line, 1), doc.lines));

/** @param {import("@codemirror/state").Text} doc @param {CdxThread} thread @returns {Entry} */
function toEntry(doc, thread) {
  const line = lineStart(doc, thread.line);
  const { line: _line, lineText, range, outdated, collapsed, ...data } = thread;
  return {
    id: thread.id,
    pos: line.from,
    range,
    lineText: lineText ?? line.text,
    data,
    collapsed,
    outdated: outdated ?? false,
    given: thread.line,
  };
}

/** Outdated only when the line goes with its line break — retyping its text keeps the thread.
 * @param {Entry} entry @param {import("@codemirror/state").Transaction} tr */
function mapEntry(entry, tr) {
  const doc = tr.startState.doc;
  const old = doc.lineAt(Math.min(entry.pos, doc.length));
  const last = old.to === doc.length;
  const from = last ? Math.max(old.from - 1, 0) : old.from;
  const to = last ? old.to : old.to + 1;
  let gone = false;
  if (to > from) {
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (fromA <= from && toA >= to) gone = true;
    });
  }
  return {
    ...entry,
    pos: tr.changes.mapPos(entry.pos, 1),
    range: entry.range && {
      from: tr.changes.mapPos(entry.range.from, 1),
      to: tr.changes.mapPos(entry.range.to, -1),
    },
    outdated: entry.outdated || gone,
  };
}

/** A controlled echo answers a pending action once the data shows it done.
 * @param {Entry} kept @param {ThreadData} data @returns {Pick<Entry, "pending" | "error">} */
function settle(kept, data) {
  const pending = kept.pending;
  if (!pending) return { pending: null, error: kept.error };
  if (pending.action === "resolve") {
    return !!data.resolved === pending.resolved
      ? { pending: null, error: "" }
      : { pending, error: kept.error };
  }
  const left = pending.commentIds.filter((id) =>
    data.comments.some((comment) => comment.id === id),
  );
  return left.length
    ? { pending: { ...pending, commentIds: left }, error: kept.error }
    : { pending: null, error: "" };
}

/** A thread that comes in again (controlled echo, `addComment` of a known id): the same line as it
 *  was given = an echo, so it keeps where edits moved it and its UI state; another line moves it.
 * @param {Entry | undefined} kept @param {Entry} next @param {CdxThread} thread @returns {Entry} */
function reconcile(kept, next, thread) {
  if (!kept) return next;
  const ui = settle(kept, next.data);
  return kept.given === thread.line
    ? {
        ...next,
        ...ui,
        pos: kept.pos,
        range: kept.range ?? next.range,
        collapsed: thread.collapsed ?? kept.collapsed,
        outdated: thread.outdated ?? kept.outdated,
      }
    : { ...next, ...ui };
}

/** @param {import("@codemirror/state").EditorState} state @param {Entry} entry @returns {CdxThread} */
export function threadOf(state, entry) {
  const line = state.doc.lineAt(Math.min(entry.pos, state.doc.length));
  return {
    ...entry.data,
    line: line.number,
    lineText: line.text,
    range: entry.range,
    collapsed: entry.collapsed,
    outdated: entry.outdated,
  };
}

/** @param {Entry} entry @param {Draft | null} draft */
const draftOf = (entry, draft) => (draft && draft.threadId === entry.id ? draft : null);

/**
 * @param {import("@codemirror/state").EditorState} state @param {Entry} entry
 * @param {Draft | null} draft @param {CdxCommentsConfig} config @param {CommentsApi} api
 * @returns {CdxThreadModel}
 */
function buildModel(state, entry, draft, config, api) {
  const thread = threadOf(state, entry);
  const mine = draftOf(entry, draft);
  const tone = toneOf(thread);
  /** @type {CdxThreadModel["permissions"]} */
  const permissions = {};
  for (const comment of thread.comments) {
    permissions[comment.id] = {
      edit: canEditComment(config, comment, thread),
      delete: canDeleteComment(config, comment, thread),
    };
  }
  return {
    id: entry.id,
    line: thread.line,
    thread,
    tone,
    collapsed: !mine && (entry.collapsed ?? (!!thread.resolved && config.collapseResolved)),
    draft: mine,
    draftText: () => (mine ? (api.text(entry.id) ?? mine.text) : ""),
    canResolve: canResolveThread(config, thread),
    canReply: config.mode === "thread" && thread.comments.length > 0,
    pending: entry.pending ?? null,
    locked: !!draft?.sending && draft.threadId !== entry.id,
    error: entry.error ?? "",
    permissions,
    config,
  };
}

class ThreadWidget extends WidgetType {
  /** @param {CdxThreadModel} model @param {CommentsApi} api */
  constructor(model, api) {
    super();
    this.model = model;
    this.api = api;
  }

  /** @param {ThreadWidget} other */
  eq(other) {
    return other.model === this.model;
  }

  get estimatedHeight() {
    // card + the row's gap above and below (--cdx-comment-row-gap)
    return this.model.collapsed ? 46 : 140;
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const row = document.createElement("div");
    row.className = "cdx-comment-row";
    row.dataset.threadId = this.model.id;
    const element =
      /** @type {import("../../components/comment-thread/comment-thread.js").CdxCommentThread} */ (
        row.appendChild(document.createElement("cdx-comment-thread"))
      );
    element.model = this.model;
    row.addEventListener("cdx-comment-ui", (event) => {
      event.stopPropagation();
      this.api.ui(
        view,
        /** @type {string} */ (row.dataset.threadId),
        /** @type {CustomEvent} */ (event).detail,
      );
    });
    return row;
  }

  /** @param {HTMLElement} dom */
  updateDOM(dom) {
    dom.dataset.threadId = this.model.id;
    /** @type {import("../../components/comment-thread/comment-thread.js").CdxCommentThread} */ (
      dom.firstElementChild
    ).model = this.model;
    return true;
  }

  /** The field inside is the widget's own; the editor must not take its clicks or keys. */
  ignoreEvent() {
    return true;
  }
}

/** @param {import("@codemirror/state").EditorState} state @param {readonly Entry[]} entries
 *  @param {Draft | null} draft @param {CommentsApi} api @param {CommentsState | null} previous */
function build(state, entries, draft, api, previous) {
  const config = api.config();
  /** @type {Map<string, ModelRecord>} */
  const models = new Map();
  /** @type {Map<number, ModelRecord[]>} */
  const lines = new Map();
  if (!config) return { entries, draft, models, lines, decorations: Decoration.none };
  const all = [...entries];
  if (draft && !entries.some((entry) => entry.id === draft.threadId)) {
    all.push({
      id: draft.threadId,
      pos: draft.pos,
      lineText: "",
      data: { id: draft.threadId, comments: [] },
      outdated: false,
      given: draft.line,
    });
  }
  const ranges = [];
  for (const entry of all) {
    const line = state.doc.lineAt(Math.min(entry.pos, state.doc.length));
    const mine = draftOf(entry, draft);
    const locked = !!draft?.sending && draft.threadId !== entry.id;
    const before = previous?.models.get(entry.id);
    const reuse =
      before &&
      before.api === api &&
      before.entry.data === entry.data &&
      before.entry.collapsed === entry.collapsed &&
      before.entry.outdated === entry.outdated &&
      before.entry.pending === entry.pending &&
      before.entry.error === entry.error &&
      before.line === line.number &&
      before.draft === mine &&
      before.locked === locked &&
      before.config === config;
    /** @type {ModelRecord} */
    const record = reuse
      ? { ...before, entry }
      : {
          api,
          entry,
          line: line.number,
          draft: mine,
          locked,
          config,
          model: buildModel(state, entry, draft, config, api),
        };
    models.set(entry.id, record);
    const atLine = lines.get(line.from);
    if (atLine) atLine.push(record);
    else lines.set(line.from, [record]);
    ranges.push(
      Decoration.widget({
        widget: new ThreadWidget(record.model, api),
        block: true,
        side: 1,
      }).range(line.to),
    );
  }
  return { entries, draft, models, lines, decorations: Decoration.set(ranges, true) };
}

/** @param {CommentsApi} api */
export function createCommentsField(api) {
  return StateField.define({
    /** @returns {CommentsState} */
    create: (state) => build(state, [], null, api, null),
    update(value, tr) {
      let { entries, draft } = value;
      let changed = false;
      if (tr.docChanged) {
        entries = entries.map((entry) => mapEntry(entry, tr));
        if (draft) draft = { ...draft, pos: tr.changes.mapPos(draft.pos, 1) };
        changed = true;
      }
      for (const effect of tr.effects) {
        if (effect.is(setThreadsEffect)) {
          const known = new Map(entries.map((entry) => [entry.id, entry]));
          entries = effect.value.map((thread) =>
            reconcile(known.get(thread.id), toEntry(tr.state.doc, thread), thread),
          );
          changed = true;
        } else if (effect.is(putThreadEffect)) {
          const thread = effect.value;
          const kept = entries.find((entry) => entry.id === thread.id);
          const next = reconcile(kept, toEntry(tr.state.doc, thread), thread);
          entries = kept
            ? entries.map((entry) => (entry === kept ? next : entry))
            : [...entries, next];
          changed = true;
        } else if (effect.is(patchThreadEffect)) {
          const { id, apply } = effect.value;
          entries = entries.flatMap((entry) => {
            if (entry.id !== id) return [entry];
            const data = apply(entry.data);
            return data ? [{ ...entry, data }] : [];
          });
          changed = true;
        } else if (effect.is(collapseEffect)) {
          const { id, collapsed } = effect.value;
          entries = entries.map((entry) => (entry.id === id ? { ...entry, collapsed } : entry));
          changed = true;
        } else if (effect.is(pendingEffect)) {
          const { id, pending, error } = effect.value;
          entries = entries.map((entry) =>
            entry.id === id ? { ...entry, pending, error } : entry,
          );
          changed = true;
        } else if (effect.is(draftEffect)) {
          draft = effect.value;
          changed = true;
        } else if (effect.is(refreshEffect)) {
          changed = true;
        }
      }
      return changed ? build(tr.state, entries, draft, api, value) : value;
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
}

/** @typedef {ReturnType<typeof createCommentsField>} CommentsField */

/** The start of the line under the pointer. A field, not a DOM class: gutter elements are reused
 *  across lines, so a class toggled on them could stay behind on another line. */
const hoverEffect = /** @type {import("@codemirror/state").StateEffectType<number | null>} */ (
  StateEffect.define()
);
const hoverField = StateField.define({
  create: () => /** @type {number | null} */ (null),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(hoverEffect)) return effect.value;
    return tr.docChanged ? null : value;
  },
});

const hoverTracker = ViewPlugin.define((view) => {
  /** @param {number | null} next */
  const set = (next) => {
    if (next !== view.state.field(hoverField)) view.dispatch({ effects: hoverEffect.of(next) });
  };
  /** @param {MouseEvent} event */
  const move = (event) => {
    const block = view.elementAtHeight(event.clientY - view.documentTop);
    set(block.type === BlockType.Text ? block.from : null);
  };
  const leave = () => set(null);
  view.dom.addEventListener("mousemove", move);
  view.dom.addEventListener("mouseleave", leave);
  return {
    destroy() {
      view.dom.removeEventListener("mousemove", move);
      view.dom.removeEventListener("mouseleave", leave);
    },
  };
});

class AddMarker extends GutterMarker {
  /** @param {CommentsApi} api */
  constructor(api) {
    super();
    this.api = api;
  }

  /** @param {GutterMarker} other */
  eq(other) {
    return other instanceof AddMarker;
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const add = document.createElement("span");
    add.className = "cdx-comment-add";
    add.setAttribute("part", "comment-add");
    add.append(iconElement("add"));
    // before the line-number gutter's own handler, which would move the caret
    add.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const from = view.state.field(hoverField);
      if (from !== null) this.api.open(view, view.state.doc.lineAt(from).number);
    });
    return add;
  }
}

/** Whether the hovered line can take a new thread: none there yet, and the host allows it.
 * @param {import("@codemirror/state").EditorState} state @param {CommentsField} field
 * @param {CommentsApi} api */
function addableLine(state, field, api) {
  const from = state.field(hoverField);
  if (from === null || state.field(field).lines.has(from)) return null;
  return api.canAdd(state.doc.lineAt(from).number) ? from : null;
}

/** "+" replaces the hovered line's number.
 * @param {CommentsField} field @param {CommentsApi} api */
function addInLineNumbers(field, api) {
  const marker = new AddMarker(api);
  return lineNumberMarkers.compute([hoverField, field], (state) => {
    const from = addableLine(state, field, api);
    return from === null ? RangeSet.empty : RangeSet.of(marker.range(from));
  });
}

class ThreadMarker extends GutterMarker {
  /** @param {string} tone @param {boolean} collapsed @param {number} count threads on the line */
  constructor(tone, collapsed, count) {
    super();
    this.tone = tone;
    this.collapsed = collapsed;
    this.count = count;
  }

  /** @param {GutterMarker} other */
  eq(other) {
    return (
      other instanceof ThreadMarker &&
      other.tone === this.tone &&
      other.collapsed === this.collapsed &&
      other.count === this.count
    );
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = `cdx-comment-marker cdx-comment-marker_tone-${this.tone}`;
    marker.setAttribute("part", "comment-marker");
    if (this.count > 1) {
      marker.classList.add("cdx-comment-marker_many");
      marker.textContent = String(this.count);
    } else {
      marker.append(iconElement(this.tone === "resolved" ? "check" : "chat_bubble"));
    }
    return marker;
  }
}

/** The 24dp column left of the change marks: a marker where a thread lives, and the "+" only when
 *  there are no line numbers to put it on.
 * @param {CommentsField} field @param {CommentsApi} api */
function commentsGutter(field, api) {
  const addMarker = new AddMarker(api);
  /** @type {Map<string, ThreadMarker>} */
  const markers = new Map();
  /** @param {string} tone @param {boolean} collapsed */
  /** @param {string} tone @param {boolean} collapsed @param {number} count */
  const markerOf = (tone, collapsed, count) => {
    const key = `${tone}:${collapsed}:${count}`;
    let marker = markers.get(key);
    if (!marker) markers.set(key, (marker = new ThreadMarker(tone, collapsed, count)));
    return marker;
  };
  /** The line's thread models, and those with comments (the rest is a new thread's field).
   * @param {import("@codemirror/state").EditorState} state @param {number} from */
  const modelsAt = (state, from) => {
    const all = (state.field(field).lines.get(from) ?? []).map((record) => record.model);
    return { all, threads: all.filter((model) => model.thread.comments.length) };
  };
  return gutter({
    class: "cdx-comments-gutter",
    lineMarker(view, line) {
      const { all, threads } = modelsAt(view.state, line.from);
      if (threads.length) {
        const open = threads.some((model) => model.tone !== "resolved");
        const collapsed = threads.every((model) => model.collapsed);
        return markerOf(open ? "comment" : "resolved", collapsed, threads.length);
      }
      if (all.length || view.dom.querySelector(".cm-lineNumbers")) return null;
      return addableLine(view.state, field, api) === line.from ? addMarker : null;
    },
    lineMarkerChange: (update) =>
      update.startState.field(field) !== update.state.field(field) ||
      update.startState.field(hoverField) !== update.state.field(hoverField),
    initialSpacer: () => addMarker,
    domEventHandlers: {
      mousedown(view, line, event) {
        if (/** @type {MouseEvent} */ (event).button !== 0) return false;
        const { threads } = modelsAt(view.state, line.from);
        if (threads.length) {
          // all collapsed → expand all; otherwise collapse the open ones
          const expand = threads.every((model) => model.collapsed);
          for (const model of threads) if (model.collapsed === expand) api.toggle(model.id);
        } else return false;
        return true;
      },
    },
  });
}

/** @param {CommentsField} field @param {CommentsApi} api */
export function commentsExtension(field, api) {
  return [
    field,
    hoverField,
    hoverTracker,
    addInLineNumbers(field, api),
    stickyGeometry,
    commentsGutter(field, api),
  ];
}
