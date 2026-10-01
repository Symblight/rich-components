import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/avatar";

import { icon } from "../../core/icons.js";
import tokens from "../../styles/tokens.css?inline";
import styles from "./review-bar.css?inline";

/**
 * @typedef {import("../../features/diff/shared.js").CdxDiffConfig} CdxDiffConfig
 * @typedef {import("../../features/diff/DiffController.js").CdxDiffStats["review"]} ReviewStats
 * @typedef {"accept-all" | "reject-all" | "previous" | "next" | "dismiss"} CdxReviewBarAction
 */

/**
 * @tag cdx-review-bar
 * @summary Review bar above the text: pending count, navigation, Reject all / Accept all.
 */
@customElement("cdx-review-bar")
export class CdxReviewBar extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    config: { attribute: false },
    stats: { attribute: false },
    complete: { type: Boolean, reflect: true },
    tone: { type: String, reflect: true },
  };

  static styles = [tokens, styles];

  constructor() {
    super();

    /** @type {CdxDiffConfig | undefined} */
    this.config = undefined;

    /** @type {ReviewStats | undefined} */
    this.stats = undefined;

    /** @type {boolean} Nothing pending: a neutral summary with a close button. */
    this.complete = false;

    /** @type {import("../../features/diff/shared.js").CdxDiffTone} */
    this.tone = "tertiary";
  }

  /** @param {CdxReviewBarAction} action */
  #emit(action) {
    this.dispatchEvent(new CustomEvent("cdx-review-bar-action", { detail: { action } }));
  }

  /** @param {string} iconName */
  #mark(iconName) {
    const url = this.complete ? null : this.config?.getAvatarUrl?.();
    return url
      ? html`<md-avatar class="review-bar__avatar" part="avatar" src=${url}></md-avatar>`
      : html`<span class="review-bar__icon" part="icon">${icon(iconName)}</span>`;
  }

  render() {
    const { config, stats } = this;
    if (!config || !stats) return nothing;
    if (this.complete) {
      return html`
        <div class="review-bar review-bar_done" part="bar done" role="status">
          ${this.#mark("task_alt")}
          <span class="review-bar__text" part="label">
            <b part="count">Review complete</b> · ${stats.accepted} accepted · ${stats.rejected}
            rejected
          </span>
          <span class="review-bar__grow"></span>
          <button
            class="review-bar__icon-button"
            part="dismiss"
            type="button"
            aria-label="Hide"
            title="Hide"
            @click=${() => this.#emit("dismiss")}
          >
            ${icon("close")}
          </button>
        </div>
      `;
    }
    const author = config.getAuthor?.() ?? config.author;
    const noun = stats.pending === 1 ? "change" : "changes";
    return html`
      <div class="review-bar" part="bar" role="region" aria-label="Review">
        ${this.#mark(config.icon)}
        <span class="review-bar__text" part="label">
          <b part="count">${stats.pending} ${noun}</b> proposed by ${author}
        </span>
        <span class="review-bar__nav" part="nav">
          <button
            class="review-bar__icon-button"
            part="previous"
            type="button"
            aria-label="Previous change"
            title="Previous change (Shift-F7)"
            @click=${() => this.#emit("previous")}
          >
            ${icon("up")}
          </button>
          <span class="review-bar__position" part="position">
            ${stats.index >= 0 ? stats.index + 1 : "—"} of ${stats.pending}
          </span>
          <button
            class="review-bar__icon-button"
            part="next"
            type="button"
            aria-label="Next change"
            title="Next change (F7)"
            @click=${() => this.#emit("next")}
          >
            ${icon("down")}
          </button>
        </span>
        <span class="review-bar__grow"></span>
        <button
          class="review-bar__button review-bar__button_text"
          part="reject-all"
          type="button"
          @click=${() => this.#emit("reject-all")}
        >
          ${config.rejectAllLabel}
        </button>
        <button
          class="review-bar__button review-bar__button_filled"
          part="accept-all"
          type="button"
          @click=${() => this.#emit("accept-all")}
        >
          ${config.acceptAllLabel}
        </button>
      </div>
    `;
  }
}
