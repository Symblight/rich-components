import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/menu";

import { icon } from "../../core/icons.js";
import tokens from "../../styles/tokens.css?inline";
import styles from "./status-bar.css?inline";

/**
 * @typedef {import("../../features/footer/FooterController.js").StatusBarModel} StatusBarModel
 * @typedef {import("../../core/symbols.js").CdxSymbol} CdxSymbol
 * @typedef {"path" | "file" | "symbol" | "go-to-line" | "toggle-diff" | "encoding" | "language" | "environment"} CdxStatusBarActionName
 * @typedef {{ action: CdxStatusBarActionName, index?: number, symbol?: CdxSymbol }} CdxStatusBarAction
 */

/** @param {CdxSymbol["kind"]} kind */
const kindIcon = (kind) =>
  kind === "function" || kind === "method"
    ? "function"
    : kind === "class" || kind === "type" || kind === "namespace"
      ? "category"
      : "data_object";

/**
 * @tag cdx-status-bar
 * @summary Editor footer: path and symbol breadcrumbs, then caret, selection, diff and file statuses.
 */
@customElement("cdx-status-bar")
export class CdxStatusBar extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    model: { attribute: false },
  };

  static styles = [tokens, styles];

  constructor() {
    super();

    /** @type {StatusBarModel | null} */
    this.model = null;
  }

  /** @param {CdxStatusBarAction} detail */
  #emit(detail) {
    this.dispatchEvent(new CustomEvent("cdx-status-bar-action", { detail }));
  }

  /** Siblings of the crumb at `depth` — the outline's top level, or its parent's children.
   * @param {number} depth */
  #siblings(depth) {
    const model = /** @type {NonNullable<typeof this.model>} */ (this.model);
    return depth === 0 ? model.outline : model.symbols[depth - 1].children;
  }

  #renderCrumbs() {
    const model = /** @type {NonNullable<typeof this.model>} */ (this.model);
    const { path, file, symbols } = model;
    const full = [...path, file].join(" / ");
    return html`
      <nav class="status-bar__crumbs" part="crumbs" aria-label="Path to symbol">
        ${
          path.length
            ? html`
                <button
                  class="status-bar__crumb status-bar__crumb_more"
                  type="button"
                  title=${full}
                  aria-label=${full}
                  @click=${() => this.#emit({ action: "path", index: path.length - 1 })}
                >
                  …
                </button>
                <span class="status-bar__sep status-bar__sep_more" aria-hidden="true">/</span>
              `
            : nothing
        }
        ${path.map(
          (segment, index) => html`
            <button
              class="status-bar__crumb status-bar__crumb_path"
              part="crumb"
              type="button"
              @click=${() => this.#emit({ action: "path", index })}
            >
              <span class="status-bar__label">${segment}</span>
            </button>
            <span class="status-bar__sep status-bar__sep_path" part="separator" aria-hidden="true"
              >/</span
            >
          `,
        )}
        <button
          class="status-bar__crumb ${symbols.length ? "" : "status-bar__crumb_current"}"
          part=${symbols.length ? "crumb" : "crumb crumb-current"}
          type="button"
          @click=${() => this.#emit({ action: "file" })}
        >
          <span class="status-bar__label">${file}</span>
        </button>
        ${symbols.map((symbol, depth) => {
          const current = depth === symbols.length - 1;
          const siblings = this.#siblings(depth);
          return html`
            <span class="status-bar__sep status-bar__sep_symbol" part="separator" aria-hidden="true"
              >${icon("chevron_right")}</span
            >
            <button
              id="symbol-${depth}"
              class="status-bar__crumb status-bar__crumb_symbol ${
                current ? "status-bar__crumb_current" : ""
              }"
              part=${current ? "crumb crumb-current" : "crumb"}
              type="button"
              aria-haspopup="menu"
            >
              ${icon(kindIcon(symbol.kind))}
              <span class="status-bar__label">${symbol.name}</span>
            </button>
            <md-menu
              class="status-bar__menu"
              for="symbol-${depth}"
              focus-on-open="selected"
              @select=${(/** @type {CustomEvent<{ value: string }>} */ event) =>
                this.#emit({ action: "symbol", symbol: siblings[Number(event.detail.value)] })}
            >
              ${siblings.map(
                (sibling, index) => html`
                  <md-menu-item class="status-bar__menu-item" value=${String(index)} ?selected=${sibling === symbol}>
                    <span slot="leading" class="status-bar__menu-icon"
                      >${icon(kindIcon(sibling.kind))}</span
                    >
                    <span class="status-bar__menu-name">${sibling.name}</span>
                    <span slot="trailing" class="status-bar__menu-line"
                      >${model.lineAt(sibling.from)}</span
                    >
                  </md-menu-item>
                `,
              )}
            </md-menu>
          `;
        })}
      </nav>
    `;
  }

  render() {
    const model = this.model;
    if (!model) return nothing;
    const { diff } = model;
    return html`
      <div class="status-bar" part="bar">
        ${model.breadcrumbs ? this.#renderCrumbs() : html`<span class="status-bar__grow"></span>`}
        <div class="status-bar__items" part="items">
          <button
            class="status-bar__item status-bar__item_position"
            part="position"
            type="button"
            title="Go to line (Ctrl-G)"
            @click=${() => this.#emit({ action: "go-to-line" })}
          >
            ${model.position}
          </button>
          ${
            model.selected
              ? html`
                  <span
                    class="status-bar__item status-bar__item_selection status-bar__item_secondary"
                    part="selection"
                    >(${model.selected} selected)</span
                  >
                `
              : nothing
          }
          ${
            diff
              ? html`
                  <button
                    class="status-bar__item status-bar__item_diff status-bar__item_secondary"
                    part="diff"
                    type="button"
                    aria-pressed=${diff.pressed ? "true" : "false"}
                    title="Diff vs HEAD"
                    @click=${() => this.#emit({ action: "toggle-diff" })}
                  >
                    <span class="status-bar__added">+${diff.added}</span>
                    <span class="status-bar__removed">−${diff.removed}</span>
                  </button>
                `
              : nothing
          }
          ${
            model.encoding
              ? html`
                  <button
                    class="status-bar__item status-bar__item_secondary"
                    part="encoding"
                    type="button"
                    @click=${() => this.#emit({ action: "encoding" })}
                  >
                    ${model.encoding}
                  </button>
                `
              : nothing
          }
          <button
            class="status-bar__item"
            part="language"
            type="button"
            @click=${() => this.#emit({ action: "language" })}
          >
            ${model.language}
          </button>
          ${
            model.environment
              ? html`
                  <button
                    class="status-bar__item status-bar__item_secondary"
                    part="environment"
                    type="button"
                    @click=${() => this.#emit({ action: "environment" })}
                  >
                    ${model.environment}
                  </button>
                `
              : nothing
          }
          <slot name="status"></slot>
        </div>
      </div>
    `;
  }
}
