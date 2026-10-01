import { emit, emitCancelable } from "../../core/emit.js";
import { uid } from "./shared.js";

/**
 * @typedef {import("./shared.js").CdxComment} CdxComment
 * @typedef {import("./shared.js").CdxThread} CdxThread
 * @typedef {import("./shared.js").CdxCommentRange} CdxCommentRange
 * @typedef {import("./shared.js").CdxCommentDraft} CdxCommentDraft
 * @typedef {import("./threads.js").Draft} Draft
 * @typedef {import("./comments.js").CdxCommentsConfig} CdxCommentsConfig
 * @typedef {import("./ThreadsController.js").ThreadsController} ThreadsController
 * @typedef {{
 *   host: HTMLElement & { filename: string },
 *   editor: import("../../controllers/EditorViewController.js").EditorViewController,
 *   threads: ThreadsController,
 *   config: () => CdxCommentsConfig,
 * }} CommentsContext
 */

const DRAFT_DELAY_MS = 300;

/**
 * The one open field — a new thread, a reply or an edit in place: its text, validation and
 * the submit round trip. Applies the result to the model only when uncontrolled and not cancelled;
 * otherwise the field waits ("Sending…") for `resolveSubmit` / `rejectSubmit` or new `threads`.
 */
export class DraftController {
  /** @type {CommentsContext} */
  #ctx;
  /** Typed text per draft thread: out of the draft so a keystroke doesn't rebuild the widget, per
   *  thread so tabs don't share it. A remounted widget reads it back through `textOf`.
   * @type {Map<string, string>} */
  #texts = new Map();
  #token = 0;
  #timer = 0;

  /** @param {CommentsContext} ctx */
  constructor(ctx) {
    this.#ctx = ctx;
    ctx.editor.subscribe(() => this.#dropOrphan());
    ctx.editor.onReplace(() => this.#dropOrphan());
  }

  /** A reply whose thread, or an edit whose comment, went away (deleted, `clearComments`, a
   *  `threads` without it) has nothing left to render in; a sending one waits for the host. */
  #dropOrphan() {
    const draft = this.#draft;
    if (!draft || draft.sending || draft.kind === "new") return;
    const threads = this.#ctx.threads;
    const there =
      draft.kind === "edit"
        ? threads.has(draft.threadId, draft.commentId)
        : threads.has(draft.threadId);
    if (!there) this.cancel("removed");
  }

  get #draft() {
    return this.#ctx.threads.draft;
  }

