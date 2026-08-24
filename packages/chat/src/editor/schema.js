import { Schema } from "prosemirror-model";

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
     * A resolved command chip — see src/editor/command-plugin.js and
     * command-node-view.js. No `content` → already a leaf/atom per
     * prosemirror-model (isLeaf/isAtom both derive from the absence of a
     * content match, not from an explicit `atom: true`). `toDOM` is a
     * plain static placeholder, not a copy of the live chip markup — it
     * only feeds clipboard copy and Editor.getHTML()'s detached-wrapper
     * serialization, where a <script> could never execute anyway; the
     * NodeView (command-node-view.js) is what actually renders the real,
     * interactive chip by re-cloning the app's own <template>.
     *
     * `data` carries whatever extra `data-*` attributes the app set on the
     * chip it handed to `insertAtCommand` (e.g. `data-path`), captured off
     * its `dataset` minus `templateId` — arbitrary app data the library
     * doesn't interpret, just round-trips through the doc and reapplies
     * onto the rendered chip (see command-node-view.js) so
     * `Editor.getCommands()`'s `element` can be read back from later,
     * without the schema having to name a specific "value" concept.
     */
    command: {
      inline: true,
      group: "inline",
      attrs: {
        templateId: { default: null },
        label: { default: "" },
        icon: { default: null },
        data: { default: {} },
      },
      toDOM: (node) => [
        "span",
        {
          "data-template-id": node.attrs.templateId,
          ...Object.fromEntries(
            Object.entries(node.attrs.data ?? {}).map(([key, value]) => [
              toDataAttrName(key),
              value,
            ]),
          ),
        },
        node.attrs.label,
      ],
      parseDOM: [
        {
          tag: "[data-template-id]",
          getAttrs: (dom) => {
            const { templateId, ...data } = /** @type {HTMLElement} */ (dom).dataset;
            return {
              templateId,
              label: dom.textContent,
              icon:
                /** @type {HTMLElement} */ (dom).querySelector('[slot="icon"]')?.innerHTML ||
                null,
              data,
            };
          },
        },
      ],
    },
  },
  marks: {},
});
