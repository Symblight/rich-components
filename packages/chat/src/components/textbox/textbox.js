import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { when } from "lit/directives/when.js";
import { FormControlMixin, requiredValidator } from "@open-wc/form-control";

import { Editor } from "../../editor/Editor.js";

import tokens from "../../styles/tokens.css?inline";
import visuallyHidden from "../../styles/visually-hidden.css?inline";
import styles from "./textbox.css?inline";

import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";

import send from "@material-design-icons/svg/outlined/arrow_upward.svg?raw";
import stop from "@material-design-icons/svg/outlined/stop.svg?raw";

/**
 * @tag chx-textbox
 * @summary MD3 filled-field container that owns the ProseMirror `EditorView`
 * directly, configured via `placeholder`/`getTriggerFields` and reacting to
 * `chx-textbox-change`/`chx-command-selected`.
 * @fires chx-stop - fired by the action button while `loading`; chx-chat aborts the turn on it.
 */
@customElement("chx-textbox")
export class ChxTextbox extends FormControlMixin(LitElement) {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    name: { type: String, attribute: true },
    required: { type: Boolean, attribute: true, reflect: true },
    placeholder: { type: String, attribute: true },
    dropHint: { type: String, attribute: "drop-hint" },
    dragging: { type: Boolean, reflect: true, attribute: true },
    getTriggerFields: { attribute: false },
    getExtensions: { attribute: false },
    loading: { type: Boolean, reflect: true, attribute: true },
    disabled: { type: Boolean, reflect: true, attribute: true },
    compact: { type: Boolean, reflect: true, attribute: true },
    sendLabel: { type: String, attribute: "send-label" },
    stopLabel: { type: String, attribute: "stop-label" },
    simplified: { state: true },
    value: { state: true },
  };

  /** @type {ShadowRootInit} */
  static shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static formControlValidators = [requiredValidator];

  constructor() {
    super();

    this.name = "";
    this.required = false;

    /** @type {String} Applied as the editor's aria-label too — see #mountEditor/updated. */
    this.placeholder = "";

    /** @type {String} Shown in place of the placeholder while an OS file drag is over the field. */
    this.dropHint = "Release to attach";

    /** @type {boolean} Pushed down by chx-message-composer — driven by chx-chat's DropTargetController. */
    this.dragging = false;

    /** @type {() => Map<string, Element>} */
    this.getTriggerFields = () => new Map();
    /** @type {() => import("../../editor/extension.js").EditorExtension[]} */
    this.getExtensions = () => [];

    /** @type {Editor | undefined} */
    this.editor = undefined;

    /** @type {ResizeObserver | undefined} Watches the role="textbox" div — see handleTextboxResize. */
    this.textboxObserver = undefined;

    /** @type {boolean} False once Shift-Enter has split the doc and there's still content. */
    this.simplified = true;

    /** @type {Boolean} */
    this.loading = false;

    /** @type {String} The action button's accessible name while it sends. */
    this.sendLabel = "Send";

    /** @type {String} The action button's accessible name while a turn is in flight. */
    this.stopLabel = "Stop";

    /** @type {Boolean} Pushed down from chx-message-composer — empty state: blocks send + makes the editor read-only. */
    this.disabled = false;

    /** @type {boolean} Set by chx-message-composer — MD3 density −2 sizing, CSS-only. */
    this.compact = false;

    /** @type {String} Mirrors the editor's live value — drives the submit button's visibility. */
    this.value = "";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, visuallyHidden, styles];
  }

  /** The ProseMirror mount div — see the class doc comment. @returns {HTMLElement} */
  get inputElement() {
    return /** @type {HTMLElement} */ (this.renderRoot?.querySelector(".textbox__content"));
  }

  /** Anchor for ElementInternals' constraint-validation UI — see FormControlMixin. */
  get validationTarget() {
    return this.inputElement;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("pointerdown", this.handlePointerdown);
    // Re-entering the DOM after a disconnect (which destroyed the view) — remount.
    if (this.hasUpdated && !this.editor) this.#mountEditor();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("pointerdown", this.handlePointerdown);
    this.textboxObserver?.disconnect();
    this.textboxObserver = undefined;
    // EditorView holds document-level listeners — without destroy() a discarded
    // textbox stays reachable from the document and leaks.
    this.editor?.destroy();
    this.editor = undefined;
  }

  firstUpdated() {
    this.#mountEditor();
  }

  #mountEditor() {
    this.editor = new Editor(this.inputElement, {
      onChange: this.handleEditorChange,
      onSubmit: () => {
        if (this.disabled) return; // empty state — no active conversation to send into
        this.closest("form")?.requestSubmit();
      },
      getCommandFields: () => this.getTriggerFields(),
      getExtensions: () => this.getExtensions(),
      onCommandSelected: this.handleCommandSelected,
      placeholder: this.placeholder,
      attributes: {
        role: "textbox",
        dir: "ltr",
        writingsuggestions: "false",
        "aria-multiline": "true",
        translate: "no",
        tabindex: "0",
        enterkeyhint: "enter",
        autocorrect: "off",
      },
    });
    this.editor.view.dom.setAttribute("aria-label", this.placeholder);
    if (this.disabled) this.editor.setEditable(false); // disabled set before the editor mounted
    // Restore the draft across a disconnect/reconnect (e.g. the element being moved).
    if (this.value) this.editor.setText(this.value);

    this.textboxObserver = new ResizeObserver(this.handleTextboxResize);
    this.textboxObserver.observe(this.editor.view.dom);
  }

  /** @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("placeholder") && this.editor) {
      this.editor.view.dom.setAttribute("aria-label", this.placeholder);
    }
    if (changedProperties.has("disabled") && this.editor) {
      this.editor.setEditable(!this.disabled);
    }
  }

  /** FormControlMixin's formResetCallback hook. */
  resetFormControl() {
    this.clear();
  }

  /** @returns {string} */
  getValue() {
    return this.editor?.getValue() ?? "";
  }

  /** @returns {string} */
  getHTML() {
    return this.editor?.getHTML() ?? "";
  }

  focus() {
    this.editor?.focus();
  }

  focusEnd() {
    this.editor?.focusEnd();
  }

  /** Clears both the editor's document and the form value — used on send/reset. */
  clear() {
    this.editor?.clear();
    this.setValue("");
    this.simplified = true;
    this.value = "";
  }

  /**
   * Replaces the editor's document with plain text — named `setText`, not
   * `setValue`, to avoid colliding with FormControlMixin's own inherited
   * `setValue(value)` (sets the *form-associated* value/runs validators,
   * never touches the visible document — calling it directly would silently
   * desync the form value from what's actually shown).
   * @param {string} text
   */
  setText(text) {
    this.editor?.setText(text);
    this.setValue(text);
    this.value = text;
  }

  /** Inserts a chip at the caret — see Editor.insertChip. @param {Node} node */
  insertChip(node) {
    this.editor?.insertChip(node);
  }

  /**
   * Replaces the tracked command range `target` with `node` — see Editor.resolveCommand.
   * @param {string | null} target
   * @param {Node} node
   */
  insertAtRange(target, node) {
    this.editor?.resolveCommand(target, node);
  }

  /**
   * Bound via Editor's onChange — fires on every doc-changing transaction.
   * Keeps the form value in sync directly (the caller no longer has to).
   * @param {{value: string, html: string}} detail
   */
  handleEditorChange = (detail) => {
    this.setValue(detail.value);
    this.value = detail.value;
    if (detail.value === "") this.simplified = true;
    this.dispatchEvent(
      new CustomEvent("chx-textbox-change", { detail, bubbles: true, composed: true }),
    );
  };

  /**
   * initialHeight/lastHeight/isHandling live in this closure rather than
   * on `this` — private to the handler, not part of the component's
   * observable state. First call seeds initialHeight (ResizeObserver
   * always fires once immediately on observe(), with the current size —
   * not a real change). isHandling guards against reentrancy: a resize
   * triggered synchronously from inside this callback (e.g. by
   * console.log side effects growing later, or future DOM writes) would
   * otherwise risk the "ResizeObserver loop" browser warning/recursion.
   */
  handleTextboxResize = (() => {
    /** @type {number | undefined} */
    let initialHeight;
    /** @type {number | undefined} */
    let lastHeight;
    let isHandling = false;
    /** @type {ResizeObserverCallback} */
    return ([entry]) => {
      if (!entry || isHandling) return;
      isHandling = true;
      try {
        const height = entry.contentRect.height;
        if (initialHeight === undefined || lastHeight === undefined) {
          initialHeight = height;
          lastHeight = height;
          return;
        }
        const grew = height > initialHeight && lastHeight <= initialHeight;
        const backToInitial =
          height <= initialHeight && lastHeight > initialHeight && this.value === "";
        if (grew) this.simplified = false;
        if (backToInitial) this.simplified = true;
        lastHeight = height;
      } finally {
        isHandling = false;
      }
    };
  })();

  /** @param {{target: string | null, id: string | undefined}} detail */
  handleCommandSelected = (detail) => {
    this.dispatchEvent(
      new CustomEvent("chx-command-selected", { detail, bubbles: true, composed: true }),
    );
  };

  /**
   * Clicking empty padding inside the field should focus the input, caret
   * landing at the end of the document — same exclusion-list pattern
   * `chx-message-composer` used to run itself against `md-text-field`, just
   * generalized to whatever's slotted into `leading`/`attachments`/`trailing` now.
   * @param {PointerEvent} event
   */
  handlePointerdown = (event) => {
    const path = event.composedPath();
    /** @param {string} name */
    const slotted = (name) =>
      /** @type {HTMLSlotElement | null} */ (
        this.renderRoot?.querySelector(`slot[name="${name}"]`)
      )?.assignedElements({ flatten: true }) ?? [];
    const excludedElements = [
      ...slotted("leading"),
      ...slotted("attachments"),
      ...slotted("trailing"),
      this.inputElement,
    ];
    if (excludedElements.some((element) => element && path.includes(element))) return;

    event.preventDefault();
    this.focusEnd();
  };

  /**
   * One button, two roles. Sending rides the form's own submit; stopping must not — it dispatches
   * `chx-stop` for chx-chat to act on (`stop()`), and preventDefault backs up `type="button"` in
   * case a host form still tries to submit.
   * @param {MouseEvent} event
   */
  handleActionClick = (event) => {
    if (!this.loading) return;
    event.preventDefault();
    this.dispatchEvent(new CustomEvent("chx-stop", { bubbles: true, composed: true }));
  };

  render() {
    return html`
            <div class=${classMap({ textbox: true, textbox_dragging: this.dragging })} part="box">
                ${when(
                  this.dragging,
                  () => html`
                    <div class="textbox__drop-hint" part="drop-hint">${this.dropHint}</div>
                  `,
                )}
                <div class="textbox__container">
                    <div
                            class=${classMap({
                              textbox__row: !this.simplified,
                              textbox__row_simplified: this.simplified,
                            })}
                            part="row"
                    >
                        <div class="textbox__box">
                            <div class="textbox__content" part="content"></div>
                        </div>
                        <div class="textbox__attachments" part="attachments">
                            <slot name="attachments"></slot>
                        </div>
                        <div class="textbox__leading" part="leading">
                            <slot name="leading"></slot>
                        </div>
                        <div class="textbox__trailing" part="trailing">
                            <slot name="trailing"></slot>
                            ${when(
                              this.loading || (this.value !== "" && !this.disabled),
                              () => html`
                                <md-icon-button
                                  class="textbox__submit"
                                  part="action"
                                  type=${this.loading ? "button" : "submit"}
                                  .form=${this.closest("form")}
                                  variant=${this.loading ? "tonal" : "filled"}
                                  ?selected=${!this.loading}
                                  @click=${this.handleActionClick}
                                >
                                  ${
                                    this.loading
                                      ? html`<slot name="stop"
                                          ><md-icon>${unsafeSVG(stop)}</md-icon></slot
                                        >`
                                      : html`<md-icon>${unsafeSVG(send)}</md-icon>`
                                  }
                                  <!-- md-icon-button slots its children inside the real <button>,
                                       so this is the accessible name; an aria-label on the host
                                       would never reach it. -->
                                  <span class="visually-hidden"
                                    >${this.loading ? this.stopLabel : this.sendLabel}</span
                                  >
                                </md-icon-button>
                              `,
                            )}
                        </div>
                    </div>
                </div>
            </div>
            </div>
        `;
  }
}
