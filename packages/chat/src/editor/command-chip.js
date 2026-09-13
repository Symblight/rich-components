/**
 * Reads `{templateId, label, icon, data}` off any chip-shaped element.
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
 * Builds a live chip by cloning the app's `<template id="{templateId}">`. Missing template -> bare span.
 * @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs
 * @returns {HTMLElement}
 */
export function buildChipElement({ templateId, label, icon, data }) {
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
 * Finds the chip-shaped element within a node handed to `insertAtRange`/`insertChip` — itself if
 * already tagged, or its first `[data-template-id]` descendant.
 * @param {Node} node
 * @returns {HTMLElement | null}
 */
export function findChipElement(node) {
  const parent = /** @type {ParentNode} */ (node);
  const chip =
    node instanceof Element && node.hasAttribute("data-template-id")
      ? node
      : parent.querySelector?.("[data-template-id]");
  return chip instanceof HTMLElement && chip.dataset.templateId ? chip : null;
}

/**
 * Stamps `data-template-id` if missing — a `buildChip` override that omits it makes insertion
 * silently no-op, confirmed live, so it's enforced here instead of left to the override.
 * @param {HTMLElement} chip
 * @param {string} templateId
 * @returns {HTMLElement}
 */
export function ensureTemplateId(chip, templateId) {
  if (!chip.hasAttribute("data-template-id")) chip.setAttribute("data-template-id", templateId);
  return chip;
}

/**
 * Tags `node`'s chip-shaped element with `ownerId` — purely informational data a consumer's own
 * `partElements.chip` renderer can key off of later (e.g. a per-source look), not a dispatch key
 * the library resolves itself. Shared by `chx-command-picker`/`chx-attachments`' own `#stampOwner`.
 * @param {Node} node
 * @param {string} ownerId
 */
export function stampChipOwner(node, ownerId) {
  const chip = findChipElement(node);
  if (chip) chip.dataset.chipOwnerId = ownerId;
}

/**
 * Sets up a chip-shell `<template>` from a `slot="chip"` child, or builds a default `<chx-chip>`.
 * `host.id` must already be set — it derives the template's own id.
 * @param {HTMLElement} host
 * @returns {HTMLTemplateElement}
 */
export function setupChipTemplate(host) {
  const slotted = /** @type {HTMLElement | null} */ (host.querySelector('[slot="chip"]'));

  if (slotted instanceof HTMLTemplateElement) {
    if (!slotted.id) slotted.id = `${host.id}-chip-template`;
    const root = /** @type {HTMLElement | null} */ (slotted.content.firstElementChild);
    if (root && !root.hasAttribute("data-template-id")) {
      root.setAttribute("data-template-id", slotted.id);
    }
    return slotted;
  }

  // Plain element, not a <template> — adopt it into one so it's still findable by id.
  if (slotted) {
    const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
    template.id = `${host.id}-chip-template`;
    if (!slotted.hasAttribute("data-template-id")) {
      slotted.setAttribute("data-template-id", template.id);
    }
    slotted.remove();
    template.content.append(slotted);
    host.appendChild(template);
    return template;
  }

  const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
  template.id = `${host.id}-chip-template`;
  const chip = document.createElement("chx-chip");
  chip.setAttribute("data-template-id", template.id);
  template.content.append(chip);
  host.appendChild(template);
  return template;
}
