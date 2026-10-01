import { Compartment, EditorSelection } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import {
  collapseEffect,
  commentsExtension,
  createCommentsField,
  draftEffect,
  patchThreadEffect,
  pendingEffect,
  putThreadEffect,
  refreshEffect,
  setThreadsEffect,
  threadOf,
} from "./threads.js";

/**
 * @typedef {import("./shared.js").CdxThread} CdxThread
 * @typedef {import("./comments.js").CdxCommentsConfig} CdxCommentsConfig
 * @typedef {import("./threads.js").Draft} Draft
 * @typedef {import("./threads.js").CommentsApi} CommentsApi
 * @typedef {{
 *   onUi: CommentsApi["ui"],
 *   onOpen: (view: EditorView, line: number, source: "gutter" | "keyboard") => void,
 *   text: CommentsApi["text"],
 * }} ThreadsHandlers
 */

/**
 * The model: threads live in a CodeMirror StateField (so they follow edits), this controller is the
 * only writer. Controlled (`threads` set on `<cdx-comments>`) it only mirrors the consumer's array;
 * uncontrolled it also applies what the other controllers decide.
 */
export class ThreadsController {
  /** @type {import("../../controllers/EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {CdxCommentsConfig | null} */
  #config = null;
  /** @type {CdxThread[] | undefined} */
  #lastThreads;
  #seeded = false;
  /** @type {CdxThread[] | null} uncontrolled threads kept while `<cdx-comments>` is out */
  #stash = null;
  #compartment = new Compartment();
  #enabled = false;
  #handlers;
  #api = /** @type {CommentsApi} */ ({
    config: () => this.#config,
    ui: (view, id, detail) => this.#handlers.onUi(view, id, detail),
    canAdd: (line) => this.#canAdd(line),
    open: (view, line) => this.#handlers.onOpen(view, line, "gutter"),
    toggle: (id) =>
      this.#handlers.onUi(/** @type {EditorView} */ (this.#editor.view), id, {
        action: "thread-toggle",
      }),
    text: (id) => this.#handlers.text(id),
  });
  #field = createCommentsField(this.#api);

  /**
   * @param {import("../../controllers/EditorViewController.js").EditorViewController} editor
   * @param {ThreadsHandlers} handlers
   */
  constructor(editor, handlers) {
    this.#editor = editor;
    this.#handlers = handlers;
    editor.onReplace(() => {
      if (this.controlled && this.#config?.threads) this.set(this.#config.threads);
    });
  }

  /** Empty until a `<cdx-comments>` is slotted. Placed before the diff's compartments, which keeps
   *  the comment column left of the change marks. */
  get extension() {
    return this.#compartment.of([]);
  }

  /** The comment column, widgets and keys, or nothing while there's no `<cdx-comments>`. */
  #feature() {
    return this.#enabled
      ? [
          commentsExtension(this.#field, this.#api),
          keymap.of([{ key: "Mod-Alt-m", run: (view) => this.#openAtCaret(view) }]),
        ]
      : [];
  }

  /** @param {EditorView} view */
  #openAtCaret(view) {
    if (!this.#config) return false;
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    this.#handlers.onOpen(view, line, "keyboard");
    return true;
  }

  /** Effects that bring a document that isn't on screen yet — a tab — up to date. */
  effectsFor() {
    return [this.#compartment.reconfigure(this.#feature())];
  }

  /** @param {CdxCommentsConfig | null} next */
  setConfig(next) {
    const enabled = next !== null;
    const previous = this.#config;
    // uncontrolled threads live only in the field, which goes with the compartment: keep them
    if (!enabled && this.#enabled && previous?.threads === undefined) this.#stash = this.threads;
    // controlled threads go with the field too: the same array must be applied again on return
    if (!enabled) this.#lastThreads = undefined;
    this.#config = next;
    if (enabled !== this.#enabled) {
      this.#enabled = enabled;
      this.#editor.dispatch({ effects: this.#compartment.reconfigure(this.#feature()) });
    } else if (enabled) {
      this.#editor.dispatch({ effects: refreshEffect.of(null) });
    }
    if (!next) return;
    if (next.threads !== undefined) {
      if (next.threads !== this.#lastThreads) {
        this.#lastThreads = next.threads;
        this.set(next.threads);
      }
    } else if (this.#stash) {
      const stash = this.#stash;
      this.#stash = null;
      if (stash.length) this.set(stash);
    } else if (!this.#seeded && !previous) {
      this.#seeded = true;
      if (next.defaultThreads.length) this.set(next.defaultThreads);
    }
  }

  /** Controlled: the consumer's array is the truth. */
  get controlled() {
    return this.#config?.threads !== undefined;
  }

  /** @param {number} line */
  #canAdd(line) {
    const config = this.#config;
    if (!config) return false;
    // no new field while a submit waits for the host; a line with a thread never asks (the gutter
    // shows its marker instead), so single mode needs no lookup here
    if (this.draft?.sending) return false;
    return config.canComment?.({ line, thread: null }) ?? true;
  }

  #state() {
    const state = this.#editor.state;
    return state && this.#enabled ? state : undefined;
  }

  get #value() {
    const state = this.#state();
    return state?.field(this.#field, false);
  }

  /** @returns {CdxThread[]} */
  get threads() {
    const state = this.#state();
    const value = this.#value;
    return state && value ? value.entries.map((entry) => threadOf(state, entry)) : [];
  }

  /** @param {string} id */
  find(id) {
    return this.threads.find((thread) => thread.id === id) ?? null;
  }

  /** @param {number} line */
  byLine(line) {
    return this.threads.find((thread) => thread.line === line) ?? null;
  }

  /** @returns {Draft | null} */
  get draft() {
    return this.#value?.draft ?? null;
  }

  /** @param {CdxThread[]} threads */
  set(threads) {
    this.#editor.dispatch({ effects: setThreadsEffect.of(threads) });
  }

  /** @param {CdxThread} thread */
  put(thread) {
    this.#editor.dispatch({ effects: putThreadEffect.of(thread) });
  }

  /** @param {string} id @param {Parameters<typeof patchThreadEffect.of>[0]["apply"]} apply */
  patch(id, apply) {
    this.#editor.dispatch({ effects: patchThreadEffect.of({ id, apply }) });
  }

  /** @param {string} id */
  remove(id) {
    this.patch(id, () => null);
  }

  /** @param {string} id @param {boolean | undefined} collapsed */
  setCollapsed(id, collapsed) {
    this.#editor.dispatch({ effects: collapseEffect.of({ id, collapsed }) });
  }

  /** @param {string} id */
  pending(id) {
    return this.#value?.entries.find((entry) => entry.id === id)?.pending ?? null;
  }

  /** The thread holding a comment; no thread objects built.
   * @param {string} commentId */
  threadIdOf(commentId) {
    return (
      this.#value?.entries.find((entry) => entry.data.comments.some((c) => c.id === commentId))
        ?.id ?? null
    );
  }

  /** Whether the thread — and, given, that comment in it — is still there; no thread objects built.
   * @param {string} id @param {string} [commentId] */
  has(id, commentId) {
    const entry = this.#value?.entries.find((item) => item.id === id);
    if (!entry) return false;
    return (
      commentId === undefined || entry.data.comments.some((comment) => comment.id === commentId)
    );
  }

  /** @param {string} id @param {import("./shared.js").CdxThreadPending | null} pending
   *  @param {string} [error] */
  setPending(id, pending, error = "") {
    this.#editor.dispatch({ effects: pendingEffect.of({ id, pending, error }) });
  }

  /** @returns {Map<string, import("./shared.js").CdxThreadPending | null>} */
  pendingById() {
    return new Map((this.#value?.entries ?? []).map((entry) => [entry.id, entry.pending ?? null]));
  }

  /** Marks many threads waiting in one transaction.
   * @param {Map<string, import("./shared.js").CdxThreadPending>} marks */
  setPendingMany(marks) {
    if (!marks.size) return;
    this.#editor.dispatch({
      effects: [...marks].map(([id, pending]) => pendingEffect.of({ id, pending, error: "" })),
    });
  }

  /** Uncontrolled resolve: state set, waiting over, collapse back to its default — one transaction.
   * @param {{ id: string, resolved: boolean }[]} list */
  applyResolved(list) {
    if (!list.length) return;
    this.#editor.dispatch({
      effects: list.flatMap(({ id, resolved }) => [
        pendingEffect.of({ id, pending: null, error: "" }),
        patchThreadEffect.of({ id, apply: (data) => ({ ...data, resolved }) }),
        collapseEffect.of({ id, collapsed: undefined }),
      ]),
    });
  }

  /** Ends the wait on these comments and, with `data` (uncontrolled), removes them; a thread left
   *  without comments goes. One transaction.
   * @param {{ id: string, commentIds: string[] }[]} list @param {boolean} data */
  removeComments(list, data) {
    if (!list.length) return;
    const now = this.pendingById();
    const effects = list.flatMap(({ id, commentIds }) => {
      const pending = now.get(id);
      const left =
        pending?.action === "delete"
          ? pending.commentIds.filter((commentId) => !commentIds.includes(commentId))
          : null;
      return [
        ...(left
          ? [
              pendingEffect.of({
                id,
                pending: left.length ? { action: "delete", commentIds: left } : null,
                error: "",
              }),
            ]
          : []),
        ...(data
          ? [
              patchThreadEffect.of({
                id,
                apply: (thread) => {
                  const comments = thread.comments.filter((c) => !commentIds.includes(c.id));
                  return comments.length ? { ...thread, comments } : null;
                },
              }),
            ]
          : []),
      ];
    });
    if (effects.length) this.#editor.dispatch({ effects });
  }

  /** @param {Draft | null} draft */
  setDraft(draft) {
    this.#editor.dispatch({ effects: draftEffect.of(draft) });
  }

  /** Scrolls the thread's line into view and puts the caret at its start.
   * @param {string} id */
  reveal(id) {
    const view = this.#editor.view;
    const thread = this.find(id);
    if (!view || !thread) return;
    const line = view.state.doc.line(Math.min(thread.line, view.state.doc.lines));
    view.dispatch({
      selection: EditorSelection.cursor(line.from),
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
  }

  /** Focuses the open field of a thread once its widget has rendered.
   * @param {string} id */
  focusField(id) {
    requestAnimationFrame(() => {
      const row = this.#editor.view?.dom.querySelector(
        `.cdx-comment-row[data-thread-id="${CSS.escape(id)}"]`,
      );
      /** @type {import("../../components/comment-thread/comment-thread.js").CdxCommentThread | null | undefined} */ (
        row?.querySelector("cdx-comment-thread")
      )?.focusField();
    });
  }
}
