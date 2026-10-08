import { Schema } from "prosemirror-model";

import { readChipAttrs } from "./command-chip.js";

/**
 * `node.attrs.data`'s keys are JS camelCase (straight off `element.dataset`,
 * which does this conversion natively) — `toDOM`'s attrs object needs real
 * `data-*` attribute-name strings instead, since DOMSerializer sets them
 * literally, not through `.dataset`.
 * @param {string} camelCase
 * @returns {string}
 */
function toDataAttrName(camelCase) {
  return `data-${camelCase.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/**
 * One `line` block per visual line — not `prosemirror-schema-basic`, whose
 * block nodes (blockquote/heading/code_block/horizontal_rule) don't apply
 * here, and whose `baseKeymap` assumes a paragraph-splitting `Enter`. Enter
 * submits (never splits); Shift+Enter splits the current `line` into two
 * (see keymap.js). No marks yet (bold/italic/etc.) — out of scope for now,
 * this shape doesn't need restructuring to add them later.
 */
export const schema = new Schema({
  nodes: {
    doc: { content: "line+" },
    line: {
      content: "inline*",
      toDOM: () => ["div", 0],
      parseDOM: [{ tag: "div" }],
    },
    text: { group: "inline" },
    /**
     * A resolved chip — shared by commands and chip-mode attachments. `toDOM` is a static
     * placeholder for clipboard/getHTML() only; command-node-view.js's NodeView renders the real
     * chip by re-cloning the app's `<template>`. `data.chipOwnerId` is purely informational once
     * sent — a consumer's own `partElements.chip` renderer can key off it (see
     * `split-message-parts.js`'s `chipPartRule`, docs/commands.md's "Rendering a sent chip").
     */
    chip: {
      inline: true,
      group: "inline",
      attrs: {
        templateId: { default: null },
        label: { default: "" },
        icon: { default: null },
        data: { default: {} },
      },
      toDOM: (node) => {
        const span = document.createElement("span");
        span.dataset.templateId = node.attrs.templateId;
        for (const [key, value] of Object.entries(node.attrs.data ?? {})) {
          span.dataset[key] = value;
        }
        if (node.attrs.icon) {
          const icon = document.createElement("span");
          icon.slot = "icon";
          icon.innerHTML = node.attrs.icon;
          span.append(icon);
        }
        span.append(node.attrs.label);
        return span;
      },
      parseDOM: [
        {
          tag: "[data-template-id]",
          getAttrs: (dom) => readChipAttrs(/** @type {HTMLElement} */ (dom)),
        },
      ],
    },
    /**
     * A collapsed long paste — the full text lives in `attrs.text`, only a
     * chip renders (see paste-plugin.js / paste-node-view.js, both driven by
     * editor extensions). `data` is whatever the extension's `handlePaste`
     * returned — `data.kind` names the owner (`"long-text"` from
     * chx-paste-long-text, `"code"` + `lang` from chx-code-block-paste) —
     * round-tripped the same way `command`'s `data` bag is, opaque to the
     * schema.
     *
     * `leafText` feeds ProseMirror's own clipboard text/plain serialization,
     * so copying a selection containing a chip yields the full text;
     * `toDOM` keeps the full text in clipboard HTML / getHTML() output too.
     */
    paste: {
      inline: true,
      group: "inline",
      attrs: {
        text: { default: "" },
        lines: { default: 0 },
        data: { default: {} },
      },
      leafText: (node) => node.attrs.text,
      toDOM: (node) => [
        "span",
        {
          "data-paste-lines": String(node.attrs.lines),
          ...Object.fromEntries(
            Object.entries(node.attrs.data ?? {}).map(([key, value]) => [
              toDataAttrName(key),
              value,
            ]),
          ),
        },
        node.attrs.text,
      ],
      parseDOM: [
        {
          tag: "span[data-paste-lines]",
          getAttrs: (dom) => {
            const { pasteLines, ...data } = /** @type {HTMLElement} */ (dom).dataset;
            return {
              text: dom.textContent ?? "",
              lines: Number(pasteLines) || 0,
              data,
            };
          },
        },
      ],
    },
  },
  marks: {},
});
