import { DOMSerializer } from "prosemirror-model";

/**
 * Direct replacement for ContentTextoFormatter#toPlainText — `line` blocks
 * are separated by `\n` automatically via `blockSeparator`; the trailing
 * trim mirrors the old #normalize (a trailing empty line shouldn't leave a
 * dangling blank line in the plain-text value).
 *
 * The `leafText` callback overrides *every* leaf node's serialization,
 * including `command` chips — without the explicit branch below a chip
 * would silently serialize to "" (vanishing from `value` while still
 * showing correctly in `html`), confirmed against Fragment#textBetween's
 * actual algorithm during Phase 2 planning.
 * @param {import("prosemirror-model").Node} doc
 * @returns {string}
 */
export function toPlainText(doc) {
  const text = doc.textBetween(0, doc.content.size, "\n", (node) =>
    node.type.name === "command" ? node.attrs.label : "",
  );
  return text.replace(/\n+$/, "");
}

/**
 * @param {import("prosemirror-model").Node} doc
 * @param {import("prosemirror-model").Schema} schema
 * @returns {string}
 */
export function toHTML(doc, schema) {
  const wrapper = document.createElement("div");
  DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {}, wrapper);
  return wrapper.innerHTML;
}
