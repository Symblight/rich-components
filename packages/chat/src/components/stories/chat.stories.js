import { html } from "lit";

import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";
import plus from "@material-design-icons/svg/outlined/add.svg?raw";
import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";

import "../../index.js";

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
      <chx-message-list></chx-message-list>
      <chx-message-composer>
        <div slot="leading">
          <md-icon-button variant="tonal" selected> ${unsafeSVG(plus)} </md-icon-button>
        </div>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};

/** chx-message-list is optional — chx-chat lays out just the composer fine without one. */
/** @type {Story} */
export const ComposerOnly = {
  render: () => html`
    <chx-chat label="Write your prompt...">
      <chx-message-composer>
        <md-button slot="actions" variant="text">Opus 4.8</md-button>
        <md-icon slot="flight-icon">${unsafeSVG(stop)}</md-icon>
      </chx-message-composer>
    </chx-chat>
  `,
};
