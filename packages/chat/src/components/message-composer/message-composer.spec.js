import { expect, fixture, html } from "@open-wc/testing";

import "./message-composer.js";
/** @import { ChxMessageComposer } from "./message-composer.js" */
/** @import { ChxTextbox } from "../textbox/textbox.js" */

/** @param {ChxMessageComposer} el */
const textboxOf = (el) => /** @type {ChxTextbox} */ (el.shadowRoot?.querySelector("chx-textbox"));

/** @param {ChxMessageComposer} el */
const actionOf = (el) =>
  /** @type {HTMLElement & { disabled: boolean } | null} */ (
    textboxOf(el).shadowRoot?.querySelector('[part="action"]') ?? null
  );

/**
 * @param {ChxMessageComposer} el
 * @param {string} text
 */
async function type(el, text) {
  const textbox = textboxOf(el);
  textbox.setText(text);
  await textbox.updateComplete;
}

/** @param {ChxMessageComposer} el */
function countSends(el) {
  const sends = { count: 0 };
  el.addEventListener("chx-send-message", () => sends.count++);
  return sends;
}

describe("chx-message-composer", () => {
  describe("disabled", () => {
    it('disables the send button with a draft (send-button="always")', async () => {
      const el = /** @type {ChxMessageComposer} */ (
        await fixture(
          html`<chx-message-composer send-button="always" disabled></chx-message-composer>`,
        )
      );
      await type(el, "hello");
      expect(actionOf(el)?.disabled).to.be.true;

      el.disabled = false;
      await el.updateComplete;
      await textboxOf(el).updateComplete;
      expect(actionOf(el)?.disabled).to.be.false;
    });

    it("makes the draft read-only", async () => {
      const el = /** @type {ChxMessageComposer} */ (
        await fixture(html`<chx-message-composer disabled></chx-message-composer>`)
      );
      expect(textboxOf(el).editor?.view.editable).to.be.false;
    });

    it("sends nothing on submit", async () => {
      const el = /** @type {ChxMessageComposer} */ (
        await fixture(html`<chx-message-composer disabled></chx-message-composer>`)
      );
      const sends = countSends(el);
      el.shadowRoot?.querySelector("form")?.requestSubmit();
      expect(sends.count).to.equal(0);
    });

    it("leaves stop enabled mid-turn", async () => {
      const el = /** @type {ChxMessageComposer} */ (
        await fixture(
          html`<chx-message-composer send-button="always" loading disabled></chx-message-composer>`,
        )
      );
      await textboxOf(el).updateComplete;
      expect(actionOf(el)?.disabled).to.be.false;
    });

    it("keeps the consumer's value when chx-chat's empty state clears", async () => {
      const el = /** @type {ChxMessageComposer} */ (
        await fixture(html`<chx-message-composer disabled></chx-message-composer>`)
      );
      el.emptyState = true;
      await el.updateComplete;
      el.emptyState = false;
      await el.updateComplete;
      await textboxOf(el).updateComplete;
      expect(el.disabled).to.be.true;
      expect(textboxOf(el).disabled).to.be.true;
    });
  });
});
