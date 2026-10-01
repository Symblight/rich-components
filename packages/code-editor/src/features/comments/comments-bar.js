import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * @typedef {"auto" | "always" | "never"} CdxCommentsBarVisibility
 * @typedef {{
 *   visibility: CdxCommentsBarVisibility,
 *   countLabel: string,
 *   actionLabel: string,
 *   previousLabel: string,
 *   nextLabel: string,
 * }} CdxCommentsBarConfig
 */

/**
 * @tag cdx-comments-bar
 * @summary Open-comments bar configuration carrier for cdx-code-editor; renders nothing.
 */
@customElement("cdx-comments-bar")
export class CdxCommentsBar extends ReactiveElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    visibility: { type: String, reflect: true },
    countLabel: { type: String, attribute: "count-label" },
    actionLabel: { type: String, attribute: "action-label" },
    previousLabel: { type: String, attribute: "previous-label" },
    nextLabel: { type: String, attribute: "next-label" },
  };

  constructor() {
    super();

    /** @type {CdxCommentsBarVisibility} `auto`: shown while open comments exist; `always`: while
     *  any comment exists. Never shown without comments. */
    this.visibility = "auto";

    /** @type {string} `{n}` the comment at the caret (– when none), `{total}` open comments;
     *  `(s)` is dropped for one. */
    this.countLabel = "{n}/{total} comment(s)";

    /** @type {string} Resolves every open comment the user may resolve. */
    this.actionLabel = "Resolve all";

    /** @type {string} */
    this.previousLabel = "Previous comment";

    /** @type {string} */
    this.nextLabel = "Next comment";
  }

  /** Light DOM and nothing in it — this element only carries configuration. */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = "none";
  }

  /** @returns {CdxCommentsBarConfig} */
  get config() {
    const visibility = ["always", "never"].includes(this.visibility) ? this.visibility : "auto";
    return {
      visibility: /** @type {CdxCommentsBarVisibility} */ (visibility),
      countLabel: this.countLabel,
      actionLabel: this.actionLabel,
      previousLabel: this.previousLabel,
      nextLabel: this.nextLabel,
    };
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    super.updated(changed);
    this.dispatchEvent(new Event("cdx-comments-bar-config", { bubbles: true }));
  }
}
