import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/adapter/drop-target-for-external";
import { containsFiles } from "@atlaskit/pragmatic-drag-and-drop/utils/contains-files";
import { getFiles } from "@atlaskit/pragmatic-drag-and-drop/utils/get-files";

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Wraps @atlaskit/pragmatic-drag-and-drop's external (OS file) drop target
 * for a single host element — registers on `hostConnected`/tears down on
 * `hostDisconnected`, tracks `dragging` for a dashed-border/hint visual
 * state, and hands accepted files to `onDrop`. Deliberately generic — it
 * doesn't know about `chx-attachments`/slots, that's the host's job (see
 * `chx-chat`'s own `onDrop`/`canDrop` wiring). Must be registered on a host
 * that's reachable via `Element.closest()` from a `window`-level listener —
 * i.e. not nested inside another component's shadow root, found live while
 * chasing why a drop target inside a shadow-nested host never fired.
 * @implements {ReactiveController}
 */
export class DropTargetController {
  /**
   * @param {ReactiveControllerHost & HTMLElement} host
   * @param {{onDrop: (files: File[]) => void, canDrop?: () => boolean}} options
   */
  constructor(host, options) {
    /** @type {ReactiveControllerHost & HTMLElement} */
    this.host = host;

    /** @type {(files: File[]) => void} */
    this.onDrop = options.onDrop;

    /** @type {() => boolean} Extra host-level gate alongside the built-in "carries files" check. */
    this.canDrop = options.canDrop ?? (() => true);

    /** @type {boolean} True while an OS file drag carrying files is over the host. */
    this.dragging = false;

    /** @type {(() => void) | undefined} */
    this._cleanup = undefined;

    host.addController(this);
  }

  /** @param {boolean} value */
  setDragging(value) {
    if (this.dragging === value) return;
    this.dragging = value;
    this.host.requestUpdate();
  }

  hostConnected() {
    this._cleanup = dropTargetForExternal({
      element: this.host,
      canDrop: ({ source }) => containsFiles({ source }) && this.canDrop(),
      onDragEnter: () => this.setDragging(true),
      onDragLeave: () => this.setDragging(false),
      onDrop: ({ source }) => {
        this.setDragging(false);
        const files = getFiles({ source });
        if (files.length > 0) this.onDrop(files);
      },
    });
  }

  hostDisconnected() {
    this._cleanup?.();
    this._cleanup = undefined;
  }
}
