import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/progress-circular";

import tokens from "../../styles/tokens.css?inline";
import styles from "./loading-history.css?inline";

/**
 * @tag chx-loading-history
 * @summary "Loading older messages" indicator, rendered by default via chx-message-list's slot fallback.
 */
@customElement("chx-loading-history")
export class ChxLoadingHistory extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    delay: { type: Number },
  };

  #visible = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;
  /** @type {IntersectionObserver | undefined} */
  #observer;

  constructor() {
    super();

    /** ms to wait, once actually shown, before rendering visibly — 0 shows immediately. @type {number} */
    this.delay = 0;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.delay <= 0) return;

    // an app-authored instance connects once then just gets (un)assigned per cycle, so watch for
    // actually being rendered instead of connectedCallback/disconnectedCallback
    this.#observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) this.#arm();
      else this.#disarm();
    });
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#disarm();
  }

  #arm() {
    if (this.#timer || this.#visible) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#visible = true;
      this.requestUpdate();
    }, this.delay);
  }

  #disarm() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#visible) {
      this.#visible = false;
      this.requestUpdate();
    }
  }

  render() {
    // always render the box (visibility toggle, not a conditional template) so #observer has a real target
    return html`
      <div
        class="loading-history__bubble"
        aria-hidden="true"
        ?hidden=${this.delay > 0 && !this.#visible}
      >
        <slot><md-progress-circular></md-progress-circular></slot>
      </div>
    `;
  }
}
