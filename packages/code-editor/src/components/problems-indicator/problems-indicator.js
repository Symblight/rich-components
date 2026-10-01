import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import { icon } from "../../core/icons.js";
import tokens from "../../styles/tokens.css?inline";
import styles from "./problems-indicator.css?inline";

/**
 * @tag cdx-problems-indicator
 * @summary Problem count over the editor's corner; a checkmark when checked and clean.
 */
@customElement("cdx-problems-indicator")
export class CdxProblemsIndicator extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    errors: { type: Number },
    warnings: { type: Number },
    others: { type: Number },
  };

  static styles = [tokens, styles];

  constructor() {
    super();

    /** @type {number} */
    this.errors = 0;

    /** @type {number} */
    this.warnings = 0;

    /** @type {number} Info and hints. */
    this.others = 0;
  }

  render() {
    const { errors, warnings, others } = this;
    const total = errors + warnings + others;
    const kind = errors ? "error" : warnings ? "warning" : total ? "info" : "clean";
    const parts = [];
    if (errors) parts.push(`${errors} ${errors === 1 ? "error" : "errors"}`);
    if (warnings) parts.push(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`);
    if (others) parts.push(`${others} ${others === 1 ? "notice" : "notices"}`);
    const label = total ? `${parts.join(", ")}. Go to the first problem` : "No problems";
    const name = kind === "clean" ? "check" : kind === "error" ? "error" : "warning";
    return html`
      <button
        class="problems-indicator problems-indicator_${kind}"
        part="button"
        type="button"
        title=${label}
        aria-label=${label}
      >
        ${icon(name)} ${total ? total : nothing}
      </button>
    `;
  }
}
