import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import styles from "./attachment.css?inline";

import "@symblight/wc-material/card";
import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/progress-circular";

import description from "@material-design-icons/svg/outlined/description.svg?raw";
import close from "@material-design-icons/svg/outlined/close.svg?raw";
import errorOutline from "@material-design-icons/svg/outlined/error_outline.svg?raw";

/**
 * @tag chx-attachment
 * @summary One attached-file card — icon, name, and a remove action.
 * Always backed by a real `File` via `.file`.
 */
@customElement("chx-attachment")
export class ChxAttachment extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    file: { attribute: false },
    loading: { type: Boolean, reflect: true, attribute: true },
    loadingLabel: { type: String, attribute: "loading-label" },
    error: { type: Boolean, reflect: true, attribute: true },
    errorLabel: { type: String, attribute: "error-label" },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
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
  }

  /** @returns {string} */
  get displayName() {
    return this.file?.name ?? "";
  }

  /** @returns {string} */
  get displaySize() {
    return this.file == null ? "" : formatBytes(this.file.size);
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
    return html`
      <md-card
        class=${classMap({ attachment: true, attachment_error: this.error })}
        part="card"
        variant="filled"
      >
        <div class="attachment__icon" part="icon">
          ${
                      this.error
                        ? html` <md-icon>${unsafeSVG(errorOutline)}</md-icon>`
                        : this.loading
                          ? html` <md-progress-circular></md-progress-circular>`
                          : html` <slot name="icon">
                              <md-icon>${unsafeSVG(description)}</md-icon>
                            </slot>`
                    }
        </div>
        <div
          class="attachment__content"
          part="content"
          title=${this.error ? this.errorLabel : this.loading ? this.loadingLabel : this.displayName}
        >
          <slot
            >${this.error ? this.errorLabel : this.loading ? this.loadingLabel : this.displayName}</slot
          >
        </div>
        <div class="attachment__actions" part="actions">
          <slot name="actions">
            <md-icon-button class="attachment__remove" @click=${this.handleRemoveClick}>
              <md-icon>${unsafeSVG(close)}</md-icon>
            </md-icon-button>
          </slot>
        </div>
      </md-card>
    `;
  }
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}
