import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * @typedef {import("./shared.js").CdxDiffKind} CdxDiffKind
 * @typedef {import("./shared.js").CdxDiffTone} CdxDiffTone
 * @typedef {import("./shared.js").CdxChunkModel} CdxChunkModel
 * @typedef {import("./shared.js").CdxDiffConfig} CdxDiffConfig
 */

/** Defaults per layer: a review is loud (tertiary, the agent's), a baseline quiet (neutral, HEAD). */
const DEFAULTS = {
  review: { author: "Agent", tone: "tertiary", icon: "smart_toy" },
  baseline: { author: "HEAD", tone: "neutral", icon: "history" },
};

/**
 * @tag cdx-diff
 * @summary Diff configuration carrier for cdx-code-editor; renders nothing.
 */
@customElement("cdx-diff")
export class CdxDiff extends ReactiveElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    kind: { type: String, reflect: true },
    author: { type: String },
    tone: { type: String },
    icon: { type: String },
    acceptLabel: { type: String, attribute: "accept-label" },
    rejectLabel: { type: String, attribute: "reject-label" },
    revertLabel: { type: String, attribute: "revert-label" },
    acceptAllLabel: { type: String, attribute: "accept-all-label" },
    rejectAllLabel: { type: String, attribute: "reject-all-label" },
    expanded: { type: Boolean, reflect: true },
    noReviewBar: { type: Boolean, attribute: "no-review-bar" },
    getAuthor: { attribute: false },
    getAvatarUrl: { attribute: false },
  };

  constructor() {
    super();

    /** @type {CdxDiffKind} `review`: proposals inline with Accept/Reject against the editor's
     *  `reviewBase`. `baseline`: marks against `baseline` (HEAD), a chunk opens on click. */
    this.kind = "review";

    /** @type {string} Shown in headers and the review bar; defaults per kind. */
    this.author = "";

    /** @type {CdxDiffTone | ""} Color role of headers and the review bar; defaults per kind. */
    this.tone = "";

    /** @type {string} Material Symbols name shown when there's no avatar; defaults per kind. */
    this.icon = "";

    /** @type {string} */
    this.acceptLabel = "Accept";

    /** @type {string} */
    this.rejectLabel = "Reject";

    /** @type {string} */
    this.revertLabel = "Revert";

    /** @type {string} Review bar. */
    this.acceptAllLabel = "Accept all";

    /** @type {string} Review bar. */
    this.rejectAllLabel = "Reject all";

    /** @type {boolean} Baseline only: every chunk shown inline ("Diff vs HEAD"), not just marks. */
    this.expanded = false;

    /** @type {boolean} Review only: hides the bar above the text. */
    this.noReviewBar = false;

    /** @type {((chunk?: CdxChunkModel) => string | null | undefined) | undefined} Per chunk;
     *  no argument for the review bar. Falls back to `author`. */
    this.getAuthor = undefined;

    /** @type {((chunk?: CdxChunkModel) => string | null | undefined) | undefined} Per chunk; no
     *  argument for the review bar. Rendered with md-avatar; no URL → the kind's icon. */
    this.getAvatarUrl = undefined;
  }

  /** Light DOM and nothing in it — this element only carries configuration. */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = "none";
  }

  /** The resolved settings the editor reads; a new object whenever anything changed.
   * @returns {CdxDiffConfig} */
  get config() {
    const kind = this.kind === "baseline" ? "baseline" : "review";
    const defaults = DEFAULTS[kind];
    return {
      kind,
      author: this.author || defaults.author,
      tone: /** @type {CdxDiffTone} */ (this.tone || defaults.tone),
      icon: this.icon || defaults.icon,
      acceptLabel: this.acceptLabel,
      rejectLabel: this.rejectLabel,
      revertLabel: this.revertLabel,
      acceptAllLabel: this.acceptAllLabel,
      rejectAllLabel: this.rejectAllLabel,
      getAuthor: this.getAuthor,
      getAvatarUrl: this.getAvatarUrl,
    };
  }

  /** Re-renders headers after the data behind `getAuthor`/`getAvatarUrl` changed — the update
   *  cycle ends in `updated()`, which tells the editor to rebuild them. */
  refresh() {
    this.requestUpdate();
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    super.updated(changed);
    this.dispatchEvent(new Event("cdx-diff-config", { bubbles: true }));
  }
}
