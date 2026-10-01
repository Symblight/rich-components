import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import { icon } from "../../core/icons.js";
import buttons from "../../styles/comment-buttons.css?inline";
import tokens from "../../styles/tokens.css?inline";
import styles from "./comments-nav.css?inline";

/**
 * @typedef {import("../../features/comments/comments-bar.js").CdxCommentsBarConfig} CdxCommentsBarConfig
 * @typedef {{
 *   total: number,
 *   index: number,
 *   action: boolean,
 *   canAct: boolean,
 *   busy: boolean,
 * }} CdxCommentsNavModel
 * `index`: the open thread on the caret line, -1 when none. `action`: Resolve all is offered at all
 * (thread mode with resolve); `canAct`: something is left for it; `busy`: a resolve is waiting.
 * @typedef {"previous" | "next" | "resolve-all"} CdxCommentsNavAction
 */

/** @param {string} template @param {Record<string, string | number>} values */
const fill = (template, values) =>
  template
    .replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""))
    .replace(/\(s\)/g, values.total === 1 ? "" : "s");

/**
 * @tag cdx-comments-nav
 * @summary Floating pill: ‹ n/total comments › and Resolve all.
 */
@customElement("cdx-comments-nav")
export class CdxCommentsNav extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    model: { attribute: false },
    config: { attribute: false },
  };

  static styles = [tokens, buttons, styles];

  constructor() {
    super();

    /** @type {CdxCommentsNavModel | undefined} */
    this.model = undefined;

    /** @type {CdxCommentsBarConfig | undefined} */
    this.config = undefined;
  }

  /** @param {CdxCommentsNavAction} action */
  #emit(action) {
    this.dispatchEvent(new CustomEvent("cdx-comments-nav-action", { detail: { action } }));
  }

  render() {
    const { model, config } = this;
    if (!model || !config) return nothing;
    const empty = model.total === 0;
    return html`
      <div class="nav" part="bar" role="toolbar" aria-label="Comment threads">
        <span class="nav__steps" part="nav">
          <button
            class="cbtn cbtn_icon"
            type="button"
            aria-label=${config.previousLabel}
            title=${config.previousLabel}
            ?disabled=${empty}
            @click=${() => this.#emit("previous")}
          >
            ${icon("chevron_left")}
          </button>
          <span class="nav__count" part="count" role="status" aria-live="polite">
            ${fill(config.countLabel, {
              n: model.index >= 0 ? model.index + 1 : "–",
              total: model.total,
            })}
          </span>
          <button
            class="cbtn cbtn_icon"
            type="button"
            aria-label=${config.nextLabel}
            title=${config.nextLabel}
            ?disabled=${empty}
            @click=${() => this.#emit("next")}
          >
            ${icon("chevron_right")}
          </button>
        </span>
        ${
          model.action
            ? html`<button
                class="cbtn cbtn_filled"
                type="button"
                part="action"
                aria-busy=${String(model.busy)}
                ?disabled=${!model.canAct || model.busy}
                @click=${() => this.#emit("resolve-all")}
              >
                ${
                  model.busy
                    ? html`<span class="cbtn__spinner" aria-hidden="true"></span>`
                    : nothing
                }${config.actionLabel}
              </button>`
            : nothing
        }
      </div>
    `;
  }
}
