import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item/attach-instruction";
import { extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item/extract-instruction";

import { emit } from "../core/emit.js";

/** @typedef {"before" | "after" | "into"} DropZone */
/** @typedef {{ clientX: number, clientY: number }} PointerInput */

/** Maps a pdnd hitbox instruction to where the dragged item lands. */
const ZONES = /** @type {Record<string, DropZone>} */ ({
  "reorder-above": "before",
  "reorder-below": "after",
  "make-child": "into",
});

/**
 * Drag-and-drop and Alt+↑/↓ reordering. Fires cancelable `tvx-item-position-change`, then moves the
 * item in the model — the consumer's `.items` is never mutated.
 *
 * pdnd finds elements through `event.target`, which the browser retargets to the host for anything
 * inside its shadow root. So the host itself is the one draggable and drop target, and the row under
 * the pointer is looked up with `shadowRoot.elementFromPoint()`.
 */
export class ReorderController {
  /** @type {(() => void) | null} */
  #cleanup = null;
  /** Row currently showing a drop indicator. @type {HTMLElement | null} */
  #indicatorRow = null;
  /** @type {(id: PropertyKey) => Promise<unknown>} */
  #focusItem;

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./tree-model-controller.js").TreeModelController} model
   * @param {(id: PropertyKey) => Promise<unknown>} focusItem host seam: moves the Tab stop and focus
   */
  constructor(host, model, focusItem) {
    this.host = host;
    this.model = model;
    this.#focusItem = focusItem;
    host.addController(this);
  }

  hostUpdated() {
    if (this.host.reordering && !this.#cleanup) this.#cleanup = this.#register();
    if (!this.host.reordering && this.#cleanup) this.#unregister();
  }

  hostDisconnected() {
    this.#unregister();
  }

  /** @param {PropertyKey} id */
  canDrag(id) {
    if (this.model.isDisabled(id)) return false;
    return this.host.isItemReorderable?.(this.model.item(id)) ?? true;
  }

  /** Alt+↑/↓: swap places with the previous/next sibling.
   * @param {PropertyKey} id
   * @param {-1 | 1} step */
  moveBySibling(id, step) {
    if (!this.canDrag(id)) return;
    const { parentId, index } = this.model.position(id);
    const sibling = this.model.childIds(parentId)[index + step];
    if (sibling === undefined) return;
    if (this.#move(id, sibling, step < 0 ? "before" : "after")) this.#focusItem(id);
  }

  #register() {
    const cleanupDrag = draggable({
      element: this.host,
      canDrag: ({ input }) => {
        const hit = this.#hitAt(input);
        return !!hit && !hit.onControl && this.canDrag(hit.id);
      },
      getInitialData: ({ input }) => ({ tree: this.host, key: this.#hitAt(input)?.id }),
      // preview just the dragged row, not the whole tree
      onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
        const { input } = location.initial;
        const row = this.#hitAt(input)?.row;
        if (!row || !nativeSetDragImage) return;
        const rect = row.getBoundingClientRect();
        nativeSetDragImage(row, input.clientX - rect.left, input.clientY - rect.top);
      },
    });

    const cleanupDrop = dropTargetForElements({
      element: this.host,
      canDrop: ({ source }) => source.data.tree === this.host, // only rows from this tree
      getData: ({ input, source }) =>
        this.#dropData(input, /** @type {PropertyKey} */ (source.data.key)),
      onDrag: ({ self }) => this.#showIndicator(self.data),
      onDragLeave: () => this.#showIndicator(null),
      onDrop: ({ source, self }) => {
        this.#showIndicator(null);
        const zone = ZONES[extractInstruction(self.data)?.type ?? ""];
        if (!zone) return;
        const sourceId = /** @type {PropertyKey} */ (source.data.key);
        const targetId = /** @type {PropertyKey} */ (self.data.targetId);
        // next frame: re-rendering inside pdnd's own onDrop can leave it stuck mid-drag
        requestAnimationFrame(() => this.#move(sourceId, targetId, zone));
      },
    });

    return () => {
      cleanupDrag();
      cleanupDrop();
    };
  }

  #unregister() {
    this.#cleanup?.();
    this.#cleanup = null;
    this.#showIndicator(null);
  }

  /** The item row under the pointer, and whether the pointer is on its chevron/checkbox.
   * @param {PointerInput} input */
  #hitAt(input) {
    const root = /** @type {ShadowRoot} */ (this.host.renderRoot);
    const hit = root.elementFromPoint(input.clientX, input.clientY);
    const row = /** @type {HTMLElement | null | undefined} */ (hit?.closest(".tree-view__item"));
    const id = row ? this.model.idAt(Number(row.dataset.index)) : null;
    if (!row || id === null) return null;
    const onControl = !!hit?.closest(
      ".tree-view__chevron, .tree-view__checkbox, .tree-view__label_editing",
    );
    return { row, id, onControl };
  }

  /** Where a drop at `input` would land; empty data (no instruction) when it isn't allowed.
   * @param {import("@atlaskit/pragmatic-drag-and-drop/types").Input} input
   * @param {PropertyKey} sourceId */
  #dropData(input, sourceId) {
    const hit = this.#hitAt(input);
    if (!hit) return {};
    const { row, id } = hit;
    if (id === sourceId || this.model.isDisabled(id) || this.model.isAncestor(sourceId, id)) {
      return {};
    }
    return attachInstruction(
      { targetId: id, row },
      {
        element: row,
        input,
        currentLevel: this.model.rows[Number(row.dataset.index)]?.level ?? 1,
        indentPerLevel: 20, // only shapes the hitbox; doesn't need to match the real indent
        mode: this.model.isExpanded(id) ? "expanded" : "standard",
        block: this.model.hasChildren(id) ? ["reparent"] : ["reparent", "make-child"],
      },
    );
  }

  /** Moves the drop indicator to the row in `data` (or clears it).
   * @param {Record<string | symbol, unknown> | null} data */
  #showIndicator(data) {
    const row = /** @type {HTMLElement | undefined} */ (data?.row) ?? null;
    if (this.#indicatorRow && this.#indicatorRow !== row)
      setIndicator(this.#indicatorRow, undefined);
    this.#indicatorRow = row;
    if (row && data) setIndicator(row, extractInstruction(data)?.type);
  }

  /**
   * @param {PropertyKey} sourceId
   * @param {PropertyKey} targetId
   * @param {DropZone} zone
   * @returns {boolean} whether the item moved (the event wasn't prevented)
   */
  #move(sourceId, targetId, zone) {
    if (zone === "into") return this.moveTo(sourceId, { parentId: targetId, index: 0 });
    // new index is counted among the siblings without the moved item itself
    const parentId = this.model.parentId(targetId);
    const siblings = this.model.childIds(parentId).filter((id) => id !== sourceId);
    const index = siblings.indexOf(targetId) + (zone === "after" ? 1 : 0);
    return this.moveTo(sourceId, { parentId, index });
  }

  /**
   * Fires cancelable `tvx-item-position-change`, then moves. Not gated by `reordering` /
   * `isItemReorderable` — those only gate gestures. Impossible or no-op moves return `false`
   * without an event.
   * @param {PropertyKey} id
   * @param {import("../base/tree-view.js").TvxTreeItemPosition} newPosition `index` counted without `id`
   * @returns {boolean} whether the item moved
   */
  moveTo(id, newPosition) {
    const { model } = this;
    const { parentId, index } = newPosition;
    if (!model.has(id)) return false;
    if (
      parentId !== null &&
      (parentId === id || !model.hasChildren(parentId) || model.isAncestor(id, parentId))
    ) {
      return false;
    }
    const siblings = model.childIds(parentId).filter((sibling) => sibling !== id);
    if (!Number.isInteger(index) || index < 0 || index > siblings.length) return false;

    const oldPosition = model.position(id);
    if (oldPosition.parentId === parentId && oldPosition.index === index) return false;
    const detail = { id, oldPosition, newPosition: { parentId, index } };
    if (!emit(this.host, "tvx-item-position-change", detail, true)) return false;

    model.move(id, parentId, index);
    return true;
  }
}

/** `data-drop-target` (into) or `data-drop-edge` (above/below) on a row; `undefined` clears both.
 * @param {HTMLElement} row
 * @param {string | undefined} instruction */
function setIndicator(row, instruction) {
  row.toggleAttribute("data-drop-target", instruction === "make-child");
  if (instruction === "reorder-above") row.setAttribute("data-drop-edge", "top");
  else if (instruction === "reorder-below") row.setAttribute("data-drop-edge", "bottom");
  else row.removeAttribute("data-drop-edge");
}
