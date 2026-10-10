/** @import { TvxTreeViewApi } from "../types/api.js" */

const noop = () => {};
const resolved = async () => {};
const notDone = async () => false;

/**
 * Freezes the top level and every namespace object.
 * @template {Record<string, Record<string, (...args: any[]) => any>>} Api
 * @param {Api} api
 * @returns {Api}
 */
export function freezeApi(api) {
  for (const ns of Object.values(api)) Object.freeze(ns);
  return Object.freeze(api);
}

/** No-op fallbacks for a `TreeViewController` with no tree — also the single checked list of method names. */
export const TREE_VIEW_API_DEFAULTS = freezeApi(
  /** @type {TvxTreeViewApi} */ ({
    expansion: {
      expand: noop,
      collapse: noop,
      toggle: noop,
      expandAll: noop,
      collapseAll: noop,
      set: noop,
      get: () => new Set(),
      isExpanded: () => false,
    },
    selection: {
      select: noop,
      deselect: noop,
      set: noop,
      clear: noop,
      get: () => new Set(),
      isSelected: () => false,
      getState: () => ({ selected: false, indeterminate: false }),
    },
    nodes: {
      getItem: () => null,
      getParentId: () => null,
      getChildIds: () => [],
      getPosition: () => null,
      move: () => false,
      getIdFromEvent: () => null,
    },
    editing: {
      start: resolved,
      cancel: resolved,
      getEdited: () => null,
      updateLabel: () => false,
      isEditable: () => false,
    },
    navigation: {
      focusItem: notDone,
      getFocused: () => null,
      scrollToItem: notDone,
      reveal: notDone,
    },
    loading: {
      reload: resolved,
      isLoading: () => false,
    },
  }),
);
