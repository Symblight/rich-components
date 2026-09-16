# @symblight/chat

A Material Design 3 chat web component built with [Lit](https://lit.dev). Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else custom elements run.

`<chx-chat>` orchestrates the layout — a scrollable message list fills the available space, a composer is docked to the bottom.

## Layout

- **Message list** — the main scrollable area, filling all available height. Renders the conversation as a list of messages.
- **Composer** — docked to the bottom: a rich-text field for the outgoing message and a send button alongside it.
- **Commands** — an opt-in `@`/`/`-style trigger-a-menu-get-a-chip feature for the composer. See [Commands API](./src/docs/commands.md).
- **Attachments** — an opt-in file-attachment row above the composer, with a file picker button, OS drag-and-drop, and a default card per file. See [Attachments API](./src/docs/attachments.md).
- **Paste chip** — pasting `paste-threshold`+ lines into the composer collapses the paste into a single "N lines" chip instead of flooding the field; expands back to the full text on send. See [Paste chip API](./src/docs/paste-chip.md).
- **Conversations** — optional: hold more than one conversation's worth of messages at once, each cached independently (messages, pagination, scroll position), and switch which one is on screen by reassigning `activeConversationId`. No built-in picker component — bring your own. See [Conversations API](./src/docs/conversations.md).

Built on top of [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) primitives (text-field, button, icon-button, menu, chips).

## Public API

`<chx-chat>` is the package's single public export — everything below is reachable directly on it.
`chx-message-composer`/`chx-message-list` are consumer-authored light-DOM children (`slot="message-
composer"`/`slot="message-list"`) — properties specific to them, like the composer's `placeholder`,
are set directly on those elements rather than forwarded through `chx-chat`.

### Properties

| Property               | Type                              | Notes                                                                                       |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `loading`              | `boolean`                          | Reflected attribute — switches the composer's send button to its loading/flight-icon state. |
| `activeConversationId` | `string \| undefined`              | Optional — switches which conversation is on screen. See [Conversations API](./src/docs/conversations.md). |
| `conversations`        | `ChxConversation[] \| undefined`   | Picker metadata, stored only. See [Conversations API](./src/docs/conversations.md).         |

### Methods

| Method            | Signature                                    | Notes                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setText`         | `(text: string): void`                       | Replaces the composer's document with plain text — e.g. pre-filling a draft or a suggested reply. Not called `setValue`: `chx-textbox` is form-associated and already inherits a `setValue` with an unrelated, form-value-only meaning (see its own doc comment). |
| `attachFile`      | `(file: File): void`                         | Attaches a file programmatically — same effect as picking or dropping one. A no-op if no `<chx-attachments>` is connected. See [Attachments API](./src/docs/attachments.md).                                                                                      |
| `insertAtCommand` | `(target: string \| null, node: Node): void` | Resolves an in-progress command search. See [Commands API](./src/docs/commands.md).                                                                                                                                                                               |
| `refresh`         | `(conversationId?: string): void`            | Clears and re-fetches a conversation (defaults to the active one, or the only one in a single-conversation app). See [Conversations API](./src/docs/conversations.md).                                                                                            |

### Events

| Event              | `detail`                                               | Notes                                                                                                                                          |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `chx-send-message` | `{ value: string, html: string, attachments: File[] }` | Fired when the user sends — `value`/`html` are the composed text, `attachments` is whatever's currently in the attachments row at that moment. Cancelable: `preventDefault()` vetoes the send and keeps the draft intact. |
| `chx-change`       | `{ value: string, html: string, attachments: File[] }` | Fired on every edit — same shape as `chx-send-message`, kept live while composing.                                                             |
| `chx-messages-change` | `{ messages: ChxMessage[] }`                        | Fired after every local mutation (send, streamed chunk, retry, ingest) that lands on the active conversation. Purely a notification.           |
| `chx-active-conversation-change` | `{ conversationId: string }`                | Listened for on `chx-chat` itself — dispatch it from a picker UI to switch conversations. See [Conversations API](./src/docs/conversations.md). |

Commands (`chx-command-query`/`chx-command-confirm`/`chx-command-navigate`/`chx-command-selected`)
and attachments (`chx-attach`/`chx-attachment-remove`) each have their own event contract, covered
in their respective docs linked above rather than duplicated here. The paste chip feature has no
events of its own — it's opt-in via `<chx-paste-long-text>` slotted into `<chx-message-composer>`
(see [Paste chip API](./src/docs/paste-chip.md)); `chx-send-message`/`chx-change`'s `value`/`html`
already contain the full pasted text regardless of whether a chip is currently shown.

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
