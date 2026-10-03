import openInNewIcon from "@material-design-icons/svg/outlined/open_in_new.svg?raw";

import { createTree, file, folder, hintText, logPanel, stack } from "./shared.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Tree View/Open Links",
  component: "tvx-tree-view",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          '"Open in a new tab" (middle-click, or Ctrl/Cmd+Enter) resolves `getHref(item)`: a safe ' +
          "URL is opened with `window.open()`, otherwise a cancelable `tvx-open` fires so the app " +
          "can route itself. Plain Enter/click never goes through this path.",
      },
    },
  },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const GetHrefAndOpenEvent = {
  render: () => {
    const tree = createTree({
      items: [
        folder({ id: "src", label: "src/", children: [file({ id: "index", label: "index.js" })] }),
        file({ id: "readme", label: "README.md", trailingIcon: openInNewIcon }),
      ],
      // only files resolve to a URL — directories fall through to tvx-open
      getHref: (item) => (item.directory ? undefined : `/files/${item.id}`),
    });

    const log = logPanel();
    tree.addEventListener("tvx-open", (event) => {
      const { id } = /** @type {CustomEvent} */ (event).detail;
      log.textContent = `tvx-open: getHref returned nothing for "${id}" — app decides how to open it.`;
    });

    return stack(
      hintText(
        'Middle-click (or Ctrl/Cmd+Enter) a file to open it via getHref; do the same on "src/" to ' +
          "get the tvx-open event instead.",
      ),
      tree,
      log,
    );
  },
};
