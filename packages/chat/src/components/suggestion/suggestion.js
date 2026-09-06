import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/chips";

import styles from "./suggestion.css?inline";

/**
 * @tag chx-suggestion
 * @summary A single clickable starter prompt — see chx-suggestion-list for the list that renders,
 * activates, and roves focus across these.
 */
@customElement("chx-suggestion")
export class ChxSuggestion extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    value: { type: String },
  };

  constructor() {
    super();

    /** @type {string} Text inserted into the composer on activation — independent of the slotted label. */
    this.value = "";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /**
   * md-suggestion-chip's real focusable target is its own internal `<button id="chip">`, one shadow
   * root below this element's own template — re-queried live rather than cached, see the class doc.
   * @returns {HTMLElement | null}
   */
  get #buttonElement() {
    return (
      this.renderRoot?.querySelector("md-suggestion-chip")?.shadowRoot?.querySelector("#chip") ??
      null
    );
  }

  /** Delegates to the real button — chx-suggestion itself is never a tab stop, see setTabbable. */
  focus() {
    this.#buttonElement?.focus();
  }

  /**
   * Drives roving tabindex — called by chx-suggestion-list, never read/written by this element
   * itself. Only one chx-suggestion in a list should ever be tabbable at a time.
   * @param {boolean} isTabbable
   */
  setTabbable(isTabbable) {
    const button = this.#buttonElement;
    if (button) button.tabIndex = isTabbable ? 0 : -1;
  }

  render() {
    return html`<md-suggestion-chip><slot></slot></md-suggestion-chip>`;
  }
}
