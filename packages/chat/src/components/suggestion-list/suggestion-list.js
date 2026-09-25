import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./suggestion-list.css?inline";

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);
const NAV_KEYS = new Set([...NEXT_KEYS, ...PREV_KEYS, "Home", "End"]);

/** @typedef {HTMLElement & {value: string, setTabbable: (v: boolean) => void, focus: () => void}} SuggestionElement */

/**
 * @tag chx-suggestion-list
 * @summary A row of clickable chx-suggestion chips. Visibility (empty-thread vs alwaysVisible) is
 * decided by chx-message-composer via the standard `hidden` attribute, not by this component.
 */
@customElement("chx-suggestion-list")
export class ChxSuggestionList extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    alwaysVisible: { type: Boolean, attribute: "always-visible" },
    autoSubmit: { type: Boolean, attribute: "auto-submit" },
  };

  /** @type {number} The single roving tab stop, an index into #getSuggestions(). */
  #activeIndex = 0;

  constructor() {
    super();

    /** @type {boolean} Read externally by chx-message-composer — see the class doc. */
    this.alwaysVisible = false;

    /** @type {boolean} Applies to every child chx-suggestion uniformly — no per-item override. */
    this.autoSubmit = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** @returns {SuggestionElement[]} */
  #getSuggestions() {
    return /** @type {any} */ (Array.from(this.querySelectorAll(":scope > chx-suggestion")));
  }

  /**
   * Re-reads the light-DOM children whenever they change and reclamps the roving tab stop —
   * covers suggestions being added/removed/reordered after first render.
   */
  #handleSlotchange = () => {
    const suggestions = this.#getSuggestions();
    if (suggestions.length === 0) return;
    this.#activeIndex = Math.min(this.#activeIndex, suggestions.length - 1);
    suggestions.forEach((suggestion, index) => suggestion.setTabbable(index === this.#activeIndex));
  };

  /**
   * md-suggestion-chip's real button fires a native, composed `click` on activation (mouse, or
   * Enter/Space once focused — ordinary button semantics, no extra handling needed for those keys)
   * — it retargets across both shadow boundaries and arrives here looking like a plain bubbling
   * click from a slotted chx-suggestion.
   * @param {Event} event
   */
  #handleClick = (event) => {
    const suggestion = /** @type {HTMLElement | undefined} */ (
      event
        .composedPath()
        .find((el) => /** @type {HTMLElement} */ (el).tagName === "CHX-SUGGESTION")
    );
    if (!suggestion) return;

    const suggestions = this.#getSuggestions();
    const index = suggestions.indexOf(/** @type {any} */ (suggestion));
    if (index !== -1) this.#moveActiveTo(index, suggestions, { focus: false });

    this.dispatchEvent(
      new CustomEvent("chx-suggestion-select", {
        detail: { value: /** @type {any} */ (suggestion).value, autoSubmit: this.autoSubmit },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /**
   * Arrow/Home/End roving navigation — clamped, no wraparound, same choice
   * FocusBehaviorController made for the message list. Enter/Space activation needs no handling
   * here — it's already native button behavior on whichever chip currently holds the tab stop.
   * @param {KeyboardEvent} event
   */
  #handleKeydown = (event) => {
    if (!NAV_KEYS.has(event.key)) return;
    const suggestions = this.#getSuggestions();
    if (suggestions.length === 0) return;

    const targetIndex = NEXT_KEYS.has(event.key)
      ? this.#activeIndex + 1
      : PREV_KEYS.has(event.key)
        ? this.#activeIndex - 1
        : event.key === "Home"
          ? 0
          : suggestions.length - 1;

    this.#moveActiveTo(Math.max(0, Math.min(targetIndex, suggestions.length - 1)), suggestions, {
      focus: true,
    });
    event.preventDefault();
  };

  /**
   * @param {number} index
   * @param {SuggestionElement[]} suggestions
   * @param {{focus: boolean}} options
   */
  #moveActiveTo(index, suggestions, { focus }) {
    if (index === this.#activeIndex && !focus) return;
    suggestions[this.#activeIndex]?.setTabbable(false);
    this.#activeIndex = index;
    const next = suggestions[index];
    next?.setTabbable(true);
    if (focus) next?.focus();
  }

  render() {
    return html`
      <div
        class="suggestion-list"
        part="list"
        role="group"
        aria-label="Suggestions"
        @keydown=${this.#handleKeydown}
      >
        <slot @slotchange=${this.#handleSlotchange} @click=${this.#handleClick}></slot>
      </div>
    `;
  }
}
