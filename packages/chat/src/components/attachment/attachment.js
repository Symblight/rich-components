import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import tokens from "../../styles/tokens.css?inline";
import styles from "./attachment.css?inline";

import "@symblight/wc-material/card";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/progress-circular";
import "@symblight/wc-material/tooltip";

import description from "@material-design-icons/svg/outlined/description.svg?raw";
import close from "@material-design-icons/svg/outlined/close.svg?raw";
import errorOutline from "@material-design-icons/svg/outlined/error_outline.svg?raw";

/**
 * @tag chx-attachment
 * @summary One attached-file card — icon or image preview, name, and a hover-revealed remove action.
 * Always backed by a real `File` via `.file`.
 */
@customElement("chx-attachment")
export class ChxAttachment extends LitElement {
  #contentId = `chx-attachment-content-${crypto.randomUUID()}`;
  #removeId = `chx-attachment-remove-${crypto.randomUUID()}`;

  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    file: { attribute: false },
    loading: { type: Boolean, reflect: true, attribute: true },
    loadingLabel: { type: String, attribute: "loading-label" },
    error: { type: Boolean, reflect: true, attribute: true },
    errorLabel: { type: String, attribute: "error-label" },
    removable: { type: Boolean, reflect: true, attribute: true },
    imageUrl: { state: true },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  constructor() {
    super();

    /** @type {File | undefined} The attached file — set this, nothing else. */
    this.file = undefined;

    /** @type {boolean} Shows loadingLabel in place of the name/icon — set by the app while an upload is in flight. */
    this.loading = false;

    /** @type {string} */
    this.loadingLabel = "Uploading…";

    /** @type {boolean} Shows errorLabel and an error icon in place of the name/icon — set by the app when an upload fails or a file is rejected. Takes precedence over loading. */
    this.error = false;

    /** @type {string} */
    this.errorLabel = "Upload failed";

    /** @type {boolean} Shows the hover-revealed remove button — `chx-attachments` turns it on for composer cards. */
    this.removable = false;

    /** @type {string | undefined} Object URL for an image `file`, revoked/recreated as it changes. */
    this.imageUrl = undefined;
  }

  /** @returns {string} */
  get displayName() {
    return this.file?.name ?? "";
  }

  /** @returns {string | Bytes} */
  get displaySize() {
    return this.file == null ? "" : new Bytes(this.file.size);
  }

  /** @returns {boolean} */
  get isImage() {
    return this.file?.type.startsWith("image/") ?? false;
  }

  /** @param {import("lit").PropertyValues<this>} changed */
  willUpdate(changed) {
    if (changed.has("file")) {
      if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
      this.imageUrl =
        this.file != null && this.isImage ? URL.createObjectURL(this.file) : undefined;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
  }

  handleRemoveClick = () => {
    this.dispatchEvent(
      new CustomEvent("chx-attachment-remove", {
        detail: { file: this.file, element: this },
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    const showImage = this.imageUrl != null && !this.loading && !this.error;

    return html`
      <md-card
        class=${classMap({ attachment: true, attachment_error: this.error, attachment_image: showImage })}
        part="card"
        variant="filled"
      >
        ${
          showImage
            ? html`<img class="attachment__image" part="image" src=${this.imageUrl} alt="" />`
            : html`<div class="attachment__icon" part="icon">
                ${
                  this.error
                    ? html` <md-icon>${unsafeSVG(errorOutline)}</md-icon>`
                    : this.loading
                      ? html` <md-progress-circular
                          class="attachment__progress"
                        ></md-progress-circular>`
                      : html` <slot name="icon">
                          <md-icon>${unsafeSVG(description)}</md-icon>
                        </slot>`
                }
              </div>`
        }
        <div class="attachment__content" part="content" id=${this.#contentId}>
          <slot
            >${this.error ? this.errorLabel : this.loading ? this.loadingLabel : this.displayName}</slot
          >
        </div>
        <md-tooltip placement="bottom" for=${this.#contentId}
          >${this.error ? this.errorLabel : this.loading ? this.loadingLabel : this.displayName}</md-tooltip
        >
        ${
          this.removable
            ? html`<md-icon-button
                  class="attachment__remove"
                  part="remove"
                  id=${this.#removeId}
                  @click=${this.handleRemoveClick}
                >
                  <md-icon>${unsafeSVG(close)}</md-icon>
                </md-icon-button>
                <md-tooltip placement="bottom" for=${this.#removeId}
                  >Remove ${this.displayName}</md-tooltip
                >`
            : nothing
        }
      </md-card>
    `;
  }
}

/**
 * A byte count that coerces to a plain number for comparisons (`size > maxUpload`)
 * and to a formatted string for display (`` `${size}` ``).
 */
export class Bytes {
  /** @param {number} n */
  constructor(n) {
    this.n = n;
  }

  /**
   * @param {"number" | "string" | "default"} hint
   * @returns {number | string}
   */
  [Symbol.toPrimitive](hint) {
    if (hint === "number") return this.n;
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = this.n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(1)} ${units[i]}`;
  }
}
