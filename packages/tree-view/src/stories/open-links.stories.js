import "../index.js";
import "@symblight/wc-material/icon";

import openInNewIcon from "@material-design-icons/svg/outlined/open_in_new.svg?raw";

import { buildItem, file, folder, hintText, icon, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Open Links",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A tree item isn't inherently a link, so \"open in a new tab\" (middle-click, or " +
          "Ctrl/Cmd+Enter) is handled separately from plain Enter/click activation: `getHref(node)` " +
          "is an optional callback that returns a URL for a given node — if it does, the tree calls " +
          "`window.open()` directly; if it returns `undefined` (or isn't set), a cancelable " +
          "`tvx-open` event fires instead so the app can route itself. Plain Enter with no modifier " +
          "never goes through this path at all — that's ordinary selection/activation.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

// ─── getHref for files, tvx-open fallback for everything else ───────────────

/** @type {Story} */
export const GetHrefAndOpenEvent = {
  render: () => {
    const tree = document.createElement("tvx-tree-view");

    const readme = buildItem(file({ id: "readme", label: "README.md" }));
    readme.append(Object.assign(icon(openInNewIcon), { slot: "trailing" }));

    tree.items = [
      buildItem(
        folder({
          id: "src",
          label: "src/",
          children: [file({ id: "index", label: "index.js" })],
        }),
      ),
      readme,
    ];

    // Only files resolve to a real URL — a directory node has nothing to open, so getHref
    // returning undefined for it falls through to the tvx-open event below instead.
    tree.getHref = (node) => (node.hasChildren ? undefined : `/files/${String(node.key)}`);

    const log = logPanel();
    tree.addEventListener("tvx-open", (event) => {
      const { key } = /** @type {CustomEvent} */ (event).detail;
      log.textContent = `tvx-open: getHref returned nothing for "${key}" — app decides how to open it.`;
    });

    return stack(
      hintText(
        "Middle-click (or focus a row and press Ctrl/Cmd+Enter) on \"index.js\"/\"README.md\" — " +
          "getHref resolves a URL for them, so the tree calls window.open() directly and nothing is " +
          "logged. Do the same on \"src/\" — getHref returns undefined for a directory, so the " +
          "cancelable tvx-open event fires instead, logged below. Plain Enter on any row just " +
          "selects it, the same as always — it never touches this path.",
      ),
      tree,
      log,
    );
  },
};
