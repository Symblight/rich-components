import { emit } from "../core/emit.js";
import { walkIndexTree } from "../core/index-tree.js";

/**
 * Selected ids. Single mode keeps one id. Multi mode is MUI-style (mirrors data-grid's
 * `RowSelectionController`): click replaces, Ctrl/Cmd+click toggles, Shift+click adds or removes a
 * range from the last clicked item (the anchor). Checkboxes cascade through a branch's subtree.
 */
export class SelectionController {
  /** @type {Set<PropertyKey>} */
  selected = new Set();
  /** @type {PropertyKey | null} */
  #anchor = null;
  /** Checkbox state per branch, cached until the selection or the tree structure changes.
   * @type {Map<PropertyKey, { checked: boolean, indeterminate: boolean }>} */
  #checkboxStates = new Map();
  /** The `selected` set the cached states were computed from. @type {Set<PropertyKey> | null} */
  #statesSelected = null;
  /** The `model.structureVersion` the cached states were computed from. */
  #statesStructureVersion = -1;

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {import("./tree-model-controller.js").TreeModelController} model
   */
  constructor(host, model) {
    this.host = host;
    this.model = model;
  }

  /** What a row shows. Under `checkboxSelection` a branch is derived from its subtree.
   * @param {PropertyKey} id */
  stateOf(id) {
    if (this.host.checkboxSelection && this.model.hasChildren(id)) {
      const state = this.#getCheckboxStates().get(id);
      return { selected: !!state?.checked, indeterminate: !!state?.indeterminate };
    }
    return { selected: this.selected.has(id), indeterminate: false };
  }

  /** Row click or Space. Modifiers only matter in multi-select.
   * @param {PropertyKey} id
   * @param {{ ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean }} [modifiers] */
  activate(id, { ctrlKey = false, metaKey = false, shiftKey = false } = {}) {
    if (!this.#canSelect(id)) return;
    const multi = this.host.multiSelect;
    if (multi && shiftKey && this.#anchor !== null) return this.#selectRange(id);
    if (multi && (ctrlKey || metaKey)) return this.setSelected(id, !this.selected.has(id));
    this.#anchor = id;
    this.#commit(new Set([id])); // plain click: only this item
  }

  /** Selects or deselects one item, no cascade — backs `selection.select/deselect`.
   * In single-select, selecting replaces the current selection.
   * @param {PropertyKey} id
   * @param {boolean} selected */
  setSelected(id, selected) {
    if (!this.#canSelect(id)) return;
    if (!selected && !this.selected.has(id)) return; // nothing to deselect
    const next = this.host.multiSelect ? new Set(this.selected) : new Set();
    if (selected) next.add(id);
    else next.delete(id);
    this.#anchor = id;
    this.#commit(next);
  }

  /** Checkbox click: toggles the whole subtree, then re-checks each ancestor (checked = all children checked).
   * @param {PropertyKey} id */
  toggleCascading(id) {
    const node = this.model.node(id);
    if (!node || !this.#canSelect(id)) return;
    const subtree = [...walkIndexTree(node)].map((n) => /** @type {PropertyKey} */ (n.key));
    const select = !this.stateOf(id).selected; // what the checkbox shows, not raw membership
    const next = new Set(this.selected);
    for (const key of subtree) {
      if (select) next.add(key);
      else next.delete(key);
    }
    // the root's key is null — stop below it
    for (let p = node.parent; p && p.key !== null; p = p.parent) {
      if (p.children?.every((n) => next.has(/** @type {PropertyKey} */ (n.key)))) next.add(p.key);
      else next.delete(p.key);
    }
    this.#commit(next);
  }

  /** Deselects everything; no event when nothing was selected. */
  clear() {
    if (this.selected.size > 0) this.setSelectedItems([]);
  }

  /** @param {Iterable<PropertyKey>} ids */
  setSelectedItems(ids) {
    this.#anchor = null;
    this.#commit(new Set(ids));
  }

  /** @param {PropertyKey} id */
  #canSelect(id) {
    return !this.host.disableSelection && !this.model.isDisabled(id);
  }

  /**
   * Shift+click, merged into the current selection. Clicking an unselected item adds
   * anchor..target; clicking a selected one removes anchor..(one before target). The anchor moves.
   * @param {PropertyKey} targetId */
  #selectRange(targetId) {
    const from = this.model.indexOf(/** @type {PropertyKey} */ (this.#anchor));
    const to = this.model.indexOf(targetId);
    if (from === -1 || to === -1) return;

    const adding = !this.selected.has(targetId);
    if (!adding && from === to) return;
    const end = adding ? to : to + Math.sign(from - to); // shrinking keeps the clicked item

    const next = new Set(this.selected);
    for (let i = Math.min(from, end); i <= Math.max(from, end); i++) {
      const id = this.model.idAt(i);
      if (id === null || this.model.isDisabled(id)) continue;
      if (adding) next.add(id);
      else next.delete(id);
    }
    this.#anchor = targetId;
    this.#commit(next);
  }

  /** @param {Set<PropertyKey>} next */
  #commit(next) {
    this.selected = next;
    this.host.requestUpdate();
    emit(this.host, "tvx-selection-change", { selectedItems: new Set(next) });
  }

  /** Branch checked = all children checked; indeterminate = only some. The branch's own id is
   * ignored, so leaf-only selections (e.g. `defaultSelectedItems`) render the same as clicks. */
  #getCheckboxStates() {
    const upToDate =
      this.#statesSelected === this.selected &&
      this.#statesStructureVersion === this.model.structureVersion;
    if (upToDate) return this.#checkboxStates;

    this.#statesSelected = this.selected;
    this.#statesStructureVersion = this.model.structureVersion;
    const states = new Map();
    /** @param {import("./tree-model-controller.js").TreeNode} node
     * @returns {{ checked: boolean, indeterminate: boolean }} */
    const count = (node) => {
      const id = /** @type {PropertyKey} */ (node.key);
      const children = node.children ?? [];
      // no loaded children (leaf or unloaded async branch): its own id decides
      let state = { checked: this.selected.has(id), indeterminate: false };
      if (children.length > 0) {
        let checked = 0;
        let partial = false;
        for (const child of children) {
          const childState = count(child);
          if (childState.checked) checked++;
          else if (childState.indeterminate) partial = true;
        }
        state = {
          checked: checked === children.length,
          indeterminate: partial || (checked > 0 && checked < children.length),
        };
      }
      states.set(id, state);
      return state;
    };
    this.model.tree.children?.forEach(count);
    this.#checkboxStates = states;
    return states;
  }
}
