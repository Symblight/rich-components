import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { Compartment, EditorState } from "@codemirror/state";

import "../go-to-line/go-to-line.js";
import "../problems-indicator/problems-indicator.js";
import "../quick-fix/quick-fix.js";
import "../../features/diff/diff.js";
import "../review-bar/review-bar.js";
import "../status-bar/status-bar.js";
import "../comments-nav/comments-nav.js";
import "../../features/footer/footer.js";
import "../../features/comments/comments.js";
import "../../features/comments/comments-bar.js";
import commentsStyles from "../../features/comments/comments.css?inline";
import footerStyles from "../../features/footer/footer.css?inline";
import diffStyles from "../../features/diff/diff.css?inline";
import { baseSetup } from "../../core/setup.js";
import { ALL, ConfigController } from "../../controllers/ConfigController.js";
import { ContextMenuController } from "../../controllers/ContextMenuController.js";
import { DiagnosticsController } from "../../controllers/DiagnosticsController.js";
import { FooterController } from "../../features/footer/FooterController.js";
import { CommentsController } from "../../features/comments/CommentsController.js";
import { DiffController } from "../../features/diff/DiffController.js";
import { EditorViewController } from "../../controllers/EditorViewController.js";
import { GoToLineController } from "../../controllers/GoToLineController.js";
import { LanguageController } from "../../controllers/LanguageController.js";
import { QuickFixController } from "../../controllers/QuickFixController.js";
import { SelectionController } from "../../controllers/SelectionController.js";
import { SymbolsController } from "../../controllers/SymbolsController.js";
import { ValueController } from "../../controllers/ValueController.js";
import tokens from "../../styles/tokens.css?inline";
import styles from "./code-editor.css?inline";

/**
 * @typedef {import("../../controllers/ValueController.js").CdxChangeDetail} CdxChangeDetail
 * @typedef {import("../../controllers/SelectionController.js").CdxSelectionChangeDetail} CdxSelectionChangeDetail
 * @typedef {import("../../controllers/ContextMenuController.js").CdxContextMenuDetail} CdxContextMenuDetail
 * @typedef {import("../../features/diff/DiffController.js").CdxReviewBaseChangeDetail} CdxReviewBaseChangeDetail
 * @typedef {import("../../features/diff/DiffController.js").CdxDiffStats} CdxDiffStats
 * @typedef {import("../../features/diff/shared.js").CdxChunkModel} CdxChunkModel
 * @typedef {import("../../controllers/SymbolsController.js").CdxSymbolsChangeDetail} CdxSymbolsChangeDetail
 * @typedef {import("../../controllers/ValueController.js").CdxBeforeChangeDetail} CdxBeforeChangeDetail
 * @typedef {{
 *   filename?: string,
 *   language?: string,
 *   baseline?: string | null,
 *   reviewBase?: string | null,
 *   extensions?: import("@codemirror/state").Extension,
 * }} CdxStateOptions
 * Per-document settings for `createState` — the rest (features, plugins, readOnly…) is the
 * editor's and applies to every tab.
 */

/**
 * @tag cdx-code-editor
 * @summary Material Design 3 code editor.
 */