  get #file() {
    return this.#ctx.host.filename;
  }

  get open() {
    return this.#draft !== null;
  }

  get #text() {
    const draft = this.#draft;
    return draft ? (this.#texts.get(draft.threadId) ?? draft.text) : "";
  }

  /** @param {string} threadId */
  textOf(threadId) {
    return this.#texts.get(threadId) ?? null;
  }

  /** Whether a field's message is about the open draft — an idle reply box elsewhere isn't.
   * @param {string} threadId @param {string} kind */
  owns(threadId, kind) {
    const draft = this.#draft;
    return !!draft && draft.threadId === threadId && draft.kind === kind;
  }

  /** @param {Draft} draft */
  #show(draft) {
    this.#texts.set(draft.threadId, draft.text);
    this.#ctx.threads.setDraft(draft);
    this.#ctx.threads.focusField(draft.threadId);
  }

  /** @param {Partial<Draft>} patch */
  #patch(patch) {
    const draft = this.#draft;
    if (draft) this.#ctx.threads.setDraft({ ...draft, ...patch });
  }

  /** Opens the field for a line; returns the thread id, or null when it can't open.
   * @param {number} line
   * @param {{ source?: "gutter" | "keyboard" | "api", range?: CdxCommentRange | null,
   *   newThread?: boolean }} [options] `newThread`: another thread on a line that has one
   * @returns {string | null} */
  openAt(line, options = {}) {
    const config = this.#ctx.config();
    const state = this.#ctx.editor.state;
    if (!state || !Number.isFinite(line)) return null;
    line = Math.min(Math.max(1, Math.trunc(line)), state.doc.lines);
    const { source = "api", range = null } = options;
    const thread =
      options.newThread && config.mode === "thread" ? null : this.#ctx.threads.byLine(line);
    if (thread && config.mode === "single") {
      this.#ctx.threads.setCollapsed(thread.id, false);
      return thread.id;
    }
    // a submit still waiting for the host keeps its field
    if (this.#draft?.sending) return null;
    if (config.canComment && !config.canComment({ line, thread })) return null;
    const threadId = thread?.id ?? uid("thread");
    const prevented = emitCancelable(this.#ctx.host, "cdx-comment-open", {
      line,
      file: this.#file,
      threadId: thread?.id ?? null,
      source,
      range,
    });
    if (prevented) return null;
    if (this.#draft) this.cancel("replaced");
    if (thread) this.#ctx.threads.setCollapsed(thread.id, false);
    this.#show({
      kind: thread ? "reply" : "new",
      threadId,
      pos: state.doc.line(Math.min(line, state.doc.lines)).from,
      line,
      range,
      sending: false,
      error: "",
      rev: 0,
      text: "",
    });
    return threadId;
  }

  /** Edit in place.
   * @param {string} threadId @param {string} commentId */
  edit(threadId, commentId) {
    const thread = this.#ctx.threads.find(threadId);
    const comment = thread?.comments.find((item) => item.id === commentId);
    const state = this.#ctx.editor.state;
    if (!thread || !comment || !state || this.#draft?.sending) return;
    if (this.#draft) this.cancel("replaced");
    this.#show({
      kind: "edit",
      threadId,
      commentId,
      pos: state.doc.line(Math.min(thread.line, state.doc.lines)).from,
      line: thread.line,
      range: thread.range ?? null,
      sending: false,
      error: "",
      rev: 0,
      text: comment.body,
    });
  }

  /** @param {string} text */
  input(text) {
    const draft = this.#draft;
    if (!draft) return;
    this.#texts.set(draft.threadId, text);
    if (draft.error) this.#patch({ error: "" });
    clearTimeout(this.#timer);
    this.#timer = window.setTimeout(() => {
      emit(this.#ctx.host, "cdx-comment-draft", {
        threadId: draft.threadId,
        line: this.#currentLine(draft),
        file: this.#file,
        isReply: draft.kind === "reply",
        length: text.length,
      });
    }, DRAFT_DELAY_MS);
  }

  /** Restores text typed earlier — a draft the host kept across a file switch.
   * @param {string} threadId @param {string} text */
  setText(threadId, text) {
    const draft = this.#draft;
    if (draft?.threadId === threadId) {
      this.#texts.set(threadId, text);
      this.#patch({ text, rev: draft.rev + 1 });
      return;
    }
    const thread = this.#ctx.threads.find(threadId);
    if (!thread) return;
    this.openAt(thread.line, { source: "api" });
    const opened = this.#draft;
    if (!opened) return;
    this.#texts.set(opened.threadId, text);
    this.#patch({ text, rev: opened.rev + 1 });
  }

  /** @param {"button" | "escape" | "replaced" | "removed"} reason */
  cancel(reason) {
    const draft = this.#draft;
    if (!draft) return;
    clearTimeout(this.#timer);
    this.#token++;
    const hadDraft = this.#text.trim() !== "";
    this.#texts.delete(draft.threadId);
    this.#ctx.threads.setDraft(null);
    emit(this.#ctx.host, "cdx-comment-cancel", {
      threadId: draft.threadId,
      line: this.#currentLine(draft),
      file: this.#file,
      isReply: draft.kind === "reply",
      hadDraft,
      reason,
      // the host may still be saving it: abort, or keep what it saves
      wasSending: draft.sending,
    });
    if (reason === "button" || reason === "escape") this.#ctx.editor.focus();
  }

  /** @param {Draft} draft */
  #currentLine(draft) {
    const state = this.#ctx.editor.state;
    return state ? state.doc.lineAt(Math.min(draft.pos, state.doc.length)).number : draft.line;
  }

  /** Validation, then the event; applies the result when it's ours to apply.
   * @returns {Promise<void>} */
  async submit() {
    let draft = this.#draft;
    if (!draft || draft.sending) return;
    const config = this.#ctx.config();
    const body = this.#text.trim();
    if (!body) return;
    if (config.maxLength > 0 && this.#text.length > config.maxLength) {
      this.#patch({ error: `Up to ${config.maxLength} characters` });
      return;
    }
    let line = this.#currentLine(draft);
    /** @type {CdxCommentDraft} */
    const context = {
      threadId: draft.kind === "new" ? null : draft.threadId,
      commentId: draft.commentId,
      line,
      range: draft.range,
      body,
      isReply: draft.kind === "reply",
      isEdit: draft.kind === "edit",
    };
    if (config.validate) {
      const token = ++this.#token;
      let message;
      try {
        message = await config.validate(context);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      if (token !== this.#token || this.#draft?.threadId !== draft.threadId) return;
      if (message) {
        this.#patch({ error: message });
        return;
      }
      // typed on while it validated: validate what will actually be sent
      if (this.#text.trim() !== body) return this.submit();
      draft = /** @type {Draft} */ (this.#draft);
    }
    // read after the await: the document may have changed meanwhile
    const state = this.#ctx.editor.state;
    if (!state) return;
    line = this.#currentLine(draft);
    if (draft.kind === "edit") return this.#submitEdit(draft, body, line);
    const thread = this.#ctx.threads.find(draft.threadId);
    const pos = state.doc.line(Math.min(line, state.doc.lines)).from;
    const prevented = emitCancelable(this.#ctx.host, "cdx-comment-submit", {
      threadId: draft.threadId,
      line,
      file: this.#file,
      body,
      isReply: draft.kind === "reply",
      range: draft.range,
      lineText: state.doc.lineAt(pos).text,
    });
    if (prevented || this.#ctx.threads.controlled) {
      this.#patch({ sending: true, error: "" });
      return;
    }
    this.#applySubmit(draft, thread, body, line, state.doc.lineAt(pos).text);
  }

  /** @param {Draft} draft @param {string} body @param {number} line */
  #submitEdit(draft, body, line) {
    const thread = this.#ctx.threads.find(draft.threadId);
    const comment = thread?.comments.find((item) => item.id === draft.commentId);
    if (!thread || !comment) return this.cancel("button");
    if (body === comment.body) {
      this.#closeDraft();
      return;
    }
    const prevented = emitCancelable(this.#ctx.host, "cdx-comment-edit", {
      threadId: thread.id,
      line,
      file: this.#file,
      commentId: comment.id,
      body,
      previous: comment.body,
    });
    if (prevented || this.#ctx.threads.controlled) {
      this.#patch({ sending: true, error: "" });
      return;
    }
    this.#applyEdit(thread.id, comment.id, body);
  }

  /** @param {string} threadId @param {string} commentId @param {string} body
   *  @param {Partial<CdxComment>} [extra] */
  #applyEdit(threadId, commentId, body, extra = {}) {
    this.#ctx.threads.patch(threadId, (data) => ({
      ...data,
      comments: data.comments.map((comment) =>
        comment.id === commentId ? { ...comment, body, editedAt: Date.now(), ...extra } : comment,
      ),
    }));
    this.#closeDraft();
  }

  /** @param {Draft} draft @param {import("./shared.js").CdxThread | null} thread
   *  @param {string} body @param {number} line @param {string} lineText
   *  @param {Partial<CdxComment>} [extra] @param {string} [threadId] a new thread's server id */
  #applySubmit(draft, thread, body, line, lineText, extra = {}, threadId = draft.threadId) {
    const config = this.#ctx.config();
    /** @type {CdxComment} */
    const comment = {
      id: uid("comment"),
      author: config.author,
      body,
      createdAt: Date.now(),
      ...extra,
    };
    if (thread) {
      this.#ctx.threads.patch(thread.id, (data) => ({
        ...data,
        comments: [...data.comments, comment],
      }));
    } else {
      this.#ctx.threads.put({
        id: threadId,
        line,
        range: draft.range ?? undefined,
        lineText,
        comments: [comment],
      });
    }
    this.#closeDraft();
  }

  #closeDraft() {
    clearTimeout(this.#timer);
    this.#token++;
    const draft = this.#draft;
    if (draft) this.#texts.delete(draft.threadId);
    this.#ctx.threads.setDraft(null);
    this.#ctx.editor.focus();
  }

  /** The host saved it. Uncontrolled: adds the comment (server `id`/`author`/`createdAt` welcome;
   *  `options.threadId` renames a new thread to its server id); controlled: closes the field and
   *  waits for `threads`.
   * @param {string} threadId @param {Partial<CdxComment>} [comment]
   * @param {{ threadId?: string }} [options] */
  resolve(threadId, comment, options = {}) {
    const draft = this.#draft;
    const state = this.#ctx.editor.state;
    if (!draft || draft.threadId !== threadId || !state) return;
    if (this.#ctx.threads.controlled) {
      this.#closeDraft();
      return;
    }
    const body = this.#text.trim();
    if (draft.kind === "edit" && draft.commentId) {
      this.#applyEdit(threadId, draft.commentId, comment?.body ?? body, comment ?? {});
      return;
    }
    const thread = this.#ctx.threads.find(threadId);
    // a reply whose thread was removed while it was sending doesn't bring the thread back
    if (draft.kind === "reply" && !thread) {
      this.#closeDraft();
      return;
    }
    const line = this.#currentLine(draft);
    const lineText = state.doc.line(Math.min(line, state.doc.lines)).text;
    this.#applySubmit(
      draft,
      thread,
      comment?.body ?? body,
      line,
      lineText,
      comment ?? {},
      draft.kind === "new" ? (options.threadId ?? threadId) : threadId,
    );
  }

  /** @param {string} threadId @param {string} message */
  reject(threadId, message) {
    if (this.#draft?.threadId === threadId) this.#patch({ sending: false, error: message });
  }

  /** `threads` was assigned while a submit waited: it's the host's answer only if the draft's own
   *  thread changed — a refresh from polling or a push leaves the field waiting.
   * @param {readonly CdxThread[]} previous @param {readonly CdxThread[]} next */
  acknowledge(previous, next) {
    const draft = this.#draft;
    if (!draft?.sending) return;
    const before = previous.find((thread) => thread.id === draft.threadId);
    const after = next.find((thread) => thread.id === draft.threadId);
    /** @param {CdxThread | undefined} thread */
    const body = (thread) => thread?.comments.find((c) => c.id === draft.commentId)?.body;
    const line = this.#currentLine(draft);
    const answered =
      draft.kind === "new"
        ? !!after || next.some((t) => t.line === line && !previous.some((p) => p.id === t.id))
        : draft.kind === "edit"
          ? body(after) !== body(before)
          : !after || after.comments.length !== (before?.comments.length ?? 0);
    if (answered) this.#closeDraft();
  }
}
