import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/menu";
import "../chip/chip.js";

import { readChipAttrs, buildCommandChip } from "../../editor/command-chip.js";

import styles from "./command-picker.css?inline";

/** @typedef {HTMLElement & { open: boolean, toggle: (options?: {force?: boolean}) => Promise<void>, openAtPoint: (x: number, y: number) => void }} MenuElement */
/** @typedef {HTMLElement & { value: string, selected: boolean }} MenuItemElement */

const WHITESPACE = /\s/; // matches U+00A0 too, not just a plain " "

/**
 * @tag chx-command-picker
 * @summary Command picker.
 */
@customElement("chx-command-picker")
export class ChxCommandPicker extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    commandCharacter: { type: String, attribute: true },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {string} */
    this.commandCharacter = "@";

    /** @type {string | null} */
    this._activeTarget = null;

    /** @type {{x: number, y: number} | null} */
    this._anchorPoint = null;

    /** @type {number} */
    this._highlightedIndex = -1;

    /** @type {HTMLTemplateElement | null} */
    this._chipTemplate = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("chx-command-query", /** @type {EventListener} */ (this.handleQuery));
    this.addEventListener(
      "chx-command-navigate",
      /** @type {EventListener} */ (this.handleNavigate),
    );
    this.addEventListener("chx-command-confirm", this.handleConfirm);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("chx-command-query", /** @type {EventListener} */ (this.handleQuery));
    this.removeEventListener(
      "chx-command-navigate",
      /** @type {EventListener} */ (this.handleNavigate),
    );
    this.removeEventListener("chx-command-confirm", this.handleConfirm);
  }

  firstUpdated() {
    this.setupChipTemplate();

    const initial = [...this.children].filter(
      (element) => !(element instanceof HTMLTemplateElement),
    );
    if (initial.length > 0) {
      const fragment = document.createDocumentFragment();
      fragment.append(...initial);
      this.addOptions(fragment);
    }
  }

  /** @returns {MenuElement} */
  get menuElement() {
    return /** @type {MenuElement} */ (this.renderRoot?.querySelector(".command-picker__menu"));
  }

  setupChipTemplate() {
    const slotted = /** @type {HTMLElement | null} */ (this.querySelector('[slot="chip"]'));

    if (slotted instanceof HTMLTemplateElement) {
      if (!slotted.id) slotted.id = `${this.id}-chip-template`;
      const root = /** @type {HTMLElement | null} */ (slotted.content.firstElementChild);
      if (root && !root.hasAttribute("data-template-id")) {
        root.setAttribute("data-template-id", slotted.id);
      }
      this._chipTemplate = slotted;
      return;
    }

    // A plain element, not a <template> — adopt it into one, so
    // CommandNodeView's document.getElementById(templateId) reclone still
    // has a real <template> to find. Lets consumers author the chip shell
    // as an ordinary element (Lit bindings and all — a <template> tag
    // can't contain bindings) instead of hand-writing a <template>.
    if (slotted) {
      const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
      template.id = `${this.id}-chip-template`;
      if (!slotted.hasAttribute("data-template-id")) {
        slotted.setAttribute("data-template-id", template.id);
      }
      slotted.remove();
      template.content.append(slotted);
      this.appendChild(template);
      this._chipTemplate = template;
      return;
    }

    const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
    template.id = `${this.id}-chip-template`;
    const chip = document.createElement("chx-chip");
    chip.setAttribute("data-template-id", template.id);
    template.content.append(chip);
    this.appendChild(template);
    this._chipTemplate = template;
  }

  clearOptions() {
    this.menuElement.replaceChildren();
    this._highlightedIndex = -1;
  }

  /** @param {Element | DocumentFragment | HTMLTemplateElement} container */
  addOptions(container) {
    const items =
      container instanceof HTMLTemplateElement
        ? [.../** @type {DocumentFragment} */ (container.content.cloneNode(true)).children]
        : [...container.children];

    if (items.length === 0) {
      this.closeMenu();
      return;
    }

    this.menuElement.append(...items);
    if (this._anchorPoint) {
      this.menuElement.openAtPoint(this._anchorPoint.x, this._anchorPoint.y);
    }
    this.setHighlighted(0);
  }

  closeMenu() {
    this.menuElement.toggle({ force: false });
    this._highlightedIndex = -1;
  }

  /** @param {number} index */
  setHighlighted(index) {
    const items = /** @type {MenuItemElement[]} */ ([
      ...this.menuElement.querySelectorAll("md-menu-item"),
    ]);
    for (const item of items) item.selected = false;
    if (items.length === 0) {
      this._highlightedIndex = -1;
      return;
    }
    this._highlightedIndex = ((index % items.length) + items.length) % items.length;
    items[this._highlightedIndex].selected = true;
  }

  /** @param {Event} event */
  handleQuery = (event) => {
    const { target, value, x, y } = /** @type {CustomEvent} */ (event).detail;
    this._activeTarget = target;
    if (value === null) {
      this._anchorPoint = null;
      this.closeMenu();
      return;
    }
    this._anchorPoint = { x, y };
    if (WHITESPACE.test(value)) {
      this.closeMenu();
      return;
    }
    if (this.menuElement.children.length > 0) {
      this.menuElement.openAtPoint(x, y);
      this.setHighlighted(Math.max(this._highlightedIndex, 0));
    }
  };

  /** @param {Event} event */
  handleNavigate = (event) => {
    if (!this.menuElement.open) return;
    const { direction } = /** @type {CustomEvent} */ (event).detail;
    this.setHighlighted(this._highlightedIndex + (direction === "down" ? 1 : -1));
  };

  handleConfirm = () => {
    const highlighted = /** @type {MenuItemElement | null} */ (
      this.menuElement.querySelector("md-menu-item[selected]")
    );
    if (highlighted) this.resolve(highlighted);
  };

  /** @param {Event} event */
  handleSelect = (event) => {
    const { item } = /** @type {CustomEvent<{ value: string, item: MenuItemElement }>} */ (event)
      .detail;
    this.resolve(item);
  };

  /** @param {MenuItemElement} optionElement */
  resolve(optionElement) {
    const value = optionElement.value ?? optionElement.textContent?.trim() ?? "";

    /** @type {Node | null} */
    let overrideNode = null;
    /** @param {HTMLElement} element */
    const setChip = (element) => {
      overrideNode = element;
    };

    this.dispatchEvent(
      new CustomEvent("chx-command-picked", {
        detail: { target: this._activeTarget, value, setChip },
        bubbles: true,
      }),
    );

    const composer =
      /** @type {(HTMLElement & { insertAtRange: (target: string | null, node: Node) => void }) | null | undefined} */ (
        /** @type {any} */ (this.closest("chx-chat"))?.messageComposerElement
      );
    if (!composer) return;

    const node = overrideNode ?? this.buildDefaultChip(optionElement, value);
    this._stampOwner(node);
    composer.insertAtRange(this._activeTarget, node);
  }

  /**
   * Tags whichever node is about to be inserted (the default chip, or an app-supplied `setChip`
   * override) with this picker's own id — the token `renderChip` later reads to know a historical
   * placeholder is its own, without any live-element bookkeeping. Handles both shapes `insertAtRange`
   * accepts: a bare chip element, or a fragment wrapping one.
   * @param {Node} node
   */
  _stampOwner(node) {
    const chip =
      node instanceof Element && node.hasAttribute("data-template-id")
        ? node
        : /** @type {ParentNode} */ (node).querySelector?.("[data-template-id]");
    if (chip instanceof HTMLElement) chip.dataset.commandFieldId = this.id;
  }

  /**
   * Rebuilds a historical `[data-template-id]` placeholder into the real chip — called by chx-chat's
   * generic renderChip dispatcher once it's matched the placeholder's `data-command-field-id` back to
   * this instance. Pure builder, no DOM mutation — the caller replaces the placeholder itself.
   * Delegates the actual drawing to `buildChip` (below) — override that instead of this one unless
   * you specifically need to change ownership/matching, so live and historical stay in sync for free.
   * @param {HTMLElement} placeholder
   * @returns {Node | null}
   */
  renderChip(placeholder) {
    const attrs = readChipAttrs(placeholder);
    if (attrs.data.commandFieldId !== this.id) return null;
    return this._ensureTemplateId(this.buildChip(attrs), attrs.templateId);
  }

  /**
   * Draws a chip from resolved attrs — the single place a picker's chip is actually built, used by
   * both live resolution (buildDefaultChip, below, right as you pick an option) and historical
   * hydration (renderChip, above, once a message with that chip has been sent and re-rendered).
   * Override this one method to customize the look everywhere at once. Overriding `renderChip`
   * directly instead only affects historical rendering — the two paths are NOT otherwise kept in
   * sync, so a `renderChip` override alone will visibly diverge from what typing shows live. Default
   * implementation clones this picker's own `slot="chip"` template (or the auto-built default).
   * Whatever this returns gets `data-template-id` stamped on automatically if missing (see
   * `_ensureTemplateId`) — a custom override never needs to know that attribute exists.
   * @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs
   * @returns {HTMLElement}
   */
  buildChip(attrs) {
    return buildCommandChip(attrs);
  }

  /**
   * `insertAtRange`/`Editor.resolveCommand` (live) and this picker's own `renderChip` (historical)
   * both require `data-template-id` on the chip node as their round-trip anchor — silently no-op
   * without it, confirmed live: a `buildChip` override that returns a plain element with no
   * `data-template-id` makes Enter/click on a menu option do nothing at all, no error either. A
   * custom `buildChip` has no reason to know that requirement exists, so it's enforced here instead
   * of documented as the override's responsibility.
   * @param {HTMLElement} chip
   * @param {string} templateId
   * @returns {HTMLElement}
   */
  _ensureTemplateId(chip, templateId) {
    if (!chip.hasAttribute("data-template-id")) chip.setAttribute("data-template-id", templateId);
    return chip;
  }

  /**
   * @param {MenuItemElement} optionElement
   * @param {string} value
   * @returns {HTMLElement}
   */
  buildDefaultChip(optionElement, value) {
    const attrs = {
      templateId: /** @type {HTMLTemplateElement} */ (this._chipTemplate).id,
      label: optionElement.textContent?.trim() || value,
      icon: null,
      data: {},
    };
    return this._ensureTemplateId(this.buildChip(attrs), attrs.templateId);
  }

  render() {
    return html`
      <md-menu
        class="command-picker__menu"
        placement="top-start"
        offset="20"
        @select=${this.handleSelect}
      ></md-menu>
    `;
  }
}
