import { html } from "lit";

import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";
import "@symblight/wc-material/icon";

import "../../index.js";
import "../mention-field/mention-field.js";

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Chat",
  component: "chx-chat",
  tags: ["autodocs"],
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */
/** @type {Story} */
export const Basic = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <md-button slot="actions" variant="text">Opus 4.8</md-button>
      <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      <chx-mention-field mentionCharacter="@" slot="mention-field"></chx-mention-field>
    </chx-chat>
  `,
};
