/** @param {EventTarget} target @param {string} type @param {unknown} detail */
export function emit(target, type, detail) {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/** @param {EventTarget} target @param {string} type @param {unknown} detail
 *  @returns {boolean} whether a listener called `preventDefault()` */
export function emitCancelable(target, type, detail) {
  const event = new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}
