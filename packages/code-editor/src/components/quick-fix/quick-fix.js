import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

import "@symblight/wc-material/button";
import "@symblight/wc-material/tooltip";

import { icon } from "../../core/icons.js";
import tokens from "../../styles/tokens.css?inline";
import styles from "./quick-fix.css?inline";

/** @typedef {import("../../controllers/QuickFixController.js").LineProblem} LineProblem */
/** @typedef {{ problem: LineProblem, index: number }} CdxQuickFixApplyDetail */

/**
 * @tag cdx-quick-fix
 * @summary Lightbulb for the caret line's problems, with an md-rich-tooltip of their fixes.
 */
@customElement("cdx-quick-fix")
export class CdxQuickFix extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    problems: { attribute: false },
  };

  static styles = [tokens, styles];

  constructor() {
    super();

    /** @type {LineProblem[]} */
    this.problems = [];
  }

  /** Focuses the bulb and opens the menu — Mod-. in the editor. */
  async open() {
    await this.updateComplete;
    /** @type {HTMLElement | null} */ (this.renderRoot.querySelector(".quick-fix__bulb"))?.focus();
    this.#menu()?.show();
  }

  #menu() {
    return /** @type {(HTMLElement & { show(): void, hide(): void }) | null} */ (
      this.renderRoot.querySelector(".quick-fix__menu")
    );
  }

  /** @param {LineProblem} problem @param {number} index */
  #apply(problem, index) {
    this.#menu()?.hide();
    /** @type {CdxQuickFixApplyDetail} */
    const detail = { problem, index };
    this.dispatchEvent(new CustomEvent("cdx-quick-fix-apply", { detail }));
  }

  handleClick = () => {
    this.open();
  };

  /** Escape on the bulb hands focus back to the text. @param {KeyboardEvent} event */
  handleKeydown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.dispatchEvent(new Event("cdx-quick-fix-dismiss"));
  };

  render() {
    const fixes = this.problems.flatMap((problem) =>
      (problem.diagnostic.actions ?? []).map((action, index) => ({ problem, action, index })),
    );
    const label = fixes.length ? "Show fixes" : "Show problems";
    return html`
      <button
        id="bulb"
        class="quick-fix__bulb"
        part="bulb"
        type="button"
        aria-label=${label}
        aria-haspopup="true"
        @click=${this.handleClick}
        @keydown=${this.handleKeydown}
      >
        ${icon("lightbulb")}
      </button>
      <md-rich-tooltip class="quick-fix__menu" part="menu" for="bulb" placement="bottom-start">
        <span slot="subhead">${fixes.length ? "Quick fixes" : "Problems"}</span>
        ${repeat(
          this.problems,
          (problem) => problem.diagnostic,
          (problem) => html`
            <div class="quick-fix__message quick-fix__message_${problem.diagnostic.severity}">
              ${problem.diagnostic.message}
            </div>
          `,
        )}
        ${fixes.map(
          ({ problem, action, index }) => html`
            <md-button slot="actions" variant="text" @click=${() => this.#apply(problem, index)}>
              ${action.name}
            </md-button>
          `,
        )}
      </md-rich-tooltip>
    `;
  }
}
