import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * @typedef {{
 *   path: string,
 *   encoding: string,
 *   environment: string,
 *   breadcrumbs: boolean,
 * }} CdxFooterConfig
 */

/**
 * @tag cdx-footer
 * @summary Footer configuration carrier for cdx-code-editor; renders nothing.
 */
@customElement("cdx-footer")
export class CdxFooter extends ReactiveElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    path: { type: String },
    encoding: { type: String },
    environment: { type: String },
    noBreadcrumbs: { type: Boolean, attribute: "no-breadcrumbs" },
  };

  constructor() {
    super();

    /** @type {string} `project/dir/file.ts` — `/` separates the crumbs; the last one is the
     *  file. Empty: the editor's `filename`. */
    this.path = "";

    /** @type {string} Shown as a status when set, e.g. `UTF-8`. The editor doesn't know it. */
    this.encoding = "";

    /** @type {string} Shown as a status when set, e.g. `Node 22`. */
    this.environment = "";

    /** @type {boolean} Hides the path and symbol crumbs; only the statuses remain. */
    this.noBreadcrumbs = false;
  }

  /** Light DOM and nothing in it — this element only carries configuration. */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = "none";
  }

  /** @returns {CdxFooterConfig} */
  get config() {
    return {
      path: this.path,
      encoding: this.encoding,
      environment: this.environment,
      breadcrumbs: !this.noBreadcrumbs,
    };
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    super.updated(changed);
    this.dispatchEvent(new Event("cdx-footer-config", { bubbles: true }));
  }
}
