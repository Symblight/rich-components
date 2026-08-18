# @symblight/chat

A Material Design 3 chat web component built with [Lit](https://lit.dev). Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else custom elements run.

`<chx-chat>` orchestrates the layout — a scrollable message list fills the available space, a composer is docked to the bottom.

## Layout

- **Message list** — the main scrollable area, filling all available height. Renders the conversation as a list of messages.
- **Composer** — docked to the bottom: a rich-text field for the outgoing message and a send button alongside it.
- **Commands** — an opt-in `@`/`/`-style trigger-a-menu-get-a-chip feature for the composer. See [Commands API](./src/docs/commands.md).

Built on top of [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) primitives (text-field, button, icon-button, menu, chips).

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
