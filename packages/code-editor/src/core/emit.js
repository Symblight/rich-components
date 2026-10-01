/** @param {EventTarget} target @param {string} type @param {unknown} detail */
export function emit(target, type, detail) {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}
