import { emit } from "../../core/emit.js";
import { canResolveThread } from "./shared.js";

/**
 * @typedef {import("./comments-bar.js").CdxCommentsBarConfig} CdxCommentsBarConfig
 * @typedef {import("./comments.js").CdxCommentsConfig} CdxCommentsConfig
 * @typedef {import("./shared.js").CdxThread} CdxThread
 * @typedef {import("../../components/comments-nav/comments-nav.js").CdxCommentsNavModel} CdxCommentsNavModel
 * @typedef {import("./ThreadsController.js").ThreadsController} ThreadsController
 */

/**
 * The optional open-threads bar: which threads are open, which one the caret is on, stepping
 * between them. Re-renders the host at most once a frame, since the bar follows the caret.
 */
export class CommentsBarController {
  /** @type {import("lit").ReactiveControllerHost & HTMLElement & { filename: string }} */
  #host;
  /** @type {import("../../controllers/EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {ThreadsController} */
  #threads;
  /** @type {() => CdxCommentsConfig | null} */
  #config;
  /** @type {CdxCommentsBarConfig | null} */
  #bar = null;
  #frame = 0;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement & { filename: string }} host
   * @param {import("../../controllers/EditorViewController.js").EditorViewController} editor
   * @param {{ threads: ThreadsController, config: () => CdxCommentsConfig | null }} ctx
   */
  constructor(host, editor, ctx) {
    this.#host = host;
    this.#editor = editor;
    this.#threads = ctx.threads;
    this.#config = ctx.config;
    host.addController(this);
    editor.subscribe((before, after, transactions) => {
      if (!this.#bar) return;
      if (
        after.doc !== before.doc ||
        !after.selection.eq(before.selection) ||
        transactions.some((tr) => tr.effects.length)
      ) {
        this.#schedule();
      }
    });
    editor.onReplace(() => this.#schedule());
  }

  hostDisconnected() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** @param {CdxCommentsBarConfig | null} config */
  setBar(config) {
    this.#bar = config;
    this.#host.requestUpdate();
  }

  /** The comments config changed (mode, resolve). */
  changed() {
    this.#schedule();
  }

  #schedule() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#host.requestUpdate();
    });
  }

  /** Unresolved, current threads by line. @returns {CdxThread[]} */
  #open() {
    return this.#threads.threads
      .filter((thread) => !thread.resolved && !thread.outdated && thread.comments.length)
      .sort((a, b) => a.line - b.line);
  }

  #caretLine() {
    const state = this.#editor.state;
    return state ? state.doc.lineAt(state.selection.main.head).number : -1;
  }

  /** What the host renders; null while the bar is off or has nothing to show.
   * @returns {{ config: CdxCommentsBarConfig, model: CdxCommentsNavModel } | null} */
  get bar() {
    const config = this.#config();
    const bar = this.#bar;
    if (!config || !bar || bar.visibility === "never") return null;
    // no comments at all → no bar, whatever `visibility` says
    if (!this.#threads.threads.some((thread) => thread.comments.length)) return null;
    const open = this.#open();
    if (!open.length && bar.visibility === "auto") return null;
    const line = this.#caretLine();
    const pending = this.#threads.pendingById();
    const resolvable = open.filter((thread) => canResolveThread(config, thread));
    return {
      config: bar,
      model: {
        total: open.length,
        index: open.findIndex((thread) => thread.line === line),
        action: config.resolvable,
        canAct: resolvable.some((thread) => !pending.get(thread.id)),
        busy: resolvable.some((thread) => pending.get(thread.id)?.action === "resolve"),
      },
    };
  }

  /** Steps the caret to the previous/next open thread, wrapping, and expands it.
   * @param {1 | -1} direction */
  navigate(direction) {
    const open = this.#open();
    if (!open.length) return;
    const line = this.#caretLine();
    const current = open.findIndex((thread) => thread.line === line);
    let index = (current + direction + open.length) % open.length;
    if (current < 0) {
      index =
        direction > 0
          ? open.findIndex((thread) => thread.line > line)
          : open.map((thread) => thread.line < line).lastIndexOf(true);
      if (index < 0) index = direction > 0 ? 0 : open.length - 1;
    }
    const thread = open[index];
    this.#threads.setCollapsed(thread.id, false);
    this.#threads.reveal(thread.id);
    emit(this.#host, "cdx-comment-navigate", {
      threadId: thread.id,
      line: thread.line,
      file: this.#host.filename,
      index,
      count: open.length,
    });
  }
}
