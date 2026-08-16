import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { when } from "lit/directives/when.js";

import { ContentTextoFormatter } from "../../text-formatter/text-formatter.js";
import { MentionFieldController } from "../../controllers/MentionFieldController.js";

import styles from "./message-composer.css?inline";

import "@symblight/wc-material/text-field";
import "@symblight/wc-material/button";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";

import send from "@material-design-icons/svg/outlined/arrow_upward.svg?raw";

/**
 * @tag chx-message-composer
 * @summary  Message composer.
 *
 */
@customElement("chx-message-composer")
export class ChxMessageComposer extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    value: { type: String, state: true },
    loading: { type: Boolean, reflect: true, attribute: true },
    label: { type: String, attribute: true },
  };

  constructor() {
    super();

    /** @type {String} */
    this.value = "";

    /** @type {String} */
    this.label = "";

    /** @type {Boolean} */
    this.loading = false;

    /** @type {MentionFieldController} */
    this.mentionFieldController = new MentionFieldController(this);
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("pointerdown", this.handleComposerPointerdown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("pointerdown", this.handleComposerPointerdown);
  }

  /**
   * @param {PointerEvent} event
   */
  handleComposerPointerdown = (event) => {
    const path = event.composedPath();
    const excludedElements = [this.attachElement, this.actionsElement, this.inputElement];
    if (excludedElements.some((element) => element && path.includes(element))) return;

    event.preventDefault();
    this.inputElement.focus();
    this.moveCaretToEnd();
  };

  moveCaretToEnd() {
    const root = /** @type {ShadowRoot & {getSelection?: () => Selection | null}} */ (
      this.renderRoot
    );
    const selection = root.getSelection ? root.getSelection() : document.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(this.inputElement);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /** @returns {HTMLDivElement} */
  get inputElement() {
    return /** @type {HTMLDivElement} */ (
      this.renderRoot?.querySelector(".message-composer__input-content")
    );
  }

  /** @returns {HTMLElement} */
  get attachElement() {
    return /** @type {HTMLElement} */ (this.renderRoot?.querySelector(".message-composer__attach"));
  }

  /** @returns {HTMLElement} */
  get actionsElement() {
    return /** @type {HTMLElement} */ (
      this.renderRoot?.querySelector(".message-composer__actions")
    );
  }

  /** @returns {import("@symblight/wc-material/text-field").TextField} */
  get textFieldElement() {
    return /** @type {import("@symblight/wc-material/text-field").TextField} */ (
      this.renderRoot?.querySelector("md-text-field")
    );
  }

  /** @param {SubmitEvent} event */
  handleSend(event) {
    event.preventDefault();
    if (!this.value) return;

    const value = this.value;
    const html = this.inputElement.innerHTML;
    this.inputElement.focus();
    this.clearValue();

    this.dispatchEvent(
      new CustomEvent("sendMessage", {
        detail: { value, html },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Resets both the contenteditable DOM and `this.value` — they don't sync automatically. */
  clearValue() {
    this.inputElement.textContent = "";
    this.value = "";
    this.textFieldElement.setValue("");

    this.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** @param {KeyboardEvent} event */
  handleComposerKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    const form = /** @type {HTMLElement} */ (event.target).closest("form");
    form?.requestSubmit();
  }

  /**
   * @param {ClipboardEvent} event
   */
  handleComposerPaste(event) {
    event.preventDefault();

    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;

    const root = /** @type {ShadowRoot & {getSelection?: () => Selection | null}} */ (
      this.renderRoot
    );
    const selection = root.getSelection ? root.getSelection() : document.getSelection();
    if (!selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const fragment = document.createDocumentFragment();
    /** @type {Text | undefined} */
    let lastNode;
    text.split("\n").forEach((line, index) => {
      if (index > 0) fragment.appendChild(document.createElement("br"));
      lastNode = fragment.appendChild(document.createTextNode(line));
    });
    if (!lastNode) return;
    range.insertNode(fragment);

    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    this.inputElement.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  }

  handleInput() {
    const formatter = new ContentTextoFormatter(this.inputElement);
    const plainText = formatter.toPlainText();

    this.value = plainText;
    const html = this.inputElement.innerHTML;

    this.textFieldElement.setValue(plainText);

    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: plainText, html },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <slot name="leading"></slot>
      <form class="message-composer__form" @submit=${this.handleSend}>
        <md-text-field
          name="message"
          class="message-composer__input"
          placeholder="Put your text..."
          @input=${this.handleInput}
          part="textbox"
        >
          <div
            slot="input"
            role="textbox"
            dir="ltr"
            writingsuggestions="false"
            aria-multiline="true"
            contenteditable="true"
            class="message-composer__input-content"
            @keydown=${this.handleComposerKeydown}
            @paste=${this.handleComposerPaste}
            translate="no"
            tabindex="0"
            enterkeyhint="enter"
            aria-label=${this.label}
          ></div>

          <div slot="trailing" class="message-composer__actions-wrapper">
            <div class="message-composer__actions">
              <slot name="actions"></slot>
              ${when(
                this.value !== "" && !this.loading,
                () => html`
                  <md-icon-button
                    ?disabled=${this.value === "" || this.loading}
                    type="submit"
                    variant="filled"
                    selected
                  >
                    <md-icon> ${unsafeSVG(send)}</md-icon>
                  </md-icon-button>
                `,
              )}
              ${when(
                this.loading,
                () => html`
                  <md-icon-button type="submit" variant="tonal">
                    <slot name="flight-icon"></slot>
                  </md-icon-button>
                `,
              )}
            </div>
          </div>
        </md-text-field>
      </form>
      <slot
        name="mention-field"
        @slotchange=${this.mentionFieldController.handleConnectMentionField}
      ></slot>
    `;
  }
}
