/** @import { TvxTreeItemData, TvxTreeItemPosition } from "../base/tree-view.js" */

/**
 * @typedef {Object} TvxScrollToItemOptions
 * @property {"start" | "center" | "end" | "nearest"} [align] - default `"nearest"`
 * @property {ScrollBehavior} [behavior]
 */

/**
 * @typedef {Object} TvxExpansionApi
 * @property {(id: PropertyKey) => void} expand
 * @property {(id: PropertyKey) => void} collapse
 * @property {(id: PropertyKey) => void} toggle
 * @property {() => void} expandAll - every loaded branch; lazily loaded children arrive collapsed
 * @property {() => void} collapseAll
 * @property {(ids: Iterable<PropertyKey>) => void} set - same as assigning `expandedItems`
 * @property {() => Set<PropertyKey>} get - a copy; not tracked in `render()`, use `TreeViewController.expandedItems`
 * @property {(id: PropertyKey) => boolean} isExpanded - `false` for unknown ids and leaves
 */

/**
 * @typedef {Object} TvxSelectionApi
 * @property {(id: PropertyKey) => void} select - no cascade
 * @property {(id: PropertyKey) => void} deselect - no cascade
 * @property {(ids: Iterable<PropertyKey>) => void} set - same as assigning `selectedItems`
 * @property {() => void} clear
 * @property {() => Set<PropertyKey>} get - a copy; not tracked in `render()`, use `TreeViewController.selectedItems`
 * @property {(id: PropertyKey) => boolean} isSelected
 * @property {(id: PropertyKey) => {selected: boolean, indeterminate: boolean}} getState - derived for branches under `checkboxSelection`
 */

/**
 * @typedef {Object} TvxNodesApi
 * @property {(id: PropertyKey) => TvxTreeItemData | null} getItem
 * @property {(id: PropertyKey) => PropertyKey | null} getParentId - `null` at the root and for unknown ids
 * @property {(parentId?: PropertyKey | null) => PropertyKey[]} getChildIds - the root without an argument; `[]` for a leaf or an unloaded branch
 * @property {(id: PropertyKey) => TvxTreeItemPosition | null} getPosition
 * @property {(id: PropertyKey, position: TvxTreeItemPosition) => boolean} move - fires cancelable `tvx-item-position-change`; whether it moved
 * @property {(event: Event) => PropertyKey | null} getIdFromEvent - the item row an event came from; `null` outside item rows
 */

/**
 * @typedef {Object} TvxEditingApi
 * @property {(id: PropertyKey) => Promise<void>} start - turns an editable item's label into a text field
 * @property {() => Promise<void>} cancel - leaves the field without saving
 * @property {() => PropertyKey | null} getEdited
 * @property {(id: PropertyKey, label: string) => boolean} updateLabel - fires cancelable `tvx-item-label-change`; whether it changed
 * @property {(id: PropertyKey) => boolean} isEditable
 */

/**
 * @typedef {Object} TvxNavigationApi
 * @property {(id: PropertyKey) => Promise<boolean>} focusItem - `false` when the item isn't visible (unknown or under a collapsed parent)
 * @property {() => PropertyKey | null} getFocused - the row holding the Tab stop; not tracked in `render()`, use `TreeViewController.focusedItem`
 * @property {(id: PropertyKey, options?: TvxScrollToItemOptions) => Promise<boolean>} scrollToItem - no focus change; `false` when not visible
 * @property {(id: PropertyKey, options?: TvxScrollToItemOptions) => Promise<boolean>} reveal - expands loaded ancestors, then `scrollToItem`; `false` if the id isn't loaded
 */

/**
 * @typedef {Object} TvxLoadingApi
 * @property {(id?: PropertyKey) => Promise<void>} reload - refetches a branch's children (the root without an id) through `dataSource`
 * @property {(id?: PropertyKey) => boolean} isLoading - the root without an id; not tracked in `render()`, use `TreeViewController.loading`
 */

/**
 * @typedef {Object} TvxTreeViewApi
 * @property {TvxExpansionApi} expansion
 * @property {TvxSelectionApi} selection
 * @property {TvxNodesApi} nodes
 * @property {TvxEditingApi} editing
 * @property {TvxNavigationApi} navigation
 * @property {TvxLoadingApi} loading
 */

/** @typedef {keyof TvxTreeViewApi} TvxTreeViewNamespace */

export {};
