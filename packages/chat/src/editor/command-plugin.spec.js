import { expect } from "@open-wc/testing";
import { EditorState } from "prosemirror-state";

import { commandPluginKey, createCommandPlugin } from "./command-plugin.js";
import { schema } from "./schema.js";

/**
 * A stand-in for <chx-command-picker>/<chx-command-field> — the plugin only ever reads
 * `commandCharacter`/`maxQuerySpaces`/`canConfirm` off it and dispatches events at it.
 * @param {{character?: string, maxQuerySpaces?: number, canConfirm?: () => boolean}} [options]
 */
function createField({ character = "@", maxQuerySpaces, canConfirm } = {}) {
  const element = /** @type {any} */ (document.createElement("div"));
  element.commandCharacter = character;
  if (maxQuerySpaces !== undefined) element.maxQuerySpaces = maxQuerySpaces;
  if (canConfirm !== undefined) element.canConfirm = canConfirm;
  return element;
}

/**
 * Types `text` into a fresh document and returns the plugin's resulting state, plus the plugin
 * itself for the handleKeyDown tests.
 * @param {string} text
 * @param {any[]} fields
 */
function typeInto(text, fields) {
  const plugin = createCommandPlugin({
    getCommandFields: () => new Map(fields.map((field, index) => [String(index), field])),
  });
  const initial = EditorState.create({ schema, plugins: [plugin] });
  const state = initial.apply(initial.tr.insertText(text));
  return { plugin, state, pluginState: commandPluginKey.getState(state) };
}

/** @param {any} state */
function viewFor(state) {
  return /** @type {any} */ ({ state, dispatch: () => {} });
}

function enterKey() {
  return new KeyboardEvent("keydown", { key: "Enter" });
}

describe("command plugin — maxQuerySpaces", () => {
  it("keeps a single-word query active by default", () => {
    const { pluginState } = typeInto("@mess", [createField()]);
    expect(pluginState?.active).to.be.true;
    expect(pluginState?.query).to.equal("mess");
  });

  it("ends the search at the first space by default", () => {
    const { pluginState } = typeInto("@mess ", [createField()]);
    expect(pluginState?.active).to.be.false;
  });

  it("keeps the search active within the configured budget", () => {
    const { pluginState } = typeInto("@My Doc", [createField({ maxQuerySpaces: 2 })]);
    expect(pluginState?.active).to.be.true;
    expect(pluginState?.query).to.equal("My Doc");
  });

  it("counts whitespace across the whole query, not consecutive runs", () => {
    const field = createField({ maxQuerySpaces: 2 });
    // exactly at budget: "My Documents/scroll helpers.js" holds two spaces
    expect(typeInto("@My Documents/scroll helpers.js", [field]).pluginState?.active).to.be.true;
    // one past it
    expect(typeInto("@My Documents/scroll helpers.js x", [field]).pluginState?.active).to.be.false;
  });

  it("budgets per field, so one trigger's allowance doesn't leak to another", () => {
    const fields = [
      createField({ character: "@", maxQuerySpaces: 2 }),
      createField({ character: "/", maxQuerySpaces: 0 }),
    ];
    expect(typeInto("@My Doc", fields).pluginState?.active).to.be.true;
    expect(typeInto("/my doc", fields).pluginState?.active).to.be.false;
  });

  it("still requires the trigger to sit at a word boundary", () => {
    const { pluginState } = typeInto("email@domain", [createField({ maxQuerySpaces: 2 })]);
    expect(pluginState?.active).to.be.false;
  });
});

describe("command plugin — Enter", () => {
  it("lets Enter through when the field has nothing to confirm", async () => {
    const field = createField({ canConfirm: () => false });
    let confirmed = false;
    field.addEventListener("chx-command-confirm", () => {
      confirmed = true;
    });

    const { plugin, state } = typeInto("@mess", [field]);
    const handled = /** @type {any} */ (plugin.props).handleKeyDown(viewFor(state), enterKey());

    expect(handled).to.be.false; // falls through to the keymap's submit
    await Promise.resolve(); // the confirm dispatch, had there been one, is queued as a microtask
    expect(confirmed).to.be.false;
  });

  it("consumes Enter and confirms when the field says it can", async () => {
    const field = createField({ canConfirm: () => true });
    let confirmed = false;
    field.addEventListener("chx-command-confirm", () => {
      confirmed = true;
    });

    const { plugin, state } = typeInto("@mess", [field]);
    const handled = /** @type {any} */ (plugin.props).handleKeyDown(viewFor(state), enterKey());

    expect(handled).to.be.true;
    await Promise.resolve();
    expect(confirmed).to.be.true;
  });

  it("consumes Enter for a field that doesn't implement canConfirm", () => {
    const { plugin, state } = typeInto("@mess", [createField()]);
    const handled = /** @type {any} */ (plugin.props).handleKeyDown(viewFor(state), enterKey());
    expect(handled).to.be.true;
  });

  it("ignores Enter entirely once the search has ended", () => {
    const field = createField({ canConfirm: () => true });
    const { plugin, state } = typeInto("@mess ", [field]); // space ended the search
    const handled = /** @type {any} */ (plugin.props).handleKeyDown(viewFor(state), enterKey());
    expect(handled).to.be.false;
  });
});
