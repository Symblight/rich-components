/**
 * Reads `{templateId, label, icon, data}` off any chip-shaped element. Direct text-node children
 * only for `label` — an icon child's own text shouldn't leak in.
 * @param {HTMLElement} element
 * @returns {{templateId: string, label: string, icon: string | null, data: Record<string, string>}}
 */
export function readChipAttrs(element) {
  const { templateId, ...data } = element.dataset;
  const label = [...element.childNodes]
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent)
    .join("")
    .trim();
  const icon = element.querySelector('[slot="icon"]')?.innerHTML || null;
  return {
    templateId: /** @type {string} */ (templateId),
    label,
    icon,
    data: /** @type {Record<string, string>} */ (data),
  };
}

/**
 * Builds a live chip by cloning the app's `<template id="{templateId}">` — same mechanism
 * CommandNodeView uses, factored out for reuse outside the editor. Missing template -> bare span.
 * @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs
 * @returns {HTMLElement}
 */
export function buildCommandChip({ templateId, label, icon, data }) {
  const template = /** @type {HTMLTemplateElement | null} */ (document.getElementById(templateId));
  const clone = template instanceof HTMLTemplateElement ? template.content.cloneNode(true) : null;

  const staging = document.createElement("div");
  staging.style.display = "none";
  document.body.appendChild(staging);
  if (clone) staging.appendChild(clone); // <script> executes here
  document.body.removeChild(staging);

  const chip = /** @type {HTMLElement | null} */ (staging.querySelector("[data-template-id]"));
  const dom = chip ?? document.createElement("span");
  if (icon) {
    const iconSlot = dom.querySelector('[slot="icon"]');
    if (iconSlot) iconSlot.innerHTML = icon;
  }
  dom.append(label);
  for (const [key, value] of Object.entries(data ?? {})) dom.dataset[key] = value;
  return dom;
}

/**
 * Upgrades a static `[data-template-id]` placeholder into the real chip, in place — the default
 * reproduction, not a customization hook (for a different look, use readChipAttrs instead). Tries
 * commandChipElements (chx-chat's commandId -> live element map) first, then buildCommandChip.
 * Mutates `placeholder` and returns nothing (unlike hydrateAttachmentPart, which is pure — this one
 * has a DOM node to replace, that one doesn't).
 * @param {HTMLElement} placeholder
 * @param {{commandChipElements?: import("../types/adapter.js").ChipElementLookup}} [options]
 */
export function hydrateCommandChip(placeholder, { commandChipElements } = {}) {
  const attrs = readChipAttrs(placeholder);
  const live = attrs.data.commandId ? commandChipElements?.get(attrs.data.commandId) : undefined;
  placeholder.replaceWith(live ? live.cloneNode(true) : buildCommandChip(attrs));
}