@customElement("cdx-code-editor")
export class CdxCodeEditor extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    defaultValue: { type: String, attribute: "default-value" },
    language: { type: String },
    filename: { type: String },
    plugins: { attribute: false },
    readOnly: { type: Boolean, attribute: "read-only", reflect: true },
    placeholder: { type: String },
    label: { type: String },
    extensions: { attribute: false },
    noLineNumbers: { type: Boolean, attribute: "no-line-numbers" },
    noFolding: { type: Boolean, attribute: "no-folding" },
    noActiveLine: { type: Boolean, attribute: "no-active-line" },
    noBracketMatching: { type: Boolean, attribute: "no-bracket-matching" },
    noIndentGuides: { type: Boolean, attribute: "no-indent-guides" },
    noAutocomplete: { type: Boolean, attribute: "no-autocomplete" },
    noSearch: { type: Boolean, attribute: "no-search" },
    wrap: { type: Boolean, reflect: true },
    tabSize: { type: Number, attribute: "tab-size" },
    density: { type: String, reflect: true },
    diagnostics: { attribute: false },
    baseline: { attribute: false },
    reviewBase: { attribute: false },
  };

  static styles = [tokens, styles, diffStyles, footerStyles, commentsStyles];

  /** Per-document extensions from `createState`, e.g. an LSP binding for that file's URI. */
  #documentExtensions = new Compartment();

  /** @type {EditorViewController} */
  #editor = new EditorViewController(this, {
    getParent: () =>
      /** @type {HTMLElement} */ (this.renderRoot.querySelector(".code-editor__view")),
  });
  /** @type {ValueController} */
  #value = new ValueController(this, this.#editor, { getDefaultValue: () => this.defaultValue });
  /** @type {SelectionController} */
  #selection = new SelectionController(this, this.#editor);
  /** @type {ConfigController} */
  #config = new ConfigController(this, this.#editor);
  /** @type {LanguageController} */
  #language = new LanguageController(this, this.#editor);
  /** @type {DiagnosticsController} */
  #diagnostics = new DiagnosticsController(this, this.#editor);
  /** @type {DiffController} */
  #diff = new DiffController(this, this.#editor);
  /** @type {CommentsController} */
  #comments = new CommentsController(this, this.#editor);
  /** @type {SymbolsController} */
  #symbols = new SymbolsController(this, this.#editor);
  /** @type {GoToLineController} */
  #goToLine = new GoToLineController(this, this.#editor, {
    focusCard: () =>
      /** @type {import("../go-to-line/go-to-line.js").CdxGoToLine | null} */ (
        this.renderRoot.querySelector("cdx-go-to-line")
      )?.focusInput(),
  });
  /** @type {FooterController} */
  #footer = new FooterController(this, this.#editor, {
    symbols: () => ({ path: this.#symbols.path, outline: this.#symbols.outline }),
    diff: () => this.#diff.baselineStatus,
    language: () => this.#language.active?.name ?? "Plain text",
  });
  /** @type {QuickFixController} */
  #quickFix = new QuickFixController(this, {
    getContainer: () => this.renderRoot.querySelector(".code-editor__body"),
    open: () => this.#openQuickFix(),
  });

  constructor() {
    super();

    new ContextMenuController(this, this.#editor);

    /** @type {string} Initial document; ignored once the editor has mounted. */
    this.defaultValue = "";

    /** @type {string} Name or alias of a plugin language, e.g. `"rust"`. Wins over `filename`. */
    this.language = "";

    /** @type {string} Picks the plugin language by extension when `language` is empty. */
    this.filename = "";

    /** @type {import("../../core/plugin.js").CdxPlugin[]} The editor knows no language on its own. */
    this.plugins = [];

    /** @type {boolean} */
    this.readOnly = false;

    /** @type {string} */
    this.placeholder = "";

    /** @type {string} Accessible name of the editing surface. */
    this.label = "";

    /** @type {import("@codemirror/state").Extension} Appended after the built-in ones. */
    this.extensions = [];

    /** @type {boolean} */
    this.noLineNumbers = false;

    /** @type {boolean} */
    this.noFolding = false;

    /** @type {boolean} */
    this.noActiveLine = false;

    /** @type {boolean} */
    this.noBracketMatching = false;

    /** @type {boolean} */
    this.noIndentGuides = false;

    /** @type {boolean} */
    this.noAutocomplete = false;

    /** @type {boolean} Find/replace panel (Mod-F) and matching-selection highlights. */
    this.noSearch = false;

    /** @type {boolean} Soft-wraps long lines instead of scrolling horizontally. */
    this.wrap = false;

    /** @type {number} Display width of a tab character. */
    this.tabSize = 4;

    /** @type {"default" | "compact"} Compact is 12/18 text instead of 13/20. */
    this.density = "default";

    /** @type {import("@codemirror/lint").Diagnostic[] | null} Pushed from outside, e.g. an LSP;
     *  `null` leaves diagnostics to plugin linters. Out-of-range entries are dropped. */
    this.diagnostics = null;

    /** @type {string | null} What the file is compared against — HEAD, typically: change marks in
     *  the gutter, a chunk opens on a mark click. Styled by `<cdx-diff kind="baseline">`. */
    this.baseline = null;

    /** @type {string | null} The text before proposed edits (an agent's, a reviewer's): the
     *  difference to the current text is shown inline, chunk by chunk, with Accept / Reject.
     *  Styled by `<cdx-diff kind="review">`. */
    this.reviewBase = null;
  }

  /** Setting it makes the editor controlled — see ValueController. */
  get value() {
    return this.#value.value;
  }

  set value(next) {
    this.#value.value = next;
  }

  get view() {
    return this.#editor.view;
  }

  get state() {
    return this.#editor.state;
  }

  /** Switches documents — a tab change — keeping each one's text, undo history, language,
   *  baseline/review and diagnostics. The editor's own settings are re-applied, so a tab made before
   *  a settings change still matches. Only states from this element's `createState` are accepted.
   *  Update `filename`/`language`/`baseline`/`reviewBase` for the new document afterwards if you
   *  drive them.
   * @param {EditorState | undefined} next */
  set state(next) {
    if (!next || next === this.#editor.state) return;
    if (!this.#config.owns(next)) {
      throw new Error("cdx-code-editor: `state` must come from this element's createState()");
    }
    const effects = [
      ...this.#config.effects(ALL),
      ...this.#language.pluginEffects(),
      ...this.#comments.effectsFor(),
    ];
    this.#editor.replaceState(next.update({ effects }).state);
  }

  /** A document ready to be swapped in through `state`, grammar already loaded so it shows
   *  highlighted immediately. Keep one per open tab.
   * @param {string} doc @param {CdxStateOptions} [options] @returns {Promise<EditorState>} */
  async createState(doc, options = {}) {
    const {
      filename = "",
      language = "",
      baseline = null,
      reviewBase = null,
      extensions = [],
    } = options;
    const state = EditorState.create({ doc, extensions: this.#extensions() });
    const effects = [
      ...this.#config.effects(ALL),
      ...this.#language.pluginEffects(),
      ...this.#comments.effectsFor(),
      await this.#language.effectFor({ language, filename }),
      ...this.#diff.effectsFor({ baseline, reviewBase }),
      this.#documentExtensions.reconfigure(extensions),
    ];
    return state.update({ effects }).state;
  }

  /** The language resolved from `language`/`filename`, once it has loaded. */
  get activeLanguage() {
    return this.#language.active;
  }

  /** The document outline, outermost symbols first — from the syntax tree, or a plugin's
   *  `symbolProvider`. Rebuilt shortly after edits. */
  get outline() {
    return this.#symbols.outline;
  }

  /** Symbols enclosing the caret, outermost first — what breadcrumbs show. */
  get symbolPath() {
    return this.#symbols.path;
  }

  /** Diff numbers for a status bar ("+4 −2 vs HEAD") — also sent as `cdx-diff-change`. */
  get diffStats() {
    return this.#diff.stats;
  }

  /** Accepts every pending proposal into `reviewBase`. */
  acceptAllChanges() {
    return this.#diff.acceptAll();
  }

  /** Reverts every pending proposal. */
  rejectAllChanges() {
    return this.#diff.rejectAll();
  }

  /** Next change (F7): pending proposals first, then baseline chunks. */
  nextChange() {
    return this.#diff.navigate(1);
  }

  /** Previous change (Shift-F7). */
  previousChange() {
    return this.#diff.navigate(-1);
  }

  /** Opens the comment field at a line — a new thread, or a reply when one lives there (with
   *  `newThread`, another thread on that line, `thread` mode). Returns the thread id, or null when
   *  `cdx-comment-open` was cancelled or comments are off.
   * @param {number} line
   * @param {{ range?: import("../../features/comments/shared.js").CdxCommentRange | null, newThread?: boolean }} [options] */
  openComment(line, options) {
    return this.#comments.openComment(line, options);
  }

  /** @returns {import("../../features/comments/shared.js").CdxThread[]} */
  getComments() {
    return this.#comments.getComments();
  }

  /** Adds a comment thread, or replaces the one with its id (uncontrolled).
   * @param {import("../../features/comments/shared.js").CdxThread} thread */
  addComment(thread) {
    this.#comments.addComment(thread);
  }

  /** The host saved a submitted comment; server `id`/`author`/`createdAt` may come along, and
   *  `options.threadId` gives a new thread its server id (uncontrolled).
   * @param {string} threadId @param {Partial<import("../../features/comments/shared.js").CdxComment>} [comment]
   * @param {{ threadId?: string }} [options] */
  resolveSubmit(threadId, comment, options) {
    this.#comments.resolveSubmit(threadId, comment, options);
  }

  /** @param {string} threadId @param {string} message */
  rejectSubmit(threadId, message) {
    this.#comments.rejectSubmit(threadId, message);
  }

  /** @param {string} threadId @param {string} text */
  setDraft(threadId, text) {
    this.#comments.setDraft(threadId, text);
  }

  /** Answers a cancelled `cdx-comment-resolve` (or, uncontrolled, resolves directly).
   * @param {string} threadId @param {boolean} [resolved] */
  resolveComment(threadId, resolved) {
    this.#comments.resolveComment(threadId, resolved);
  }

  /** Answers a cancelled `cdx-comment-delete` (or, uncontrolled, deletes directly).
   * @param {string} threadId @param {string} commentId */
  deleteComment(threadId, commentId) {
    this.#comments.deleteComment(threadId, commentId);
  }

  /** A resolve or delete failed: the thread stops waiting and shows `message`.
   * @param {string} threadId @param {string} message */
  rejectComment(threadId, message) {
    this.#comments.rejectComment(threadId, message);
  }

  /** Resolves (`false`: reopens) every thread — one `cdx-comment-resolve` each.
   * @param {boolean} [resolved] */
  resolveAll(resolved) {
    this.#comments.resolveAll(resolved);
  }

  /** Removes every comment, or with `id` one comment (its thread goes with its last) — or the
   *  thread with that id. No events, no permission hooks (uncontrolled).
   * @param {string} [id] */
  clearComments(id) {
    this.#comments.clearComments(id);
  }

  /** Opens the "Go to line" card (also Ctrl-G). */
  openGoToLine() {
    this.#goToLine.show();
  }

  /** @param {FocusOptions} [options] */
  focus(options) {
    if (this.#editor.view) this.#editor.focus();
    else super.focus(options);
  }

  /** @param {number} anchor @param {number} [head] */
  setSelection(anchor, head) {
    this.#selection.setSelection(anchor, head);
  }

  firstUpdated() {
    this.#editor.mount(
      EditorState.create({ doc: this.#value.takeInitialDoc(), extensions: this.#extensions() }),
    );
  }

  /** Every state this element creates carries the same compartments, which is what lets `state`
   *  swap them. Order matters: change markers left of line numbers, consumer extensions last. */
  #extensions() {
    return [
      baseSetup(),
      this.#value.extension,
      this.#comments.extension,
      this.#diff.extension,
      this.#quickFix.extension,
      this.#goToLine.extension,
      this.#language.extension,
      this.#documentExtensions.of([]),
      this.#config.extension,
    ];
  }

  /** @param {import("lit").PropertyValues<this>} changed */
  updated(changed) {
    this.#diff.update(changed);
    this.#config.update(changed);
    this.#language.update(changed);
    this.#diagnostics.update(changed);
  }

  /** @param {Event} event */
  handleDiffSlotchange = (event) => {
    this.#diff.handleSlotchange(/** @type {HTMLSlotElement} */ (event.target));
  };

  /** @param {CustomEvent<{ action: import("../review-bar/review-bar.js").CdxReviewBarAction }>} event */
  handleReviewBarAction = (event) => {
    const actions = {
      "accept-all": () => this.#diff.acceptAll(),
      "reject-all": () => this.#diff.rejectAll(),
      previous: () => this.#diff.navigate(-1),
      next: () => this.#diff.navigate(1),
      dismiss: () => this.#diff.dismissReview(),
    };
    actions[event.detail.action]();
  };

  /** @param {Event} event */
  handleCommentsSlotchange = (event) => {
    this.#comments.handleSlotchange(/** @type {HTMLSlotElement} */ (event.target));
  };

  /** @param {Event} event */
  handleCommentsBarSlotchange = (event) => {
    this.#comments.handleBarSlotchange(/** @type {HTMLSlotElement} */ (event.target));
  };

  /** @param {CustomEvent<{ action: "previous" | "next" | "resolve-all" }>} event */
  handleCommentsNavAction = (event) => {
    this.#comments.handleBarAction(event.detail);
  };

  /** @param {Event} event */
  handleFooterSlotchange = (event) => {
    this.#footer.handleSlotchange(/** @type {HTMLSlotElement} */ (event.target));
  };

  /** Editor actions are handled here; file-level ones (path, language, encoding…) go to the
   *  consumer as `cdx-status-click`, since only it knows what they open.
   * @param {CustomEvent<import("../status-bar/status-bar.js").CdxStatusBarAction>} event */
  handleStatusBarAction = (event) => {
    const { action, index, symbol } = event.detail;
    if (action === "go-to-line") this.openGoToLine();
    else if (action === "toggle-diff") this.#diff.toggleBaselineExpanded();
    else if (action === "symbol" && symbol) {
      this.setSelection(symbol.from);
      this.focus();
    } else {
      this.dispatchEvent(
        new CustomEvent("cdx-status-click", {
          detail: { item: action, index },
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  #renderStatusBar() {
    const model = this.#footer.model;
    if (!model) return nothing;
    return html`
      <cdx-status-bar
        part="footer"
        exportparts="bar: status-bar, crumbs: status-crumbs, crumb: status-crumb, crumb-current: status-crumb-current, separator: status-separator, items: status-items, position: status-position, selection: status-selection, diff: status-diff, encoding: status-encoding, language: status-language, environment: status-environment"
        .model=${model}
        @cdx-status-bar-action=${this.handleStatusBarAction}
        ><slot name="status" slot="status"></slot
      ></cdx-status-bar>
    `;
  }

  handleProblemsClick = () => {
    this.#diagnostics.goToFirst();
  };

  async #openQuickFix() {
    await this.updateComplete;
    const quickFix = /** @type {import("../quick-fix/quick-fix.js").CdxQuickFix | null} */ (
      this.renderRoot.querySelector("cdx-quick-fix")
    );
    quickFix?.open();
  }

  /** @param {CustomEvent<import("../quick-fix/quick-fix.js").CdxQuickFixApplyDetail>} event */
  handleQuickFixApply = (event) => {
    this.#quickFix.apply(this.#editor.view, event.detail.problem, event.detail.index);
  };

  handleQuickFixDismiss = () => {
    this.focus();
  };

  /** @param {CustomEvent<import("../go-to-line/go-to-line.js").CdxGoToLineSubmitDetail>} event */
  handleGoToSubmit = (event) => {
    this.#goToLine.go(event.detail.value);
  };

  /** @param {CustomEvent<import("../go-to-line/go-to-line.js").CdxGoToLineCancelDetail>} event */
  handleGoToCancel = (event) => {
    this.#goToLine.hide(event.detail.refocus);
  };

  #renderReviewBar() {
    const bar = this.#diff.reviewBar;
    if (!bar) return nothing;
    return html`
      <cdx-review-bar
        part="review"
        exportparts="bar: review-bar, done: review-done, avatar: review-avatar, icon: review-icon, label: review-label, count: review-count, nav: review-nav, previous: review-previous, position: review-position, next: review-next, reject-all: review-reject-all, accept-all: review-accept-all, dismiss: review-dismiss"
        tone=${bar.complete ? "neutral" : bar.config.tone}
        ?complete=${bar.complete}
        .config=${bar.config}
        .stats=${bar.stats}
        @cdx-review-bar-action=${this.handleReviewBarAction}
      ></cdx-review-bar>
    `;
  }

  /** Hidden while nothing reports diagnostics; a consumer passing `diagnostics` gets the clean
   *  checkmark too, since an empty list from them means "checked, no problems". */
  #renderProblems() {
    const { errors, warnings, others } = this.#diagnostics.counts;
    if (!errors && !warnings && !others && this.diagnostics === null) return nothing;
    return html`
      <cdx-problems-indicator
        part="problems"
        exportparts="button: problems-button"
        .errors=${errors}
        .warnings=${warnings}
        .others=${others}
        @click=${this.handleProblemsClick}
      ></cdx-problems-indicator>
    `;
  }

  #renderQuickFix() {
    const bulb = this.#quickFix.bulb;
    if (!bulb) return nothing;
    return html`
      <cdx-quick-fix
        part="quick-fix"
        exportparts="bulb: quick-fix-bulb, menu: quick-fix-menu"
        style=${styleMap({ top: `${bulb.top}px`, left: `${bulb.left}px` })}
        .problems=${bulb.problems}
        @cdx-quick-fix-apply=${this.handleQuickFixApply}
        @cdx-quick-fix-dismiss=${this.handleQuickFixDismiss}
      ></cdx-quick-fix>
    `;
  }

  #renderCommentsBar() {
    const bar = this.#comments.bar;
    if (!bar) return nothing;
    return html`
      <cdx-comments-nav
        part="comments-bar-host"
        exportparts="bar: comments-bar, nav: comments-bar-nav, count: comments-bar-count, action: comments-bar-action"
        .config=${bar.config}
        .model=${bar.model}
        @cdx-comments-nav-action=${this.handleCommentsNavAction}
      ></cdx-comments-nav>
    `;
  }

  #renderGoToLine() {
    if (!this.#goToLine.open) return nothing;
    return html`
      <cdx-go-to-line
        part="go-to-line"
        exportparts="card: go-to-line-card, input: go-to-line-input"
        .lineCount=${this.#goToLine.lineCount}
        .position=${this.#goToLine.position}
        ?invalid=${this.#goToLine.invalid}
        @cdx-go-to-line-submit=${this.handleGoToSubmit}
        @cdx-go-to-line-cancel=${this.handleGoToCancel}
      ></cdx-go-to-line>
    `;
  }

  render() {
    return html`
      <slot name="diff" hidden @slotchange=${this.handleDiffSlotchange}></slot>
      <slot name="footer" hidden @slotchange=${this.handleFooterSlotchange}></slot>
      <slot name="comments" hidden @slotchange=${this.handleCommentsSlotchange}></slot>
      <slot name="comments-bar" hidden @slotchange=${this.handleCommentsBarSlotchange}></slot>
      <div class="code-editor" part="container">
        ${this.#renderReviewBar()}
        <div class="code-editor__body">
          <div class="code-editor__view"></div>
          ${this.#renderProblems()} ${this.#renderQuickFix()} ${this.#renderGoToLine()}
          ${this.#renderCommentsBar()}
        </div>
        ${this.#renderStatusBar()}
      </div>
    `;
  }
}
