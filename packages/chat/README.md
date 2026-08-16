# @symblight/chat

A Material Design 3 chat web component built with [Lit](https://lit.dev). Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else custom elements run.

> **Status:** scaffolding only. Package metadata, build tooling, and Storybook are set up; no components have been implemented yet.

## Planned layout

- **Message list** — the main scrollable area, filling all available height. Renders the conversation as a list of messages.
- **Composer** — docked to the bottom: a text field for the outgoing message and a send button alongside it.
- **Emoji picker** — for reacting to messages and/or inserting emoji into the composer.

Built on top of [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) primitives (text-field, button, icon-button).

## Install

```bash
npm install @symblight/message-composer lit
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
pnpm --filter @symblight/message-composer sb   # Storybook dev server
pnpm --filter @symblight/message-composer test
pnpm --filter @symblight/message-composer build
```

## License

MIT
