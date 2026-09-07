import { buildCommandChip } from "./command-chip.js";

/** Renders a resolved `command` node by re-cloning the app's own `<template>` (by `node.attrs.templateId`). */
export class CommandNodeView {
  /** @param {import("prosemirror-model").Node} node */
  constructor(node) {
    this.dom = buildCommandChip(
      /** @type {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} */ (
        node.attrs
      ),
    );
    this.dom.setAttribute("contenteditable", "false");
  }
}
