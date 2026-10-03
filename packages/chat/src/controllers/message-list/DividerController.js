import { nothing } from "lit";

/** @import { ChxMessage } from "../../types/message.js" */
/** @import { ChxDivider } from "../../components/divider/divider.js" */

/** Rough px a date divider adds to a row's pre-measurement estimate. */
const DIVIDER_ESTIMATE = 40;

/**
 * Date dividers for `chx-message-list`: the slotted `<chx-divider>` config carrier, whether a
 * divider is due per row, and a per-message-id element cache so scrolling doesn't rebuild them.
 */
export class DividerController {
  /** @type {() => ChxMessage[]} */
  #getMessages;
  /** The slotted `<chx-divider slot="divider">`. @type {ChxDivider | undefined} */
  #element;
  /** message id → its built divider @type {Map<string, HTMLElement>} */
  #cache = new Map();

  /** @param {{getMessages: () => ChxMessage[]}} config */
  constructor(config) {
    this.#getMessages = config.getMessages;
  }

  /** @returns {ChxDivider | undefined} */
  get element() {
    return this.#element;
  }

  /** The carrier's `sticky` — enables the floating label. */
  get sticky() {
    return this.#element?.sticky ?? false;
  }

  /** Cached inline dividers currently in the DOM (virtualized-out ones skipped). */
  *connectedDividers() {
    for (const element of this.#cache.values()) {
      if (element.isConnected) yield element;
    }
  }

  /** A new carrier slotted (or removed) — drops elements built by the old one. @param {ChxDivider | undefined} element */
  setElement(element) {
    this.#element = element;
    this.#cache.clear();
  }

  /** @param {ChxMessage} message @param {number} index */
  shouldShow(message, index) {
    if (!this.#element) return false;
    const previousDate = index > 0 ? this.#getMessages()[index - 1]?.createdAt : undefined;
    return this.#element.shouldShowDivider({
      date: message.createdAt,
      message,
      previousDate,
      index,
    });
  }

  /** @param {ChxMessage} message @param {number} index */
  estimateExtra(message, index) {
    return this.shouldShow(message, index) ? DIVIDER_ESTIMATE : 0;
  }

  /**
   * Always a `[divider | nothing, row]` pair — switching between a bare value and an array would
   * make Lit rebuild the ChildPart and drop the row's `<chx-message>`.
   * @param {unknown} row @param {ChxMessage} message @param {number} index
   * @returns {unknown[]}
   */
  wrap(row, message, index) {
    return [this.shouldShow(message, index) ? this.#build(message, index) : nothing, row];
  }

  /** Evicts dividers for messages that didn't render this pass. @param {Set<string>} renderedMessageIds */
  sweep(renderedMessageIds) {
    for (const id of this.#cache.keys()) {
      if (!renderedMessageIds.has(id)) this.#cache.delete(id);
    }
  }

  /** @param {ChxMessage} message @param {number} index @returns {HTMLElement} */
  #build(message, index) {
    const cached = this.#cache.get(message.id);
    if (cached) return cached;
    const divider = /** @type {ChxDivider} */ (this.#element);
    const element = divider.buildDivider(divider.formatDate(message.createdAt), { message, index });
    this.#cache.set(message.id, element);
    return element;
  }
}
