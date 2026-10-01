import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * @typedef {import("./shared.js").CdxCommentAuthor} CdxCommentAuthor
 * @typedef {import("./shared.js").CdxThread} CdxThread
 * @typedef {import("./shared.js").CdxComment} CdxComment
 * @typedef {import("./shared.js").CdxCommentDraft} CdxCommentDraft
 * @typedef {{ line: number, thread: CdxThread | null }} CdxCanCommentContext
 * @typedef {{
 *   mode: "thread" | "single",
 *   author: CdxCommentAuthor,
 *   threads: CdxThread[] | undefined,
 *   defaultThreads: CdxThread[],
 *   maxLength: number,
 *   validate: CdxComments["validate"],
 *   canComment: CdxComments["canComment"],
 *   canEdit: CdxComments["canEdit"],
 *   canDelete: CdxComments["canDelete"],
 *   canResolve: CdxComments["canResolve"],
 *   resolvable: boolean,
 *   collapseResolved: boolean,
 *   getAuthor: CdxComments["getAuthor"],
 *   getAvatarUrl: CdxComments["getAvatarUrl"],
 *   labels: CdxCommentLabels,
 * }} CdxCommentsConfig
 */

/** One entry per visible string; override per attribute. */
const LABELS = {
  submit: "Comment",
  reply: "Reply",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  delete: "Delete",
  resolve: "Resolve",
  reopen: "Reopen",
  placeholder: "Add comment",
  replyPlaceholder: "Reply",
  editPlaceholder: "Edit comment",
  outdated: "Outdated",
  sending: "Sending…",
  retry: "Retry",
};

/** @typedef {typeof LABELS} CdxCommentLabels */

/**
 * @tag cdx-comments
 * @summary Line-comments configuration carrier for cdx-code-editor; renders nothing.
 */
@customElement("cdx-comments")
export class CdxComments extends ReactiveElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    mode: { type: String, reflect: true },
    author: { attribute: false },
    comments: { attribute: false },
    defaultComments: { attribute: false },
    maxLength: { type: Number, attribute: "max-length" },
    validate: { attribute: false },
    canComment: { attribute: false },
    canEdit: { attribute: false },
    canDelete: { attribute: false },
    canResolve: { attribute: false },
    noResolve: { type: Boolean, attribute: "no-resolve" },
    expandResolved: { type: Boolean, attribute: "expand-resolved" },
    getAuthor: { attribute: false },
    getAvatarUrl: { attribute: false },
    submitLabel: { type: String, attribute: "submit-label" },
    replyLabel: { type: String, attribute: "reply-label" },
    saveLabel: { type: String, attribute: "save-label" },
    cancelLabel: { type: String, attribute: "cancel-label" },
    editLabel: { type: String, attribute: "edit-label" },
    deleteLabel: { type: String, attribute: "delete-label" },
    resolveLabel: { type: String, attribute: "resolve-label" },
    reopenLabel: { type: String, attribute: "reopen-label" },
    placeholder: { type: String },
    replyPlaceholder: { type: String, attribute: "reply-placeholder" },
  };

  constructor() {
    super();

    /** @type {"thread" | "single"} `thread`: replies and resolve. `single`: one comment per line,
     *  no replies; once it exists only its author's Edit / Delete and Resolve / Reopen show. */
    this.mode = "thread";

    /** @type {CdxCommentAuthor} The current user: byline of new comments and the "own" check. */
    this.author = { name: "You" };

    /** @type {CdxThread[] | undefined} Set → controlled: the editor only projects it and reports
     *  every action as an event; assigning a new array is the host's answer. */
    this.comments = undefined;

    /** @type {CdxThread[]} Uncontrolled seed, read once. */
    this.defaultComments = [];

    /** @type {number} 0 = no limit. */
    this.maxLength = 2000;

    /** @type {((draft: CdxCommentDraft) => string | null | undefined | Promise<string | null | undefined>) | undefined}
     *  A returned string is shown as the field's error and stops the submit. */
    this.validate = undefined;

    /** @type {((context: CdxCanCommentContext) => boolean) | undefined} `false` hides the "+". */
    this.canComment = undefined;

    /** @type {((comment: CdxComment, thread: CdxThread) => boolean) | undefined} */
    this.canEdit = undefined;

    /** @type {((comment: CdxComment, thread: CdxThread) => boolean) | undefined} */
    this.canDelete = undefined;

    /** @type {((thread: CdxThread) => boolean) | undefined} */
    this.canResolve = undefined;

    /** @type {boolean} No Resolve / Reopen, in either mode (and no Resolve all in the bar). */
    this.noResolve = false;

    /** @type {boolean} Resolved threads start expanded instead of as a one-line row. */
    this.expandResolved = false;

    /** @type {((comment?: CdxComment) => string | null | undefined) | undefined} */
    this.getAuthor = undefined;

    /** @type {((comment?: CdxComment) => string | null | undefined) | undefined} Rendered with
     *  md-avatar; no URL → initials. */
    this.getAvatarUrl = undefined;

    /** @type {string} */
    this.submitLabel = LABELS.submit;
    /** @type {string} */
    this.replyLabel = LABELS.reply;
    /** @type {string} */
    this.saveLabel = LABELS.save;
    /** @type {string} */
    this.cancelLabel = LABELS.cancel;
    /** @type {string} */
    this.editLabel = LABELS.edit;
    /** @type {string} */
    this.deleteLabel = LABELS.delete;
    /** @type {string} */
    this.resolveLabel = LABELS.resolve;
    /** @type {string} */
    this.reopenLabel = LABELS.reopen;
    /** @type {string} */
    this.placeholder = LABELS.placeholder;
    /** @type {string} */
    this.replyPlaceholder = LABELS.replyPlaceholder;
  }

  /** Light DOM and nothing in it — this element only carries configuration. */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = "none";
  }

  /** @returns {CdxCommentsConfig} */
  get config() {
    const single = this.mode === "single";
    return {
      mode: single ? "single" : "thread",
      author: this.author,
      threads: this.comments,
      defaultThreads: this.defaultComments,
      maxLength: this.maxLength,
      validate: this.validate,
      canComment: this.canComment,
      canEdit: this.canEdit,
      canDelete: this.canDelete,
      canResolve: this.canResolve,
      resolvable: !this.noResolve,
      collapseResolved: !this.expandResolved,
      getAuthor: this.getAuthor,
      getAvatarUrl: this.getAvatarUrl,
      labels: {
        ...LABELS,
        submit: this.submitLabel,
        reply: this.replyLabel,
        save: this.saveLabel,
        cancel: this.cancelLabel,
        edit: this.editLabel,
        delete: this.deleteLabel,
        resolve: this.resolveLabel,
        reopen: this.reopenLabel,
        placeholder: this.placeholder,
        replyPlaceholder: this.replyPlaceholder,
      },
    };
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    super.updated(changed);
    this.dispatchEvent(new Event("cdx-comments-config", { bubbles: true }));
  }
}
