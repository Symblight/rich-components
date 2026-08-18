import { Schema } from "prosemirror-model";

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
     */
    command: {
      inline: true,
      group: "inline",
      attrs: { templateId: { default: null }, label: { default: "" }, icon: { default: null } },
      toDOM: (node) => ["span", { "data-template-id": node.attrs.templateId }, node.attrs.label],
      parseDOM: [
        {
          tag: "[data-template-id]",
          getAttrs: (dom) => ({
            templateId: /** @type {HTMLElement} */ (dom).dataset.templateId,
            label: dom.textContent,
            icon: /** @type {HTMLElement} */ (dom).querySelector('[slot="icon"]')?.innerHTML || null,
          }),
        },
      ],
    },
  },
  marks: {},
});
