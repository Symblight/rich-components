import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon";

import thoughtIcon from "@material-design-icons/svg/outlined/psychology.svg?raw";
import chevronIcon from "@material-design-icons/svg/outlined/expand_more.svg?raw";

import { consumeRowCompact } from "../../../context/message-row-context.js";
import tokens from "../../../styles/tokens.css?inline";
import rowStyles from "../agent-row.css?inline";
import styles from "./thought.css?inline";

/**
 * @tag chx-thought
 * @summary Agent reasoning disclosure — a `partElements.thought` renderer the app wires up itself.
 * @fires chx-thought-toggle - `{open}`, on a disclosure change the component didn't make itself.
 */
@customElement("chx-thought")
export class ChxThought extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    text: { type: String },
    streaming: { type: Boolean, reflect: true },
    label: { type: String },
    streamingLabel: { type: String, attribute: "streaming-label" },
    duration: { type: Number },
    open: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
  };

  /** Latches on the first manual toggle — after that `streaming` never moves `open` again. */
  #userToggled = false;

  /** Self-timed streaming window, used only while `duration` isn't supplied. */
  #startedAt = 0;
  #measured = 0;

  constructor() {
    super();

    /** @type {string} */
    this.text = "";

    /** Mirrors the part's `state === "streaming"`. @type {boolean} */
    this.streaming = false;

    /** @type {string} */
    this.label = "Thought";

    /** @type {string} */
    this.streamingLabel = "Thinking";

    /** Milliseconds; wins over the self-timed window, which a reload loses. @type {number} */
    this.duration = 0;

    /** @type {boolean} */
    this.open = false;

    /** Follows the message row's `compact` inside a chat. @type {boolean} */
    this.compact = false;

    consumeRowCompact(this);
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, rowStyles, styles];
  }

  /** Override to localize. @param {number} durationMs @returns {string} */
  formatSettledLabel(durationMs) {
    if (durationMs <= 0) return this.label;
    return `${this.label} for ${Math.max(1, Math.round(durationMs / 1000))}s`;
  }

  /** Collapsed by default, streaming included — the shimmering row is the signal, not the text.
   * @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (!changedProperties.has("streaming")) return;
    if (this.streaming) this.#startedAt = performance.now();
    else if (this.#startedAt) this.#measured = performance.now() - this.#startedAt;
    if (!this.#userToggled && !this.streaming) this.open = false;
  }

  /** Latched from the click, not from `toggle`: `toggle` is a queued task, so a `streaming` change
   *  arriving first re-renders `?open` over the collapse and the latch never engages. */
  #handleSummaryClick = () => {
    this.#userToggled = true;
  };

  /** A programmatic open/close renders `?open` already matching `this.open`; a click doesn't.
   * @param {Event} event */
  #handleToggle = (event) => {
    const open = /** @type {HTMLDetailsElement} */ (event.target).open;
    if (open === this.open) return;
    this.open = open;
    this.dispatchEvent(
      new CustomEvent("chx-thought-toggle", {
        detail: { open },
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    const label = this.streaming
      ? this.streamingLabel
      : this.formatSettledLabel(this.duration || this.#measured);
    return html`
      <details class="thought" part="container" ?open=${this.open} @toggle=${this.#handleToggle}>
        <summary
          class="thought__summary agent-row__head"
          part="summary"
          @click=${this.#handleSummaryClick}
        >
          <md-icon class="thought__icon agent-row__icon" part="icon" aria-hidden="true"
            >${unsafeSVG(thoughtIcon)}</md-icon
          >
          <span
            class=${classMap({
              thought__label: true,
              "agent-row__label": true,
              thought__label_streaming: this.streaming,
            })}
            part="label"
            >${label}</span
          >
          <span class="agent-row__spacer"></span>
          <md-icon class="agent-row__chevron" aria-hidden="true">${unsafeSVG(chevronIcon)}</md-icon>
        </summary>
        <div class="thought__content agent-row__body" part="content">
          <slot><span class="thought__text" .textContent=${this.text}></span></slot>
        </div>
      </details>
    `;
  }
}
