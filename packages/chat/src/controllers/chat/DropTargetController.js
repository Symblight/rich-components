/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & HTMLElement} Host
 * @typedef {{onDrop: (files: File[]) => void, canDrop?: () => boolean}} DropTargetConfig
 */

/**
 * OS file drop target for one host, tracking `dragging`. Listens for native drag events on the
 * host itself: they're composed, so they reach it from its own shadow tree and from slotted
 * children, however deep the host sits in other shadow roots. (pragmatic-drag-and-drop's external
 * adapter resolved the target with `closest()` from a window listener, which only sees the
 * outermost retargeted host — a chat nested in another component's shadow root never got a drop.)
 * @implements {ReactiveController}
 */
export class DropTargetController {
  /** @type {Host} */
  #host;
  /** @type {DropTargetConfig} */
  #config;
  #dragging = false;
  /** `dragenter`s not yet matched by a `dragleave` — moving between descendants fires both. */
  #depth = 0;

  /** @param {Host} host @param {DropTargetConfig} config */
  constructor(host, config) {
    this.#host = host;
    this.#config = config;
    host.addController(this);
  }

  /** An OS file drag carrying files is over the host. */
  get dragging() {
    return this.#dragging;
  }

  hostConnected() {
    this.#host.addEventListener("dragenter", this.#onDragEnter);
    this.#host.addEventListener("dragover", this.#onDragOver);
    this.#host.addEventListener("dragleave", this.#onDragLeave);
    this.#host.addEventListener("drop", this.#onDrop);
  }

  hostDisconnected() {
    this.#host.removeEventListener("dragenter", this.#onDragEnter);
    this.#host.removeEventListener("dragover", this.#onDragOver);
    this.#host.removeEventListener("dragleave", this.#onDragLeave);
    this.#host.removeEventListener("drop", this.#onDrop);
    this.#reset();
  }

  /** @param {DragEvent} event */
  #accepts(event) {
    // Only `types` is readable while dragging; `files` stays empty until the drop.
    return !!event.dataTransfer?.types.includes("Files") && (this.#config.canDrop?.() ?? true);
  }

  /** @param {DragEvent} event */
  #onDragEnter = (event) => {
    if (!this.#accepts(event)) return;
    event.preventDefault();
    this.#depth++;
    this.#setDragging(true);
  };

  /** @param {DragEvent} event */
  #onDragOver = (event) => {
    if (!this.#accepts(event)) return;
    // Cancelling `dragover` is what makes the host a valid drop target.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    this.#setDragging(true);
  };

  #onDragLeave = () => {
    if (this.#depth === 0) return;
    this.#depth--;
    if (this.#depth === 0) this.#setDragging(false);
  };

  /** @param {DragEvent} event */
  #onDrop = (event) => {
    if (!this.#accepts(event)) return;
    // Otherwise the webview navigates to the dropped file.
    event.preventDefault();
    this.#reset();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.#config.onDrop(files);
  };

  #reset() {
    this.#depth = 0;
    this.#setDragging(false);
  }

  /** @param {boolean} value */
  #setDragging(value) {
    if (this.#dragging === value) return;
    this.#dragging = value;
    this.#host.requestUpdate();
  }
}
