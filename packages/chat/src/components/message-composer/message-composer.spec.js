import { expect, fixture, html } from "@open-wc/testing";

import "./message-composer.js";
import "../base/chat.js";
import { schema } from "../../editor/schema.js";
import { chipPartRule, createSplitOnSendHandler } from "../../utils/split-message-parts.js";
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
  it("input.setState() brings back a draft with its chip, which setText() would flatten", async () => {
    // Arrange
    const chat = /** @type {import("../base/chat.js").ChxChat} */ (
      await fixture(
        html`<chx-chat
          ><chx-message-composer slot="message-composer"></chx-message-composer
        ></chx-chat>`,
      )
    );
    const composer = /** @type {ChxMessageComposer} */ (chat.querySelector("chx-message-composer"));
    await composer.updateComplete;
    const textbox = textboxOf(composer);
    await textbox.updateComplete;
    const view = /** @type {NonNullable<typeof textbox.editor>} */ (textbox.editor).view;
    view.dispatch(
      view.state.tr.replaceWith(0, view.state.doc.content.size, [
        schema.nodes.line.create(null, [
          schema.text("see "),
          schema.nodes.chip.create({ templateId: "t", label: "a.js", icon: null, data: {} }),
        ]),
      ]),
    );
    const saved = chat.input.getState();
    const before = chat.input.getValue();

    // Act
    chat.input.setText("");
    const cleared = chat.input.isEmpty();
    chat.input.setState(saved);

    // Assert
    expect(cleared).to.equal(true);
    expect(chat.input.getValue()).to.deep.equal(before);
    expect(before.html).to.include('data-template-id="t"');
  });

  it("input.setText() turns line breaks into lines, with the caret at the end", async () => {
    // Arrange
    const chat = /** @type {import("../base/chat.js").ChxChat} */ (
      await fixture(
        html`<chx-chat
          ><chx-message-composer slot="message-composer"></chx-message-composer
        ></chx-chat>`,
      )
    );
    const composer = /** @type {ChxMessageComposer} */ (chat.querySelector("chx-message-composer"));
    await composer.updateComplete;
    const textbox = textboxOf(composer);
    await textbox.updateComplete;

    // Act
    chat.input.setText("one\n\nthree");

    // Assert
    const { doc, selection } = /** @type {NonNullable<typeof textbox.editor>} */ (textbox.editor)
      .view.state;
    expect(doc.childCount, "one line node per line").to.equal(3);
    expect(chat.input.getValue().value).to.equal("one\n\nthree");
    expect(selection.from, "caret at the end").to.equal(doc.content.size - 1);
  });

  it("a sent message keeps its composer state, through splitting on send", async () => {
    // Arrange
    const chat = /** @type {import("../base/chat.js").ChxChat} */ (
      await fixture(
        html`<chx-chat
          ><chx-message-composer slot="message-composer"></chx-message-composer
        ></chx-chat>`,
      )
    );
    chat.addEventListener(
      "chx-messages-change",
      /** @type {EventListener} */ (createSplitOnSendHandler([chipPartRule])),
    );
    const composer = /** @type {ChxMessageComposer} */ (chat.querySelector("chx-message-composer"));
    await composer.updateComplete;
    const textbox = textboxOf(composer);
    await textbox.updateComplete;
    const view = /** @type {NonNullable<typeof textbox.editor>} */ (textbox.editor).view;
    view.dispatch(
      view.state.tr.replaceWith(0, view.state.doc.content.size, [
        schema.nodes.line.create(null, [
          schema.text("see "),
          schema.nodes.chip.create({ templateId: "t", label: "a.js", icon: null, data: {} }),
        ]),
      ]),
    );
    const before = chat.input.getValue();

    // Act
    textbox.closest("form")?.requestSubmit();
    await chat.updateComplete;
    const [message] = chat.store.getMessages();
    chat.input.setState(message.composerState);

    // Assert
    expect(message.parts.some((part) => part.type === "chip"), "was split").to.equal(true);
    expect(chat.input.getValue()).to.deep.equal(before);
  });

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
