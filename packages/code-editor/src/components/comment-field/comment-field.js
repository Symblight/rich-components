import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/text-field";

import { icon } from "../../core/icons.js";
import buttons from "../../styles/comment-buttons.css?inline";
import tokens from "../../styles/tokens.css?inline";
import styles from "./comment-field.css?inline";

/**
 * @typedef {import("../../features/comments/comments.js").CdxCommentLabels} CdxCommentLabels
 * @typedef {"new" | "reply" | "edit"} CdxCommentFieldKind
 */

/**
 * @tag cdx-comment-field
 * @summary Multi-line outlined comment field with counter and Cancel / Submit.
 */
@customElement("cdx-comment-field")
export class CdxCommentField extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    kind: { type: String, reflect: true },
    labels: { attribute: false },
    maxLength: { type: Number },
    text: { type: String },
    rev: { type: Number },
    sending: { type: Boolean, reflect: true },
    error: { type: String },
    idle: { type: Boolean, reflect: true },
    locked: { type: Boolean, reflect: true },
    _value: { state: true },
  };

  static styles = [tokens, buttons, styles];

  constructor() {
    super();

    /** @type {CdxCommentFieldKind} */
    this.kind = "new";

    /** @type {CdxCommentLabels | undefined} */
    this.labels = undefined;

    /** @type {number} */
    this.maxLength = 0;

    /** @type {string} Applied on creation and again whenever `rev` changes. */
    this.text = "";

    /** @type {number} */
    this.rev = 0;

    /** @type {boolean} */
    this.sending = false;

    /** @type {string} */
    this.error = "";

    /** @type {boolean} A reply at rest: one line, no hint or buttons, opens on focus. */
    this.idle = false;

    /** @type {boolean} Another field's submit is waiting for the host: read-only, doesn't open. */
    this.locked = false;

    this._value = "";
  }

  /** @param {import("lit").PropertyValues} changed */
  willUpdate(changed) {
    // back to idle = the draft closed; the reused element must drop what was typed
    if (changed.has("rev") || changed.has("text") || (changed.has("idle") && this.idle)) {
      this._value = this.text;
    }
  }

  async focus() {
    await this.updateComplete;
    const input = /** @type {HTMLElement & { updateComplete?: Promise<unknown> } | null} */ (
      this.renderRoot.querySelector("md-text-field")
    );
    await input?.updateComplete;
    input?.focus();
  }

  /** @param {string} action @param {object} [detail] */
  #emit(action, detail = {}) {
    this.dispatchEvent(
      new CustomEvent("cdx-comment-ui", {
        detail: { action, kind: this.kind, ...detail },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** @param {Event} event */
  #handleInput = (event) => {
    this._value = /** @type {HTMLInputElement} */ (event.target).value ?? "";
    this.#emit("field-input", { text: this._value });
  };

  #submit() {
    if (this.sending) return;
    this.#emit("field-submit", { text: this._value });
  }

  /** @param {string} reason */
  #cancel(reason) {
    this.#emit("field-cancel", { reason, hadDraft: this._value.trim() !== "" });
  }

  /** @param {KeyboardEvent} event */
  #handleKeydown = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.#submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.#cancel("escape");
    }
  };

  #handleFocus = () => {
    if (this.idle && !this.locked) this.#emit("field-open");
  };

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    // unlocked while it still has focus: focusin won't come again, so open now
    if (changed.get("locked") && !this.locked && this.idle && this.matches(":focus-within")) {
      this.#emit("field-open");
    }
  }

  get #label() {
    const labels = this.labels;
    if (!labels) return "";
    if (this.kind === "edit") return labels.editPlaceholder;
    if (this.kind === "reply") return labels.replyPlaceholder;
    return labels.placeholder;
  }

  get #submitLabel() {
    const labels = this.labels;
    if (!labels) return "";
    if (this.kind === "edit") return labels.save;
    return this.kind === "reply" ? labels.reply : labels.submit;
  }

  #renderSupport() {
    const over = this.maxLength > 0 && this._value.length > this.maxLength;
    return html`
      <div class="field__support" part="support">
        <span class="field__message" role=${this.error ? "alert" : "none"}>
          ${this.error ? icon("error") : nothing}${this.error || nothing}
        </span>
        ${
          this.maxLength > 0
            ? html`<span class="field__counter ${over ? "field__counter_over" : ""}"
                >${this._value.length} / ${this.maxLength}</span
              >`
            : nothing
        }
      </div>
    `;
  }

  #renderActions() {
    const labels = this.labels;
    if (!labels) return nothing;
    const empty = this._value.trim() === "";
    const over = this.maxLength > 0 && this._value.length > this.maxLength;
    return html`
      <div class="field__actions" part="actions">
        <button class="cbtn" type="button" part="cancel" @click=${() => this.#cancel("button")}>
          ${labels.cancel}
        </button>
        <button
          class="cbtn cbtn_filled"
          type="button"
          part="submit"
          ?disabled=${empty || over || this.sending}
          @click=${() => this.#submit()}
        >
          ${
            this.sending
              ? html`<span class="cbtn__spinner" aria-hidden="true"></span>${labels.sending}`
              : this.error && this.kind !== "edit"
                ? labels.retry
                : this.#submitLabel
          }
        </button>
      </div>
    `;
  }

  render() {
    return html`
      <div class="field" part="field" aria-busy=${String(this.sending)}>
        <md-text-field
          class="field__input"
          part="input"
          variant="outlined"
          multiline
          .label=${this.#label}
          .value=${this._value}
          .readOnly=${this.sending || this.locked}
          ?error=${!!this.error}
          @change=${this.#handleInput}
          @keydown=${this.#handleKeydown}
          @focusin=${this.#handleFocus}
        ></md-text-field>
        ${this.idle ? nothing : html`${this.#renderSupport()}${this.#renderActions()}`}
      </div>
    `;
  }
}
