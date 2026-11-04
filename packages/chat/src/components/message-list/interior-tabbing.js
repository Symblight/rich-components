import { directive, Directive, PartType } from "lit/directive.js";

/** @import { FocusBehaviorController } from "../../controllers/message-list/FocusBehaviorController.js" */

/**
 * Element directive that re-runs `FocusBehaviorController.syncInteriorTabbing` whenever its row
 * renders. `ref()` can't stand in for it — that only fires when the element itself changes, and the
 * tab order has to be re-applied whenever a message's children change too.
 */
class InteriorTabbingDirective extends Directive {
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
    focusBehavior.syncInteriorTabbing(id, element);
    // runs before this row's children commit and render, and an unchanged row gets no later pass
    requestAnimationFrame(() => {
      if (element.isConnected) focusBehavior.syncInteriorTabbing(id, element);
    });
  }
}

export const interiorTabbing = directive(InteriorTabbingDirective);
