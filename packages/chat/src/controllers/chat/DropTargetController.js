import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/adapter/drop-target-for-external";
import { containsFiles } from "@atlaskit/pragmatic-drag-and-drop/utils/contains-files";
import { getFiles } from "@atlaskit/pragmatic-drag-and-drop/utils/get-files";

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & HTMLElement} Host
 * @typedef {{onDrop: (files: File[]) => void, canDrop?: () => boolean}} DropTargetConfig
 */

/**
 * OS file drop target (pragmatic-drag-and-drop) for one host, tracking `dragging`. The host must be
 * reachable via `closest()` from a window-level listener — not nested in another shadow root.
 * @implements {ReactiveController}
 */
export class DropTargetController {
  /** @type {Host} */
  #host;
  /** @type {DropTargetConfig} */
  #config;
  /** @type {(() => void) | undefined} */
  #cleanup;
  #dragging = false;

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
    this.#cleanup = dropTargetForExternal({
      element: this.#host,
      canDrop: ({ source }) => containsFiles({ source }) && (this.#config.canDrop?.() ?? true),
      onDragEnter: () => this.#setDragging(true),
      onDragLeave: () => this.#setDragging(false),
      onDrop: ({ source }) => {
        this.#setDragging(false);
        const files = getFiles({ source });
        if (files.length > 0) this.#config.onDrop(files);
      },
    });
  }

  hostDisconnected() {
    this.#cleanup?.();
    this.#cleanup = undefined;
  }

  /** @param {boolean} value */
  #setDragging(value) {
    if (this.#dragging === value) return;
    this.#dragging = value;
    this.#host.requestUpdate();
  }
}
