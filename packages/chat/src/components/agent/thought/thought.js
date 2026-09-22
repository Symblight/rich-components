import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

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
    open: { type: Boolean, reflect: true },
  };

  /** Latches on the first manual toggle — after that `streaming` never moves `open` again. */
  #userToggled = false;

  constructor() {
    super();

    /** @type {string} */
    this.text = "";

    /** Mirrors the part's `state === "streaming"`. @type {boolean} */
    this.streaming = false;

    /** @type {string} */
    this.label = "Reasoning";

    /** @type {string} */
    this.streamingLabel = "Thinking…";

    /** @type {boolean} */
    this.open = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** Expanded while the thought streams in, folded away once it settles — unless the user has
   *  taken the disclosure over, which wins from then on.
   * @param {import("lit").PropertyValues} changedProperties */
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (changedProperties.has("streaming") && !this.#userToggled) this.open = this.streaming;
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
    return html`
      <details class="thought" part="container" ?open=${this.open} @toggle=${this.#handleToggle}>
        <summary class="thought__summary" part="summary" @click=${this.#handleSummaryClick}>
          ${this.streaming ? this.streamingLabel : this.label}
        </summary>
        <div class="thought__content" part="content">
          <slot>${this.text}</slot>
        </div>
      </details>
    `;
  }
}
