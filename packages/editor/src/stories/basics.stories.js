import { html } from "lit";

import "../index.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Editor/Basics",
  component: "edx-editor",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

/** @type {Story} */
export const Empty = {
  render: () => html`<edx-editor></edx-editor>`,
};
