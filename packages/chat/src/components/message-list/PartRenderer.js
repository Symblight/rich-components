/** @import { ChxMessage, ChxMessagePart } from "../../types/message.js" */
/** @import { ChxPartRenderer } from "../../types/adapter.js" */

/**
 * Turns one `ChxMessagePart` into the node that represents it, and owns the element cache that makes
 * that cheap. Two different cache contracts live here on purpose:
 *
 * - a consumer's `partElements` renderer is skipped while its `part` and `message` objects are the
 *   same (the stream reducer replaces both on every change); otherwise a **loose** hit (same
 *   `part.type`) hands it its own previous element back as `previousElement` to patch in place;
 * - the built-in text/html path takes a **strict** hit (same type *and* the same `part` object), so
 *   a streamed part whose text just changed rebuilds instead of showing stale content.
 *
 * Constructed with one narrow callback, no host reference — same shape `DividerController` and
 * `ReadTrackingController` use, testable without a `chx-message-list` instance.
 */
export class PartRenderer {
  /** @type {() => Record<string, ChxPartRenderer> | undefined} */
  #getPartElements;
  /** part id → its last render. @type {Map<string, {key: string, part: ChxMessagePart, message?: ChxMessage, element: string | HTMLElement}>} */
  #cache = new Map();
  /** part ids seen during the pass now in flight. @type {Set<string>} */
  #rendered = new Set();

  /** @param {{getPartElements: () => Record<string, ChxPartRenderer> | undefined}} config */
  constructor(config) {
    this.#getPartElements = config.getPartElements;
  }

  /**
   * @param {ChxMessagePart} part
   * @param {ChxMessage} message
   * @param {number} index
   * @returns {string | HTMLElement}
   */
  render(part, message, index) {
    this.#rendered.add(part.id);
    const renderer = this.#getPartElements()?.[part.type];
    if (renderer) {
      const cached = this.#cache.get(part.id);
      if (cached?.key === part.type && cached.part === part && cached.message === message)
        return cached.element;
      const previous = cached?.key === part.type ? cached.element : undefined;
      const element = renderer(
        part,
        /** @type {HTMLElement | undefined} */ (previous),
        message,
        index,
      );
      if (part.type === "attachment" && element instanceof HTMLElement)
        element.slot = "attachments";
      this.#cache.set(part.id, { key: part.type, part, message, element });
      return element;
    }
    if (part.html) return this.#renderHtml(part);
    if (part.text) return part.text;
    return this.#renderUnknown(part);
  }

  /** Forgets every cached element, so the next pass runs every factory from scratch. */
  clear() {
    this.#cache.clear();
  }

  /** Evicts every part that didn't render in the pass that just ended, and arms the next one. */
  sweep() {
    for (const id of this.#cache.keys()) {
      if (!this.#rendered.has(id)) this.#cache.delete(id);
    }
    this.#rendered.clear();
  }

  /** Plain HTML formatting (bold/italic/etc.) — rendered as-is, no rich hydration.
   * @param {ChxMessagePart} part @returns {HTMLElement} */
  #renderHtml(part) {
    const cached = this.#strictHit(part);
    if (cached !== undefined) return cached;

    // native DOM, not a Lit template — unsafeHTML() has no meaning here
    const span = document.createElement("span");
    span.innerHTML = /** @type {string} */ (part.html);
    this.#cache.set(part.id, { key: part.type, part, element: span });
    return span;
  }

  /** No renderer, no text/html — an inert marker so a missing `partElements` entry is at least visible.
   * @param {ChxMessagePart} part @returns {HTMLElement} */
  #renderUnknown(part) {
    const cached = this.#strictHit(part);
    if (cached !== undefined) return cached;

    const span = document.createElement("span");
    span.dataset.partType = part.type;
    this.#cache.set(part.id, { key: part.type, part, element: span });
    return span;
  }

  /** Same type AND the same part reference — see the class doc.
   * @param {ChxMessagePart} part @returns {HTMLElement | undefined} */
  #strictHit(part) {
    const cached = this.#cache.get(part.id);
    return cached?.key === part.type && cached.part === part
      ? /** @type {HTMLElement} */ (cached.element)
      : undefined;
  }
}
