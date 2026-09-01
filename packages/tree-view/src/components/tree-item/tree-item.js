import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { ContextConsumer } from "@lit/context";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item/attach-instruction";
import { extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item/extract-instruction";

import "@symblight/wc-material/checkbox";
import "@symblight/wc-material/progress-circular";
import "../item-sub-tree/item-sub-tree.js";

import { treeViewContext } from "../../base/tree-view-context.js";
import styles from "./tree-item.css?inline";

let nextLabelId = 0;

/** Nearest tree-item ancestor, skipping a tvx-item-sub-tree wrapper.
 * @param {Element} el
 * @returns {TvxTreeItem | null} */
export function closestTreeItemParent(el) {
  let parent = el.parentElement;
  if (parent?.tagName === "TVX-ITEM-SUB-TREE") parent = parent.parentElement;
  return parent?.tagName === "TVX-TREE-ITEM" ? /** @type {TvxTreeItem} */ (parent) : null;
}

/** @tag tvx-tree-item */
@customElement("tvx-tree-item")
export class TvxTreeItem extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    key: { type: String, reflect: true },
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
    expanded: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true },
    indeterminate: { type: Boolean, reflect: true },
    loading: { type: Boolean, reflect: true },
    hasChildren: { type: Boolean, reflect: true, attribute: "has-children" },
    childCount: { type: Number, attribute: "child-count" },
    level: { type: Number, reflect: true, attribute: "aria-level" },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {PropertyKey} */
    this.key = "";
    this.label = "";
    this.disabled = false;
    this.expanded = false;
    this.selected = false;
    /** Under `checkboxSelection`, true when some (not all) of this branch's descendants are
     * selected — meaningless (always false) on a leaf. Driven entirely by `SelectionController`,
     * derived fresh from the subtree on every selection change, never set directly. */
    this.indeterminate = false;
    this.loading = false;
    this.hasChildren = false;
    /** @type {number | undefined} */
    this.childCount = undefined;
    this.level = 1;

    this._labelId = `tvx-tree-item-label-${nextLabelId++}`;
    /** Set for real in `_claimSubTree()` (connectedCallback), always before the first render. */
    this._hasLabelOverride = false;
    /** @type {import("../item-sub-tree/item-sub-tree.js").TvxItemSubTree | null} */
    this._subTreeEl = null;

    /** @private */
    this._treeConsumer = new ContextConsumer(this, { context: treeViewContext, subscribe: true });

    /** @type {(() => void) | null} */
    this._dragCleanup = null;
    /** @type {(() => void) | null} */
    this._dropCleanup = null;
    /** @type {string | null} */
    this._reorderFingerprint = null;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute("role")) this.setAttribute("role", "treeitem");
    // Native IDL-reflected property (unlike Lit's own declared properties, this reflects to the
    // `tabindex` attribute synchronously) — setting it in the constructor instead throws
    // "the result must not have attributes" per the custom-elements spec.
    if (!this.hasAttribute("tabindex")) this.tabIndex = -1;
    this.setAttribute("aria-labelledby", this._labelId);
    this.level = this._computeLevel();
    this.#claimSubTree();
    this.#syncAria();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#teardownReordering();
    // Forces #syncReordering() to re-register on reconnect even if enabled/canDrag/hasChildren/
    // expanded end up unchanged — otherwise a reorder move (disconnect+reconnect via insertBefore/
    // prepend) leaves this item's pdnd hooks torn down with no re-registration.
    this._reorderFingerprint = null;
  }

  /** @param {import("lit").PropertyValues} changed */
  updated(changed) {
    if (changed.has("hasChildren") || changed.has("expanded") || changed.has("selected")) {
      this.#syncAria();
    }
    if (changed.has("expanded") && this._subTreeEl) {
      this._subTreeEl.hidden = !this.expanded;
    }
    this.#syncReordering();
  }

  /** `aria-expanded` exists only while this node has/might have children; `aria-selected` is always present. */
  #syncAria() {
    if (this.hasChildren) this.setAttribute("aria-expanded", String(this.expanded));
    else this.removeAttribute("aria-expanded");
    this.setAttribute("aria-selected", String(this.selected));
  }

  /** 1-indexed nesting depth — self-computed by walking `tvx-tree-item` ancestors. */
  _computeLevel() {
    let level = 1;
    let parent = this.parentElement;
    while (parent && parent.tagName !== "TVX-TREE-VIEW") {
      if (parent.tagName === "TVX-TREE-ITEM") level++;
      parent = parent.parentElement;
    }
    return level;
  }

  /** Finds a light-DOM sub-tree child, auto-slots it, and infers hasChildren/label-override. */
  #claimSubTree() {
    let hasLabelOverride = false;
    for (const node of this.childNodes) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        /** @type {Element} */ (node).tagName === "TVX-ITEM-SUB-TREE"
      ) {
        const subTree = /** @type {HTMLElement} */ (node);
        if (!subTree.hasAttribute("slot")) subTree.slot = "sub-tree";
        this._subTreeEl =
          /** @type {import("../item-sub-tree/item-sub-tree.js").TvxItemSubTree} */ (subTree);
        this.hasChildren = true;
        continue;
      }
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        !(/** @type {Element} */ (node).hasAttribute("slot"))
      ) {
        hasLabelOverride = true;
      } else if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "") {
        hasLabelOverride = true;
      }
    }
    this._hasLabelOverride = hasLabelOverride;
    if (this._subTreeEl) this._subTreeEl.hidden = !this.expanded;
  }

  /** Returns this item's sub-tree, creating one (auto-slotted) if it doesn't have one yet.
   * @returns {import("../item-sub-tree/item-sub-tree.js").TvxItemSubTree} */
  _ensureSubTree() {
    if (!this._subTreeEl) {
      const subTree = /** @type {import("../item-sub-tree/item-sub-tree.js").TvxItemSubTree} */ (
        document.createElement("tvx-item-sub-tree")
      );
      subTree.slot = "sub-tree";
      subTree.hidden = !this.expanded;
      this.append(subTree);
      this._subTreeEl = subTree;
      this.hasChildren = true;
    }
    return this._subTreeEl;
  }

  get render_disableSelection() {
    return !!this._treeConsumer.value?.disableSelection;
  }

  /** A checkbox renders whenever `checkboxSelection` is set, independent of `multiSelect` — but
   * never alongside `disableSelection`, where it could never actually be checked. */
  get render_checkboxSelection() {
    return !!this._treeConsumer.value?.checkboxSelection && !this.render_disableSelection;
  }

  /** Registers/unregisters this item as a pdnd drag source and/or drop target; fingerprint-guarded so unrelated property changes don't re-run it. */
  #syncReordering() {
    const ctx = this._treeConsumer.value;
    const enabled = !!ctx?.reordering && !this.disabled;
    const canDrag = enabled && (ctx?.isItemReorderable ? ctx.isItemReorderable(this) : true);
    const fingerprint = `${enabled}|${canDrag}|${this.hasChildren}|${this.expanded}`;
    if (fingerprint === this._reorderFingerprint) return;
    this._reorderFingerprint = fingerprint;

    this.#teardownReordering();
    // A `disabled` item gets neither drag nor drop registration at all — it can't be picked up,
    // and (unlike a merely non-`isItemReorderable` item) it doesn't accept drops either, matching
    // `disabled` being excluded from every other interaction elsewhere in this component.
    if (!enabled || !this.isConnected) return;

    if (canDrag) {
      this._dragCleanup = draggable({
        element: this,
        // Excludes the chevron/checkbox from starting a drag; hit-tests via renderRoot since pdnd's
        // own `dragHandle` option can't scope into a shadow-DOM element.
        canDrag: ({ input }) => !this.#isOnChevronOrCheckbox(input),
        getInitialData: () => ({ key: this.key }),
        // Renders just `.tree-item__row` as the drag preview instead of the whole host element,
        // which would otherwise include the expanded subtree slotted below it.
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
            render: ({ container }) => this.#renderDragPreview(container),
          });
        },
      });
    }

    this._dropCleanup = dropTargetForElements({
      element: this,
      canDrop: (args) => this.#canAcceptDrop(args),
      getData: (args) => this.#attachDropInstruction(args.input),
      onDrag: (args) => {
        if (this.#isInnermostDropTarget(args)) {
          this.#applyDropInstruction(extractInstruction(args.self.data));
        } else {
          this.#clearDropIndicator();
        }
      },
      onDragLeave: () => this.#clearDropIndicator(),
      onDrop: (args) => {
        if (this.#isInnermostDropTarget(args)) this.#onReorderDrop(args);
        else this.#clearDropIndicator();
      },
    });
  }

  /** Clones just the shadow-DOM row into `container`'s shadow root, reusing this component's stylesheet and host attributes.
   * @param {HTMLElement} container
   * @returns {() => void} */
  #renderDragPreview(container) {
    for (const attr of ["selected", "disabled", "loading"]) {
      if (this.hasAttribute(attr)) container.setAttribute(attr, this.getAttribute(attr) ?? "");
    }
    const shadow = container.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = /** @type {ShadowRoot} */ (this.shadowRoot).adoptedStyleSheets;
    const row = /** @type {HTMLElement} */ (
      /** @type {ShadowRoot} */ (this.shadowRoot).querySelector(".tree-item__row")
    ).cloneNode(true);
    container.style.width = `${this.getBoundingClientRect().width}px`;
    shadow.append(row);
    return () => {};
  }

  /** Without this guard, pdnd fires onDrag/onDrop on every ancestor drop target, not just the hovered one.
   * @param {{ location: { current: { dropTargets: { element: Element }[] } } }} args */
  #isInnermostDropTarget(args) {
    return args.location.current.dropTargets[0]?.element === this;
  }

  /**
   * @param {{ clientX: number, clientY: number }} input
   * @returns {boolean}
   */
  #isOnChevronOrCheckbox(input) {
    const shadow = /** @type {ShadowRoot} */ (this.renderRoot);
    const hit = shadow.elementFromPoint?.(input.clientX, input.clientY);
    return !!hit?.closest(".tree-item__chevron, .tree-item__checkbox");
  }

  #teardownReordering() {
    this._dragCleanup?.();
    this._dragCleanup = null;
    this._dropCleanup?.();
    this._dropCleanup = null;
    this.#clearDropIndicator();
  }

  /** Rejects dropping onto itself, its own descendants, or a `disabled` target.
   * @param {{ source: { data: Record<string, unknown> } }} args */
  #canAcceptDrop(args) {
    if (this.disabled) return false;
    const sourceKey = /** @type {PropertyKey} */ (args.source.data.key);
    if (sourceKey === this.key) return false;
    const tree = /** @type {import("../../base/tree-view.js").TvxTreeView | null} */ (
      this.closest("tvx-tree-view")
    );
    const sourceEl = tree?.getItemByKey(sourceKey);
    if (sourceEl && sourceEl.contains(this)) return false;
    return true;
  }

  /**
   * @param {import("@atlaskit/pragmatic-drag-and-drop/types").Input} input
   */
  #attachDropInstruction(input) {
    /** @type {import("@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item").Instruction["type"][]} */
    const block = ["reparent"]; // multi-level reparent via horizontal drag — not designed for v1
    if (!this.hasChildren) block.push("make-child");
    return attachInstruction(
      { key: this.key },
      {
        element: this,
        input,
        currentLevel: this.level,
        indentPerLevel: this.#indentPerLevelPx(),
        mode: this.hasChildren && this.expanded ? "expanded" : "standard",
        block,
      },
    );
  }

  /** Rough px-per-level estimate for the hitbox's horizontal geometry — doesn't need to be exact. */
  #indentPerLevelPx() {
    const fontSize = parseFloat(getComputedStyle(this).fontSize);
    return (Number.isFinite(fontSize) ? fontSize : 16) * 1.25;
  }

  /** @param {import("@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item").Instruction | null} instruction */
  #applyDropInstruction(instruction) {
    this.#clearDropIndicator();
    if (!instruction) return;
    if (instruction.type === "make-child") this.setAttribute("drop-target", "");
    else if (instruction.type === "reorder-above") this.setAttribute("data-drop-edge", "top");
    else if (instruction.type === "reorder-below") this.setAttribute("data-drop-edge", "bottom");
  }

  #clearDropIndicator() {
    this.removeAttribute("drop-target");
    this.removeAttribute("data-drop-edge");
  }

  /**
   * @param {{ source: { data: Record<string, unknown> }, self: { data: Record<string | symbol, unknown> } }} args
   */
  #onReorderDrop(args) {
    this.#clearDropIndicator();
    const instruction = extractInstruction(args.self.data);
    if (!instruction || instruction.type === "instruction-blocked") return;
    const zone =
      instruction.type === "make-child"
        ? "into"
        : instruction.type === "reorder-above"
          ? "before"
          : "after";
    this.dispatchEvent(
      new CustomEvent("tvx-tree-item-reorder-drop", {
        detail: { sourceKey: args.source.data.key, targetKey: this.key, zone },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** @param {Event} event */
  #onChevronClick(event) {
    if (!this.hasChildren) return;
    event.stopPropagation();
    this.#dispatchToggle();
  }

  /** Row click: toggles expansion (when the row has children) and selects — both together, not
   * either/or. `#activate()` itself no-ops selection-wise when selection is disabled. When
   * `checkboxSelection` is on, selecting is exclusively the checkbox's job — a row click still
   * toggles expansion but never selects, mirroring data-grid's `disableRowSelectionOnClick`.
   * @param {MouseEvent} event */
  #onRowClick(event) {
    if (this.hasChildren) this.#dispatchToggle();
    if (!this._treeConsumer.value?.checkboxSelection) this.#activate(event);
  }

  /** Checkbox click always toggles just this item — independent of the ctrl/shift-click modifiers
   * a plain row click uses in multi-select mode.
   * @param {Event} event */
  #onCheckboxClick(event) {
    event.stopPropagation();
    this.#activate(undefined, { checkbox: true });
  }

  /** @param {MouseEvent} [event] Modifier keys drive multi-select ctrl/cmd+click and shift+click; absent for a keyboard- or checkbox-triggered activation.
   * @param {{ checkbox?: boolean }} [options] `checkbox: true` toggles just this item, bypassing the modifier-driven row-click semantics. */
  #activate(event, { checkbox = false } = {}) {
    if (this.loading) return;
    this.dispatchEvent(
      new CustomEvent("tvx-tree-item-activate", {
        detail: {
          item: this,
          ctrlKey: !!event?.ctrlKey,
          metaKey: !!event?.metaKey,
          shiftKey: !!event?.shiftKey,
          checkbox,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #dispatchToggle() {
    this.dispatchEvent(
      new CustomEvent("tvx-tree-item-toggle", {
        detail: { item: this },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #renderChevron() {
    return html`<svg class="tree-item__chevron-icon" viewBox="0 0 24 24">
      <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
    </svg>`;
  }

  render() {
    if (this.loading) {
      return html`
        <div class="tree-item__row" part="row">
          <span class="tree-item__spinner" part="spinner" aria-hidden="true">
            <md-progress-circular></md-progress-circular>
          </span>
          <span class="tree-item__label" part="label">${this.label}</span>
        </div>
      `;
    }

    return html`
      <div class="tree-item__row" part="row" @click=${this.#onRowClick}>
        <span
          class="tree-item__chevron"
          part="chevron"
          aria-hidden="true"
          @click=${this.#onChevronClick}
        >
          ${this.hasChildren ? html`<slot name="chevron">${this.#renderChevron()}</slot>` : nothing}
        </span>
        ${
          this.render_checkboxSelection
            ? html`
                <span class="tree-item__checkbox" part="checkbox" @click=${this.#onCheckboxClick}>
                  <slot name="checkbox">
                    <md-checkbox
                      class="tree-item__checkbox-control"
                      .checked=${this.selected}
                      .indeterminate=${this.indeterminate}
                      ?disabled=${this.disabled}
                      tabindex="-1"
                    ></md-checkbox>
                  </slot>
                </span>
              `
            : nothing
        }
        <span class="tree-item__leading" part="leading" aria-hidden="true">
          <slot name="leading"></slot>
        </span>
        <span class="tree-item__label" part="label" id=${this._labelId}>
          ${this._hasLabelOverride ? html`<slot></slot>` : this.label}
        </span>
        <span class="tree-item__trailing" part="trailing">
          <slot name="trailing"></slot>
        </span>
      </div>
      <slot name="sub-tree"></slot>
    `;
  }
}
