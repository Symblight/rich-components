# rich-components

Framework-agnostic rich UI web components, built with [Lit](https://lit.dev)
## Packages

### [`@symblight/data-grid`](./packages/data-grid)

A virtualized Material Design 3 data grid. Sortable, resizable, paginated columns; row selection; master-detail rows; tree/grouped data — all backed by `@tanstack/lit-virtual` so only visible rows touch the DOM. See the [package README](./packages/data-grid/README.md) for the full API.

### [`@symblight/chat`](./packages/chat)

A Material Design 3 chat component. Layout is a scrollable list of messages filling the available space, with a composer docked to the bottom — a text field, send button, and emoji picker for reacting to or composing messages. Built from `@symblight/wc-material` primitives (text-field, button, icon-button).

This package is currently scaffolding only: build tooling, Storybook, and package metadata are in place, but no components have been implemented yet.

## Development

This is a [pnpm](https://pnpm.io) workspace (`packages/*`). Each package builds, tests, and documents itself independently:

```bash
pnpm install

pnpm --filter @symblight/data-grid sb     # Storybook for data-grid
pnpm --filter @symblight/message-composer sb          # Storybook for message-composer

pnpm build   # build all packages
pnpm test    # test all packages
pnpm lint    # lint all packages
```

Every package follows the same layout and tooling: Vite for builds (ESM output, per-module preserved, `.d.ts` generated via `vite-plugin-dts`), Storybook (`@storybook/web-components-vite`) for component docs and visual development, `@web/test-runner` + Playwright for tests, and JSDoc-typed `.js` source checked by `tsc --checkJs`.

## License

MIT
