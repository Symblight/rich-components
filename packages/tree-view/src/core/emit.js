/** Dispatches a bubbling, composed `CustomEvent`; returns `false` if a cancelable one was prevented.
 * @param {EventTarget} target
 * @param {string} type
 * @param {unknown} detail
 * @param {boolean} [cancelable] */
export function emit(target, type, detail, cancelable = false) {
  return target.dispatchEvent(
    new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }),
  );
}
