# @symblight/chat

A Material Design 3 chat web component built with [Lit](https://lit.dev). Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else custom elements run.

`<chx-chat>` orchestrates the layout — a scrollable message list fills the available space, a composer is docked to the bottom.

## Layout

- **Message list** — the main scrollable area, filling all available height. Renders the conversation as a list of messages.
- **Composer** — docked to the bottom: a rich-text field for the outgoing message and a send button alongside it.
- **Commands** — an opt-in `@`/`/`-style trigger-a-menu-get-a-chip feature for the composer. See [Commands API](./src/docs/commands.md).
- **Attachments** — an opt-in file-attachment row above the composer, with a file picker button, OS drag-and-drop, and a default card per file. See [Attachments API](./src/docs/attachments.md).

Built on top of [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) primitives (text-field, button, icon-button, menu, chips).

## Public API

`<chx-chat>` is the package's single public export — everything below is reachable directly on it;
it forwards to `chx-message-composer`/`chx-textbox` internally so you never need to reach into
either yourself.

### Properties

| Property | Type | Notes |
|---|---|---|
| `label` | `string` | Applied as the composer's textbox `aria-label`. |
| `loading` | `boolean` | Reflected attribute — switches the composer's send button to its loading/flight-icon state. |

### Methods

| Method | Signature | Notes |
|---|---|---|
| `setText` | `(text: string): void` | Replaces the composer's document with plain text — e.g. pre-filling a draft or a suggested reply. Not called `setValue`: `chx-textbox` is form-associated and already inherits a `setValue` with an unrelated, form-value-only meaning (see its own doc comment). |
| `attachFile` | `(file: File): void` | Attaches a file programmatically — same effect as picking or dropping one. A no-op if no `<chx-attachments>` is connected. See [Attachments API](./src/docs/attachments.md). |
| `insertAtCommand` | `(target: string \| null, node: Node): void` | Resolves an in-progress command search. See [Commands API](./src/docs/commands.md). |

### Events

| Event | `detail` | Notes |
|---|---|---|
| `chx-send-message` | `{ value: string, html: string, attachments: File[] }` | Fired when the user sends — `value`/`html` are the composed text, `attachments` is whatever's currently in the attachments row at that moment. |
| `chx-change` | `{ value: string, html: string, attachments: File[] }` | Fired on every edit — same shape as `chx-send-message`, kept live while composing. |

Commands (`chx-command-query`/`chx-command-confirm`/`chx-command-navigate`/`chx-command-selected`)
and attachments (`chx-attach`/`chx-attachment-remove`) each have their own event contract, covered
in their respective docs linked above rather than duplicated here.

## Install

```bash
npm install @symblight/chat lit
```

`lit` is a peer dependency. [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) installs automatically.

## Theming

Every color is read from `--md-sys-color-*` custom properties (Material Design 3 system color tokens) — the component has no colors of its own. Generate a token set with [`@symblight/md-colors`](https://www.npmjs.com/package/@symblight/md-colors):

```bash
npm install @symblight/md-colors
npx md-colors --sourceColor="#6750A4" --scheme=light --output=./theme.css
```

```html
<link rel="stylesheet" href="./theme.css" />
```

## Development

```bash
pnpm install
pnpm --filter @symblight/chat sb   # Storybook dev server
pnpm --filter @symblight/chat test
pnpm --filter @symblight/chat build
```

## License

MIT
