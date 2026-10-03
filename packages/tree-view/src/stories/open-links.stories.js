import { html } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import openInNewIcon from "@material-design-icons/svg/outlined/open_in_new.svg?raw";

import {
  file,
  folder,
  renderFileIcon,
  renderTrailingIcon,
  storyStyles,
  writeLog,
} from "./shared.js";

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
    /** @type {import("lit/directives/ref.js").Ref<HTMLElement>} */
    const log = createRef();
    return html`
      ${storyStyles}
      <div class="story">
        <p class="story__hint">
          Middle-click (or Ctrl/Cmd+Enter) a file to open it via getHref; do the same on "src/" to
          get the tvx-open event instead.
        </p>
        <tvx-tree-view
          .items=${[
            folder({
              id: "src",
              label: "src/",
              children: [file({ id: "index", label: "index.js" })],
            }),
            file({ id: "readme", label: "README.md", trailingIcon: openInNewIcon }),
          ]}
          .getHref=${(/** @type {any} */ item) =>
            // only files resolve to a URL — directories fall through to tvx-open
            item.directory ? undefined : `/files/${item.id}`}
          .renderItemLeading=${renderFileIcon}
          .renderItemTrailing=${renderTrailingIcon}
          @tvx-open=${(/** @type {CustomEvent} */ event) =>
            writeLog(
              log,
              `tvx-open: getHref returned nothing for "${event.detail.id}" — app decides how to open it.`,
            )}
        ></tvx-tree-view>
        <pre class="story__log" ${ref(log)}></pre>
      </div>
    `;
  },
};
