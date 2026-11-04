import { directive, Directive, PartType } from "lit/directive.js";

import { FocusBehaviorController } from "../../controllers/message-list/FocusBehaviorController.js";

/** Content only: suppressing writes attributes, so these records never come from the sync itself. */
const CONTENT = { childList: true, subtree: true };

/**
 * Element directive that keeps a row's interior controls out of the Tab order, through
 * `FocusBehaviorController.syncInteriorTabbing`. `ref()` can't stand in for it — that only fires when
 * the element itself changes. A guarded row gets no later render pass, and a part can add content at
 * any time, so the row's light DOM and every open shadow root inside it are observed.
 */
class InteriorTabbingDirective extends Directive {
  /** @type {(() => void) | undefined} */
  #sync;
  #observer = new MutationObserver(() => this.#sync?.());

  /** @param {import("lit/directive.js").PartInfo} partInfo */
  constructor(partInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) throw new Error("interiorTabbing(): element directive");
  }

  /** Never called — an element directive commits nothing. Declared with the real signature anyway,
   *  since that's what types the `interiorTabbing(...)` call site.
   *  @param {FocusBehaviorController} _focusBehavior @param {string} _id */
  render(_focusBehavior, _id) {}

  /**
   * @param {import("lit/directive.js").ElementPart} part
   * @param {[FocusBehaviorController, string]} args
   */
  update(part, [focusBehavior, id]) {
    const element = /** @type {HTMLElement} */ (part.element);
    this.#sync = () => {
      this.#observer.disconnect(); // drops roots that left the row; the scan below covers what's there
      focusBehavior.syncInteriorTabbing(id, element);
      this.#observer.observe(element, CONTENT);
      for (const root of FocusBehaviorController.openShadowRoots(element)) {
        this.#observer.observe(root, CONTENT);
      }
    };
    this.#sync();
  }
}

export const interiorTabbing = directive(InteriorTabbingDirective);
