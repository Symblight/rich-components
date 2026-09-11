import { buildChipElement } from "./command-chip.js";

/** Renders a resolved `chip` node by re-cloning the app's `<template>` — shared by commands and chip-mode attachments. */
export class ChipNodeView {
  /** @param {import("prosemirror-model").Node} node */
  constructor(node) {
    this.dom = buildChipElement(
      /** @type {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} */ (
        node.attrs
      ),
    );
    this.dom.setAttribute("contenteditable", "false");
  }
}
