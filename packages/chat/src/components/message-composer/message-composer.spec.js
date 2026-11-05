import { expect, fixture, html } from "@open-wc/testing";
import { Selection, TextSelection } from "prosemirror-state";

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

  describe("prompt history", () => {
    /** @param {{on?: boolean, prompts?: string[]}} [options] */
    async function setup({ on = true, prompts = ["one", "two\nlines", "three"] } = {}) {
      const field = Object.assign(document.createElement("div"), {
        id: "field",
        slot: "command-field",
        commandCharacter: "@",
      });
      const chat = /** @type {import("../base/chat.js").ChxChat} */ (
        await fixture(
          html`<chx-chat style="display: block; inline-size: 240px"
            ><chx-message-composer slot="message-composer" ?prompt-history=${on}
              >${field}</chx-message-composer
            ></chx-chat
          >`,
        )
      );
      const composer = /** @type {ChxMessageComposer} */ (
        chat.querySelector("chx-message-composer")
      );
      await composer.updateComplete;
      const textbox = textboxOf(composer);
      await textbox.updateComplete;
      prompts.forEach((text, index) =>
        chat.store.add({ id: `m${index}`, own: true, parts: [{ id: `p${index}`, type: "text", text }] }),
      );
      const view = /** @type {NonNullable<typeof textbox.editor>} */ (textbox.editor).view;
      /** @param {string} key @param {KeyboardEventInit} [init] */
      const press = (key, init) => {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
        view.dom.dispatchEvent(event);
        return event;
      };
      /** @param {number} pos */
      const caretAt = (pos) =>
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))));
      return { chat, composer, textbox, view, field, press, caretAt, text: () => chat.input.getValue().value };
    }

    it("Up walks to the oldest prompt, Down walks back to the draft", async () => {
      // Arrange
      const { chat, view, press, text } = await setup();
      chat.input.setText("my\ndraft");
      view.dispatch(view.state.tr.setSelection(Selection.atStart(view.state.doc)));
      const walk = /** @type {const} */ ([
        // [key, shown, caret]
        ["ArrowUp", "three", "start"],
        ["ArrowUp", "two\nlines", "start"],
        ["ArrowUp", "one", "start"],
        ["ArrowUp", "one", "start"],
        ["ArrowDown", "two\nlines", "end"],
        ["ArrowDown", "three", "end"],
        ["ArrowDown", "my\ndraft", "end"],
      ]);

      for (const [key, shown, caret] of walk) {
        // Act
        const event = press(key);

        // Assert
        const { doc, selection } = view.state;
        const expected = caret === "start" ? Selection.atStart(doc) : Selection.atEnd(doc);
        expect(text(), `${key} shows`).to.equal(shown);
        expect(selection.from, `${key} to ${shown}: caret at the ${caret}`).to.equal(expected.from);
        expect(event.defaultPrevented, key).to.equal(true);
      }
    });

    it("leaves the arrows alone where they have nothing to recall", async () => {
      // Arrange
      const threeLines = "a\nb\nc";
      const cases = [
        { why: "Down while not browsing", key: "ArrowDown", draft: "x", pos: 1 },
        { why: "a row in the middle", key: "ArrowUp", draft: threeLines, pos: 4 },
        { why: "Up below the first row", key: "ArrowUp", draft: threeLines, pos: 7 },
        { why: "Shift", key: "ArrowUp", draft: "x", pos: 1, init: { shiftKey: true } },
        { why: "Alt", key: "ArrowUp", draft: "x", pos: 1, init: { altKey: true } },
        { why: "Mod", key: "ArrowUp", draft: "x", pos: 1, init: { metaKey: true } },
        { why: "Ctrl", key: "ArrowUp", draft: "x", pos: 1, init: { ctrlKey: true } },
        { why: "a selection", key: "ArrowUp", draft: "xy", pos: 1, select: true },
        { why: "no prompts", key: "ArrowUp", draft: "x", pos: 1, prompts: [] },
        { why: "off without the attribute", key: "ArrowUp", draft: "x", pos: 1, on: false },
      ];

      for (const { why, key, draft, pos, init, select, prompts, on } of cases) {
        const { chat, view, press, caretAt, text } = await setup({ prompts, on });
        chat.input.setText(draft);
        caretAt(pos);
        if (select) {
          view.dispatch(
            view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, pos + 1)),
          );
        }

        // Act
        const event = press(key, init);

        // Assert
        expect(event.defaultPrevented, why).to.equal(false);
        expect(text(), why).to.equal(draft);
      }
    });

    it("does nothing in a composer without a chat", async () => {
      // Arrange
      const composer = /** @type {ChxMessageComposer} */ (
        await fixture(html`<chx-message-composer prompt-history></chx-message-composer>`)
      );
      const textbox = textboxOf(composer);
      await textbox.updateComplete;
      const { dom } = /** @type {NonNullable<typeof textbox.editor>} */ (textbox.editor).view;
      const event = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });

      // Act
      dom.dispatchEvent(event);

      // Assert
      expect(event.defaultPrevented).to.equal(false);
    });

    it("a wrapped line's lower row moves the caret; only its first row recalls", async () => {
      // Arrange
      const { chat, view, press, caretAt, text } = await setup();
      const long = "word ".repeat(80).trim();
      chat.input.setText(long);
      await new Promise(requestAnimationFrame);
      expect(view.dom.getBoundingClientRect().height, "wraps").to.be.greaterThan(40);

      // Act
      const onLowerRow = press("ArrowUp");
      const shownOnLowerRow = text();
      caretAt(1);
      const onFirstRow = press("ArrowUp");

      // Assert
      expect(onLowerRow.defaultPrevented).to.equal(false);
      expect(shownOnLowerRow).to.equal(long);
      expect(onFirstRow.defaultPrevented).to.equal(true);
      expect(text()).to.equal("three");
    });

    it("brings a sent prompt back with its chip and paste", async () => {
      // Arrange
      const { chat, textbox, view, press } = await setup({ prompts: [] });
      view.dispatch(
        view.state.tr.replaceWith(0, view.state.doc.content.size, [
          schema.nodes.line.create(null, [
            schema.text("see "),
            schema.nodes.chip.create({ templateId: "t", label: "a.js", icon: null, data: {} }),
            schema.nodes.paste.create({ text: "a\nb", lines: 2, data: {} }),
          ]),
        ]),
      );
      const sent = view.state.doc.toJSON();
      textbox.closest("form")?.requestSubmit();
      await chat.updateComplete;

      // Act
      press("ArrowUp");

      // Assert
      expect(view.state.doc.toJSON()).to.deep.equal(sent);
    });

    it("an open picker keeps the arrows", async () => {
      // Arrange
      const { chat, field, press, text } = await setup();
      /** @type {string[]} */
      const navigated = [];
      field.addEventListener("chx-command-navigate", (event) =>
        navigated.push(/** @type {CustomEvent} */ (event).detail.direction),
      );
      chat.input.setText("@fo");

      // Act
      press("ArrowUp");

      // Assert
      expect(navigated).to.deep.equal(["up"]);
      expect(text()).to.equal("@fo");
    });

    it("a recalled prompt ending in @foo doesn't open the picker", async () => {
      // Arrange
      const { field, press, text } = await setup({ prompts: ["one", "see @foo", "three"] });
      let queries = 0;
      field.addEventListener("chx-command-query", () => queries++);
      press("ArrowUp");
      press("ArrowUp");
      press("ArrowUp");

      // Act
      press("ArrowDown");
      const landed = text();
      press("ArrowDown");

      // Assert
      expect(landed).to.equal("see @foo");
      expect(queries, "never opened").to.equal(0);
      expect(text(), "Down isn't the picker's").to.equal("three");
    });

    it("keeps an edit while browsing, until the draft is reached", async () => {
      // Arrange
      const { view, press, text } = await setup({ prompts: ["two", "three"] });
      press("ArrowUp");
      view.dispatch(view.state.tr.insertText("edited "));

      // Act
      press("ArrowUp");
      press("ArrowDown");
      const whileBrowsing = text();
      press("ArrowDown");
      press("ArrowUp");
      const afterTheDraft = text();

      // Assert
      expect(whileBrowsing).to.equal("edited three");
      expect(afterTheDraft).to.equal("three");
    });

    it("sending a recalled prompt puts the draft back and ends browsing", async () => {
      // Arrange
      const { chat, textbox, view, press, text } = await setup();
      chat.input.setText("my draft");
      press("ArrowUp");
      view.dispatch(view.state.tr.insertText("edited "));

      // Act
      textbox.closest("form")?.requestSubmit();
      await chat.updateComplete;
      const down = press("ArrowDown");

      // Assert
      expect(text()).to.equal("my draft");
      expect(view.state.selection.from, "caret at the end").to.equal(
        Selection.atEnd(view.state.doc).from,
      );
      expect(down.defaultPrevented, "no longer browsing").to.equal(false);
      expect(chat.store.getMessages().at(-1)?.parts[0].text).to.equal("edited three");
    });
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
