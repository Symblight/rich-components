/**
 * @typedef {Object} InlinePartRule
 * @property {string} type - the resulting part's `type`
 * @property {string} selector - CSS selector matching the placeholder element serialized into a message's `html`
 * @property {(element: HTMLElement) => Record<string, unknown>} toPart - element -> extra fields merged into the part
 */

export {};
