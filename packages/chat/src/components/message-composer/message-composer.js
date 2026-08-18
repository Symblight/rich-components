import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { when } from "lit/directives/when.js";

import { Editor } from "../../editor/Editor.js";

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
    commandFields: { attribute: false },
  };

  constructor() {
    super();

    /** @type {String} */
    this.value = "";

    /** @type {String} */
    this.label = "";

    /** @type {Boolean} */
    this.loading = false;

    /** @type {Map<Element, Element>} Set by chx-chat — see its handleCommandFieldSlotchange. */
    this.commandFields = new Map();

    /** @type {Editor | undefined} */
    this.editor = undefined;
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

  firstUpdated() {
    this.editor = new Editor(this.inputElement, {
      onChange: this.handleEditorChange,
      onSubmit: () => this.formElement?.requestSubmit(),
      getCommandFields: () => this.commandFields,
      onCommandSelected: (detail) => {
        this.dispatchEvent(
          new CustomEvent("chx-command-selected", { detail, bubbles: true, composed: true }),
        );
      },
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
    this.editor.view.dom.setAttribute("aria-label", this.label);
  }

  /** @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("label") && this.editor) {
      this.editor.view.dom.setAttribute("aria-label", this.label);
    }
  }

  /**
   * Forwarded from chx-chat's own insertAtCommand — see
   * Editor.resolveCommand for the actual insertion logic.
   * @param {string | null} target
   * @param {Node} node
   */
  insertAtCommand(target, node) {
    this.editor?.resolveCommand(target, node);
  }

  /**
   * @param {PointerEvent} event
   */
  handleComposerPointerdown = (event) => {
    const path = event.composedPath();
    const excludedElements = [this.attachElement, this.actionsElement, this.inputElement];
    if (excludedElements.some((element) => element && path.includes(element))) return;

    event.preventDefault();
    this.editor?.focusEnd();
  };

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

  /** @returns {HTMLFormElement} */
  get formElement() {
    return /** @type {HTMLFormElement} */ (
      this.renderRoot?.querySelector(".message-composer__form")
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
    if (!this.value || !this.editor) return;

    const value = this.editor.getValue();
    const html = this.editor.getHTML();
    this.editor.focus();
    this.clearValue();

    this.dispatchEvent(
      new CustomEvent("chx-send-message", {
        detail: { value, html },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Resets both the editor's document and `this.value` — they don't sync automatically. */
  clearValue() {
    this.editor?.clear();
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

  /**
   * Bound via Editor's onChange — fires on every doc-changing transaction,
   * direct replacement for the old native-`input`-event handleInput.
   * @param {{value: string, html: string}} detail
   */
  handleEditorChange = (detail) => {
    this.value = detail.value;
    this.textFieldElement.setValue(detail.value);

    this.dispatchEvent(
      new CustomEvent("change", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    return html`
      <slot name="leading"></slot>
      <form class="message-composer__form" @submit=${this.handleSend}>
        <md-text-field
          name="message"
          class="message-composer__input"
          placeholder="Put your text..."
          part="textbox"
        >
          <div slot="input" class="message-composer__input-content"></div>

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
    `;
  }
}
