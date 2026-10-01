import { emit, emitCancelable } from "../../core/emit.js";
import { CommentsBarController } from "./CommentsBarController.js";
import { DraftController } from "./DraftController.js";
import { canResolveThread } from "./shared.js";
import { ThreadsController } from "./ThreadsController.js";

/**
 * @typedef {import("./comments.js").CdxComments} CdxComments
 * @typedef {import("./comments.js").CdxCommentsConfig} CdxCommentsConfig
 * @typedef {import("./comments-bar.js").CdxCommentsBar} CdxCommentsBar
 * @typedef {import("./shared.js").CdxThread} CdxThread
 * @typedef {import("./shared.js").CdxComment} CdxComment
 * @typedef {import("./shared.js").CdxCommentRange} CdxCommentRange
 * @typedef {import("./shared.js").CdxThreadPending} CdxThreadPending
 */

/**
 * Line comments: reads the slotted `<cdx-comments>` / `<cdx-comments-bar>`, routes what the widgets
 * report to the threads, the open field and the bar, and is the public API's single door.
 */
export class CommentsController {
  /** @type {import("lit").ReactiveControllerHost & HTMLElement & { filename: string }} */
  #host;
  /** @type {CdxComments | null} */
  #element = null;
  /** @type {CdxCommentsConfig | null} resolved once per carrier change, so models keep identity */
  #config = null;
  /** @type {ThreadsController} */
  #threads;
  /** @type {DraftController} */
  #drafts;
  /** @type {CommentsBarController} */
  #bar;
  /** @type {CdxCommentsBar | null} */
  #barElement = null;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement & { filename: string }} host
   * @param {import("../../controllers/EditorViewController.js").EditorViewController} editor
   */
  constructor(host, editor) {
    this.#host = host;
    this.#threads = new ThreadsController(editor, {
      onUi: (_view, id, detail) => this.#handleUi(id, detail),
      onOpen: (_view, line, source) => this.#drafts.openAt(line, { source }),
      text: (id) => this.#drafts.textOf(id),
    });
    this.#drafts = new DraftController({
      host,
      editor,
      threads: this.#threads,
      config: () => /** @type {CdxCommentsConfig} */ (this.#config),
    });
    this.#bar = new CommentsBarController(host, editor, {
      threads: this.#threads,
      config: () => this.#config,
    });
    host.addEventListener("cdx-comments-config", (event) => {
      if (event.target !== host) this.#reconfigure();
    });
    host.addEventListener("cdx-comments-bar-config", (event) => {
      if (event.target !== host) this.#bar.setBar(this.#barElement?.config ?? null);
    });
  }

  /** Placed ahead of the diff's compartments in the editor's extension list. */
  get extension() {
    return this.#threads.extension;
  }

  /** Effects that bring a tab's stored state up to the current settings. */
  effectsFor() {
    return this.#threads.effectsFor();
  }

  /** @param {HTMLSlotElement} slot */
  handleSlotchange(slot) {
    const elements = slot.assignedElements();
    const found = elements.find((element) => element.localName === "cdx-comments");
    if (elements.length > 1 || (elements.length && !found)) {
      console.error('cdx-code-editor: slot="comments" takes one <cdx-comments>');
    }
    this.#element = /** @type {CdxComments | null} */ (found ?? null);
    this.#reconfigure();
  }

  /** @param {HTMLSlotElement} slot */
  handleBarSlotchange(slot) {
    const elements = slot.assignedElements();
    const found = elements.find((element) => element.localName === "cdx-comments-bar");
    if (elements.length > 1 || (elements.length && !found)) {
      console.error('cdx-code-editor: slot="comments-bar" takes one <cdx-comments-bar>');
    }
    this.#barElement = /** @type {CdxCommentsBar | null} */ (found ?? null);
    this.#bar.setBar(this.#barElement?.config ?? null);
  }

  /** What the host renders as the floating bar. */
  get bar() {
    return this.#bar.bar;
  }

  /** @param {{ action: "previous" | "next" | "resolve-all" }} detail */
  handleBarAction(detail) {
    if (detail.action === "resolve-all") this.resolveAll(true);
    else this.#bar.navigate(detail.action === "next" ? 1 : -1);
  }

  #reconfigure() {
    const previous = this.#config?.threads;
    this.#config = this.#element?.config ?? null;
    this.#threads.setConfig(this.#config);
    const next = this.#config?.threads;
    if (next !== undefined && next !== previous) this.#drafts.acknowledge(previous ?? [], next);
    this.#bar.changed();
  }

  /** Routes a widget's `cdx-comment-ui` message.
   * @param {string} id @param {{ action: string } & Record<string, any>} detail */
  #handleUi(id, detail) {
    const config = this.#config;
    if (!config) return;
    const owned = this.#drafts.owns(id, detail.kind);
    switch (detail.action) {
      case "field-input":
        if (owned) this.#drafts.input(detail.text);
        break;
      case "field-submit":
        if (owned) this.#drafts.submit();
        break;
      case "field-cancel":
        if (owned) this.#drafts.cancel(detail.reason === "escape" ? "escape" : "button");
        break;
      case "field-open": {
        // an idle reply box took focus: it becomes the draft, replacing any other
        const thread = owned ? null : this.#threads.find(id);
        if (thread) this.#drafts.openAt(thread.line, { source: "gutter" });
        break;
      }
      case "item-edit":
        this.#drafts.edit(id, detail.commentId);
        break;
      case "item-delete": {
        const thread = this.#threads.find(id);
        if (thread) this.#deleteComments([{ thread, commentIds: [detail.commentId] }]);
        break;
      }
      case "thread-toggle":
        this.#toggle(id);
        break;
      case "thread-resolve": {
        const thread = this.#threads.find(id);
        if (thread) this.#resolveThreads([thread], (item) => !item.resolved);
        break;
      }
    }
  }

  /** @param {string} id */
  #toggle(id) {
    const thread = this.#threads.find(id);
    const config = this.#config;
    if (!thread || !config) return;
    const collapsed = thread.collapsed ?? (!!thread.resolved && config.collapseResolved);
    this.#threads.setCollapsed(id, !collapsed);
    emit(this.#host, "cdx-comment-toggle", {
      threadId: id,
      line: thread.line,
      file: this.#host.filename,
      expanded: collapsed,
    });
  }

  /** Resolve / reopen in two transactions however many threads: all start waiting (a listener may
   *  answer synchronously), one `cdx-comment-resolve` each, then the uncancelled ones are applied
   *  together — uncontrolled, and only those still waiting on this call's mark.
   * @param {CdxThread[]} threads @param {(thread: CdxThread) => boolean} resolvedOf */
  #resolveThreads(threads, resolvedOf) {
    const busy = this.#threads.pendingById();
    const targets = threads
      .filter((thread) => !busy.get(thread.id))
      .map((thread) => ({ thread, resolved: resolvedOf(thread) }))
      .filter(({ thread, resolved }) => !!thread.resolved !== resolved);
    if (!targets.length) return;
    /** @type {Map<string, CdxThreadPending>} */
    const marks = new Map(
      targets.map(({ thread, resolved }) => [thread.id, { action: "resolve", resolved }]),
    );
    this.#threads.setPendingMany(marks);
    /** @type {{ id: string, resolved: boolean }[]} */
    const applied = [];
    for (const { thread, resolved } of targets) {
      const prevented = emitCancelable(this.#host, "cdx-comment-resolve", {
        threadId: thread.id,
        line: thread.line,
        file: this.#host.filename,
        resolved,
      });
      if (!prevented && !this.#threads.controlled) applied.push({ id: thread.id, resolved });
    }
    const now = this.#threads.pendingById();
    this.#threads.applyResolved(applied.filter(({ id }) => now.get(id) === marks.get(id)));
  }

  /** Delete the same way: all start waiting, one `cdx-comment-delete` per comment, then the
   *  uncancelled ones go in one transaction.
   * @param {{ thread: CdxThread, commentIds: string[] }[]} targets */
  #deleteComments(targets) {
    const busy = this.#threads.pendingById();
    const list = targets
      .filter(({ thread }) => !busy.get(thread.id))
      .map(({ thread, commentIds }) => ({
        thread,
        commentIds: commentIds.filter((id) => thread.comments.some((comment) => comment.id === id)),
      }))
      .filter(({ commentIds }) => commentIds.length);
    if (!list.length) return;
    this.#threads.setPendingMany(
      new Map(list.map(({ thread, commentIds }) => [thread.id, { action: "delete", commentIds }])),
    );
    /** @type {{ id: string, commentIds: string[] }[]} */
    const done = [];
    for (const { thread, commentIds } of list) {
      const ids = commentIds.filter(
        (commentId) =>
          !emitCancelable(this.#host, "cdx-comment-delete", {
            threadId: thread.id,
            line: thread.line,
            file: this.#host.filename,
            commentId,
          }) && !this.#threads.controlled,
      );
      if (ids.length) done.push({ id: thread.id, commentIds: ids });
    }
    this.#threads.removeComments(done, true);
  }

  // — public API, delegated from <cdx-code-editor> —

  /** @param {number} line @param {{ range?: CdxCommentRange | null, newThread?: boolean }} [options] */
  openComment(line, options = {}) {
    if (!this.#config) return null;
    return this.#drafts.openAt(line, { source: "api", ...options });
  }

  /** @returns {CdxThread[]} */
  getComments() {
    return this.#threads.threads;
  }

  /** Adds a comment thread, or replaces the one with its id.
   * @param {CdxThread} thread */
  addComment(thread) {
    this.#threads.put(thread);
  }

  /** Controlled `comments` belong to the host: the next assignment would bring them back.
   * @param {string} method */
  #warnControlled(method) {
    if (!this.#threads.controlled) return false;
    console.warn(`cdx-code-editor: ${method}() is for uncontrolled comments; update \`comments\``);
    return true;
  }

  /** @param {string} threadId @param {Partial<CdxComment>} [comment]
   *  @param {{ threadId?: string }} [options] */
  resolveSubmit(threadId, comment, options) {
    this.#drafts.resolve(threadId, comment, options);
  }

  /** @param {string} threadId @param {string} message */
  rejectSubmit(threadId, message) {
    this.#drafts.reject(threadId, message);
  }

  /** @param {string} threadId @param {string} text */
  setDraft(threadId, text) {
    this.#drafts.setText(threadId, text);
  }

  /** Answers a waiting resolve — or, uncontrolled, resolves directly.
   * @param {string} threadId @param {boolean} [resolved] */
  resolveComment(threadId, resolved = true) {
    if (this.#threads.controlled) this.#threads.setPending(threadId, null);
    else this.#threads.applyResolved([{ id: threadId, resolved }]);
  }

  /** Answers a waiting delete — or, uncontrolled, deletes directly.
   * @param {string} threadId @param {string} commentId */
  deleteComment(threadId, commentId) {
    this.#threads.removeComments(
      [{ id: threadId, commentIds: [commentId] }],
      !this.#threads.controlled,
    );
  }

  /** The host couldn't resolve or delete: the waiting state ends with an error on the thread.
   * @param {string} threadId @param {string} message */
  rejectComment(threadId, message) {
    this.#threads.setPending(threadId, null, message);
  }

  /** Resolves (or reopens) every thread the user may resolve, each through its own
   *  `cdx-comment-resolve`.
   * @param {boolean} [resolved] */
  resolveAll(resolved = true) {
    const config = this.#config;
    if (!config) return;
    this.#resolveThreads(
      this.#threads.threads.filter((thread) => canResolveThread(config, thread)),
      () => resolved,
    );
  }

  /** Removes every comment, or with `id` one comment — a thread goes with its last — or, when no
   *  comment has that id, the thread with it (comment ids win: GitHub REST threads often reuse their
   *  first comment's id). A host command: no events, no permission hooks. Uncontrolled only; an
   *  open reply / edit on what went closes with `reason: "removed"`.
   * @param {string} [id] */
  clearComments(id) {
    if (!this.#config || this.#warnControlled("clearComments")) return;
    if (id === undefined) {
      this.#threads.set([]);
      return;
    }
    const threadId = this.#threads.threadIdOf(id);
    if (threadId) this.#threads.removeComments([{ id: threadId, commentIds: [id] }], true);
    else if (this.#threads.has(id)) this.#threads.remove(id);
  }
}
