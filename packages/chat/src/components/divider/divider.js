import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import tokens from "../../styles/tokens.css?inline";
import styles from "./divider.css?inline";

/**
 * @typedef {Object} ChxDividerContext
 * @property {import("../../types/message.js").ChxMessage} [message]
 * @property {number} [index]
 */

/**
 * @tag chx-divider
 * @summary Timeline divider — a labeled separator (a day label, or any text). Slotted into
 * chx-message-list as `<chx-divider slot="divider">` it acts as a config carrier (formatDate/
 * shouldShowDivider/buildDivider, read by the host, renders nothing there); minted fresh per
 * day-boundary by `buildDivider`, or built directly by an app, it renders the visible separator.
 */
@customElement("chx-divider")
export class ChxDivider extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    label: { type: String, attribute: true },
    date: { attribute: false },
    sticky: { type: Boolean, reflect: true, attribute: true },
    formatDate: { attribute: false },
    shouldShowDivider: { attribute: false },
  };

  constructor() {
    super();

    /** Visible text; overridden by any default-slot content. @type {string} */
    this.label = "";

    /** Optional — when set and `label` is empty, the visual shows `formatDate(date)`. @type {number | Date | undefined} */
    this.date = undefined;

    /** Opt-in pinned top label; read by chx-message-list, no effect on a standalone instance. @type {boolean} */
    this.sticky = false;

    /** Overridable — assign or subclass, same shape as chx-paste-long-text.classify. @type {(date: number | Date) => string} */
    this.formatDate = this.#defaultFormatDate;

    /** Overridable predicate, evaluated per message by chx-message-list. @type {(context: {date: number | Date, message: import("../../types/message.js").ChxMessage, previousDate: number | Date | undefined, index: number}) => boolean} */
    this.shouldShowDivider = this.#defaultShouldShowDivider;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  /** Today / Yesterday / weekday (within a week) / full date, dropping the year when it's the current one. */
  #defaultFormatDate = (/** @type {number | Date} */ date) => {
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const startOfDay = (/** @type {Date} */ x) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, {
      weekday: diffDays > 1 && diffDays < 7 ? "long" : undefined,
      month: "long",
      day: "numeric",
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }).format(d);
  };

  /** Show a divider on the first message and whenever the calendar day changes. */
  #defaultShouldShowDivider = (
    /** @type {{date: number | Date, previousDate: number | Date | undefined}} */ {
      date,
      previousDate,
    },
  ) => {
    if (previousDate == null) return true;
    const a = date instanceof Date ? date : new Date(date);
    const b = previousDate instanceof Date ? previousDate : new Date(previousDate);
    return (
      a.getFullYear() !== b.getFullYear() ||
      a.getMonth() !== b.getMonth() ||
      a.getDate() !== b.getDate()
    );
  };

  /**
   * Mints the element chx-message-list prepends into a day's first-message row. Override to draw a
   * custom separator; the default returns a fresh chx-divider carrying the already-formatted label.
   * @param {string} label
   * @param {ChxDividerContext} [_context]
   * @returns {HTMLElement}
   */
  buildDivider(label, _context) {
    const el = /** @type {ChxDivider} */ (document.createElement("chx-divider"));
    el.label = label;
    return el;
  }

  render() {
    const label = this.label || (this.date != null ? this.formatDate(this.date) : "");
    return html`
      <div class="divider" part="divider" role="separator" aria-label=${label || nothing}>
        <span class="divider__label" part="label"><slot>${label}</slot></span>
      </div>
    `;
  }
}
