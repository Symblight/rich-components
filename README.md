# rich-components

Framework-agnostic rich UI web components, built with [Lit](https://lit.dev)
## Packages

### [`@symblight/data-grid`](./packages/data-grid)

A virtualized Material Design 3 data grid. Sortable, resizable, paginated columns; row selection; master-detail rows; tree/grouped data — only visible rows ever touch the DOM, however large the underlying dataset. See the [package README](./packages/data-grid/README.md) for the full API.

### [`@symblight/chat`](./packages/chat)

A Material Design 3 chat component. Layout is a virtualized, scrollable list of messages filling the available space, with a composer docked to the bottom — a rich text field, send button, attachments, and slash commands. Supports streaming replies, typing/"other side is composing" indicators, customizable message rendering (avatar, author label, actions), and pagination for loading older history.

### [`@symblight/tree-view`](./packages/tree-view)

A Material Design 3 hierarchical tree view, following the WAI-ARIA APG tree pattern — expandable/collapsible nodes, single- or checkbox-based multi-select, roving-tabindex keyboard navigation, typeahead, and async-loaded branches. Data-driven (`.items`) or fully declarative (`<tvx-tree-item>` markup). See the [design spec](./.claude/plans/tree-view.spec.md) and the [package README](./packages/tree-view/README.md).

## Development

This is a [pnpm](https://pnpm.io) workspace (`packages/*`). Each package builds, tests, and documents itself independently:

```bash
pnpm install

pnpm --filter @symblight/data-grid sb     # Storybook for data-grid
pnpm --filter @symblight/chat sb          # Storybook for chat
pnpm --filter @symblight/tree-view sb     # Storybook for tree-view

pnpm build   # build all packages
pnpm test    # test all packages
pnpm lint    # lint all packages
```

Every package follows the same layout and tooling: Vite for builds (ESM output, per-module preserved, `.d.ts` generated via `vite-plugin-dts`), Storybook (`@storybook/web-components-vite`) for component docs and visual development, `@web/test-runner` + Playwright for tests, and JSDoc-typed `.js` source checked by `tsc --checkJs`.

## License

MIT
