/** Renders a resolved `command` node by re-cloning the app's own `<template>` (by `node.attrs.templateId`). */
export class CommandNodeView {
  /** @param {import("prosemirror-model").Node} node */
  constructor(node) {
    const template = /** @type {HTMLTemplateElement | null} */ (
      document.getElementById(node.attrs.templateId)
    );
    const clone = template?.content.cloneNode(true);

    const staging = document.createElement("div");
    staging.style.display = "none";
    document.body.appendChild(staging);
    if (clone) staging.appendChild(clone); // <script> executes here
    document.body.removeChild(staging);

    const chip = /** @type {HTMLElement | null} */ (staging.querySelector("[data-template-id]"));
    this.dom = chip ?? document.createElement("span");
    if (node.attrs.icon) {
      const icon = this.dom.querySelector('[slot="icon"]');
      if (icon) icon.innerHTML = node.attrs.icon;
    }
    this.dom.append(node.attrs.label);
    // Not automatic — PM doesn't set this on custom NodeView DOM by itself.
    this.dom.setAttribute("contenteditable", "false");
  }
}
