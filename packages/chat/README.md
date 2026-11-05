# @symblight/chat

A Material Design 3 chat web component built with [Lit](https://lit.dev). Framework-agnostic — works the same in a plain HTML page, React, Vue, Svelte, or anywhere else custom elements run.

`<chx-chat>` orchestrates the layout — a scrollable message list fills the available space, a composer is docked to the bottom.

## Layout

- **Message list** — the main scrollable area, filling all available height. Renders the conversation as a list of messages, backed by `chx-chat`'s own optimistic message store: sending, streaming replies, retry/regenerate/stop, pagination and scroll behavior. See [Messages API](./src/docs/messages.md).
- **Composer** — docked to the bottom: a rich-text field for the outgoing message and a send button alongside it. While a turn is in flight that button becomes a stop button, which aborts the reply.
- **Commands** — an opt-in `@`/`/`-style trigger-a-menu-get-a-chip feature for the composer. See [Commands API](./src/docs/commands.md).
- **Attachments** — an opt-in file-attachment row above the composer, with a file picker button, OS drag-and-drop, and a default card per file. See [Attachments API](./src/docs/attachments.md).
- **Paste chip** — pasting `paste-threshold`+ lines into the composer collapses the paste into a single "N lines" chip instead of flooding the field; expands back to the full text on send. See [Paste chip API](./src/docs/paste-chip.md).
- **Code block paste** — pasting code into the composer collapses it into an editable, syntax-highlighted `chx-code-block`. See [Code block paste API](./src/docs/code-block-paste.md).
- **Conversations** — optional: hold more than one conversation's worth of messages at once, each cached independently (messages, pagination, scroll position), and switch which one is on screen by reassigning `activeConversationId`. No built-in picker component — bring your own. See [Conversations API](./src/docs/conversations.md).
- **Agentic parts** — opt-in elements for an AI agent's structured output: tool-call cards, reasoning disclosures, plan checklists, diffs, and a permission banner docked above the composer. The package ships the elements; the renderers that turn message parts into them are yours. See [Agentic parts API](./src/docs/agentic.md).

Built on top of [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) primitives (button, icon-button, icon, menu, chips, card, avatar, list, badge, tooltip, progress-circular, skeleton).

## Public API

`<chx-chat>` is the entry point — everything below is reachable directly on it.
`chx-message-composer`/`chx-message-list` are consumer-authored light-DOM children (`slot="message-
composer"`/`slot="message-list"`) — properties specific to them, like the composer's `placeholder`,
its `send-label`/`stop-label`, or its `stop` slot (replaces the icon inside the send/stop button),
are set directly on those elements rather than forwarded through `chx-chat`.

The agentic elements live behind a second entry point, `@symblight/chat/agent`, so a messenger that
never imports it bundles none of them — see [Agentic parts API](./src/docs/agentic.md).

The tables below cover the surface most apps reach for. The full reference — the adapter contract,
streaming chunk shapes, `ChxMessage`/`ChxMessagePart`, custom rendering, keyboard/a11y and scroll
behavior — is in [Messages API](./src/docs/messages.md).

### Properties

| Property               | Type                                               | Notes                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading`              | `boolean`                                          | Reflected attribute — an override, not a state. The composer is pushed `loading \|\| busy`, so an in-flight turn already turns its send button into a stop button without this being set. Assign it only for a transport `chx-chat` doesn't drive (a messenger's local echo). |
| `status`               | `"ready" \| "submitted" \| "streaming" \| "error"` | **Read-only**, derived from the active conversation's in-flight deliveries; nothing assigns it. `submitted` is the window between a send and its first chunk.                                                                                                                 |
| `busy`                 | `boolean`                                          | **Read-only** — `status` narrowed to `submitted \| streaming`.                                                                                                                                                                                                                |
| `activeConversationId` | `string \| undefined`                              | Optional — switches which conversation is on screen. See [Conversations API](./src/docs/conversations.md).                                                                                                                                                                    |
| `conversations`        | `ChxConversation[] \| undefined`                   | Picker metadata, stored only. See [Conversations API](./src/docs/conversations.md).                                                                                                                                                                                           |

### Methods

| Method            | Signature                                    | Notes                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setText`         | `(text: string): void`                       | Replaces the composer's document with plain text — e.g. pre-filling a draft or a suggested reply. Not called `setValue`: `chx-textbox` is form-associated and already inherits a `setValue` with an unrelated, form-value-only meaning (see its own doc comment).        |
| `attachFile`      | `(file: File): void`                         | Attaches a file programmatically — same effect as picking or dropping one. A no-op if no `<chx-attachments>` is connected. See [Attachments API](./src/docs/attachments.md).                                                                                             |
| `insertAtCommand` | `(target: string \| null, node: Node): void` | Resolves an in-progress command search. See [Commands API](./src/docs/commands.md).                                                                                                                                                                                      |
| `refresh`         | `(conversationId?: string): void`            | Clears and re-fetches a conversation (defaults to the active one, or the only one in a single-conversation app). See [Conversations API](./src/docs/conversations.md).                                                                                                   |
| `stop`            | `(): void`                                   | Aborts every in-flight delivery for the active conversation — what the composer's stop button reaches through `chx-stop`. Settles this chat's turn state at once; ending the turn's messages is still the adapter's job, see [Agentic parts API](./src/docs/agentic.md). |
| `cancel`          | `(messageId: string): void`                  | Aborts one delivery by the id it is tracked under (a send's own id, or a reply's id for a `regenerate` in flight) — backgrounded conversations included.                                                                                                                 |

### Events

| Event                            | `detail`                                               | Notes                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chx-send-message`               | `{ value: string, html: string, attachments: File[], state: unknown }` | Fired when the user sends — `value`/`html` are the composed text, `attachments` is whatever's currently in the attachments row at that moment, `state` what `input.getState()` returns (kept as the message's `composerState`). Cancelable: `preventDefault()` vetoes the send and keeps the draft intact. |
| `chx-change`                     | `{ value: string, html: string, attachments: File[] }` | Fired on every edit — same shape as `chx-send-message`, kept live while composing.                                                                                                                                        |
| `chx-messages-change`            | `{ messages: ChxMessage[] }`                           | Fired after every local mutation (send, streamed chunk, retry, ingest) that lands on the active conversation. Purely a notification.                                                                                      |
| `chx-active-conversation-change` | `{ conversationId: string }`                           | Listened for on `chx-chat` itself — dispatch it from a picker UI to switch conversations. See [Conversations API](./src/docs/conversations.md).                                                                           |
| `chx-stop`                       | —                                                      | Dispatched by the composer's stop button while a turn is in flight; `chx-chat` answers it with `stop()`. Listen lower and call `stopPropagation()` to intercept.                                                          |
| `chx-delivery-start`             | `{ messageId, conversationId }`                        | A send/regenerate began streaming. Carries the id `cancel()` takes — a send's own id is generated inside `chx-chat` and is not in `chx-send-message`.                                                                     |
| `chx-delivery-end`               | `{ messageId, conversationId, outcome }`               | `outcome` is `completed` / `cancelled` / `failed`.                                                                                                                                                                        |

Commands (`chx-command-query`/`chx-command-confirm`/`chx-command-navigate`/`chx-command-selected`)
and attachments (`chx-attach`/`chx-attachment-remove`) each have their own event contract, covered
in their respective docs linked above rather than duplicated here. The paste chip and code block
paste features have no events of their own — they're opt-in via `<chx-paste-long-text>`/
`<chx-code-block-paste>` placed inside `<chx-message-composer>` (see
[Paste chip API](./src/docs/paste-chip.md), [Code block paste API](./src/docs/code-block-paste.md));
`chx-send-message`/`chx-change`'s `value`/`html` already contain the full pasted text regardless of
whether a chip is currently shown.

## Install

```bash
npm install @symblight/chat lit
```

`lit` is a peer dependency. [`@symblight/wc-material`](https://www.npmjs.com/package/@symblight/wc-material) installs automatically.

## Theming

Every color, size and font is read from CSS custom properties. The components have no hard-coded theme of their own. Start from a Material Design 3 system token set (`--md-sys-*`), for example one generated with [`@symblight/md-colors`](https://www.npmjs.com/package/@symblight/md-colors):

```bash
npm install @symblight/md-colors
npx md-colors --sourceColor="#6750A4" --scheme=light --output=./theme.css
```

```html
<link rel="stylesheet" href="./theme.css" />
```

### Token tiers

```
--md-sys-*          MD3 system tokens (your theme.css)
   ↓ fallback
--chx-chat-*        chat-wide theme: typography, color roles, shape, elevation
   ↓ default
--chx-<component>-* one component: --chx-message-*, --chx-textbox-*, --chx-code-block-*, …
```

- **`--chx-chat-*`** retunes every chat component at once. Set it on `chx-chat` or any ancestor, and it reaches components however deep they sit in the shadow DOM. No component ever declares one, so your value always wins. Each falls back to the matching `--md-sys-*` token, or to a built-in default where MD3 has no equivalent.
- **`--chx-<component>-*`** retunes one component. Its defaults come from the chat tier. Set it on the element itself, or through `::part()`.
- To recolor the `md-*` controls inside the chat (buttons, lists) as well, set `--md-sys-color-*` on `chx-chat` instead of `--chx-chat-color-*`. `--chx-chat-font-family` already reaches them.

```css
chx-chat {
  --chx-chat-font-family: "Inter", sans-serif;
  --chx-chat-body-large-font-size: 1.0625rem; /* message + composer text */
  --chx-chat-body-large-line-height: 1.625rem; /* change it together with the size */
  --chx-chat-color-primary-container: #d8e6ff; /* own-message bubble */
  --chx-chat-shape-corner-large: 1.25rem; /* message bubbles */
}
```

### `--chx-chat-*` reference

**Typography**

| Token                                               | Default                                 | Used by                                                              |
| --------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `--chx-chat-font-family`                            | `--md-sys-typescale-font-family`        | everything, including `md-*` children                                |
| `--chx-chat-mono-font-family`                       | `"SF Mono", ui-monospace, …, monospace` | code blocks                                                          |
| `--chx-chat-font-weight-regular` / `-medium`        | `400` / `500`                           | body text / authors, labels, emphasis                                |
| `--chx-chat-body-large-font-size` / `-line-height`  | `1rem` / `1.5rem`                       | message and composer text                                            |
| `--chx-chat-body-medium-font-size` / `-line-height` | `0.875rem` / `1.25rem`                  | compact message and composer text, agent rows, banner, typing, hints |
| `--chx-chat-body-small-font-size` / `-line-height`  | `0.75rem` / `1rem`                      | agent row metadata                                                   |
| `--chx-chat-label-large-font-size`                  | `0.875rem`                              | —                                                                    |
| `--chx-chat-label-medium-font-size`                 | `0.75rem`                               | author, date divider, code-block header                              |
| `--chx-chat-label-small-font-size`                  | `0.6875rem`                             | time, delivery status, attachment name                               |
| `--chx-chat-code-font-size` / `-line-height`        | `0.8125rem` / `1.7`                     | code blocks, diffs, tool-call file names                             |

The size defaults come from the matching `--md-sys-typescale-*-size` / `-line-height` token when your theme defines one.

**Color:** `--chx-chat-color-<role>`, each defaulting to `--md-sys-color-<role>`

| Role                                                             | Used for                                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `on-surface`                                                     | primary text: incoming messages, composer input, labels                                                                                              |
| `on-surface-variant`                                             | secondary text: author, time, status, placeholder, icons                                                                                             |
| `background`, `surface`, `surface-container-lowest` … `-highest` | chat background, bubbles, composer field, code blocks                                                                                                |
| `primary-container` / `on-primary-container`                     | own-message bubble                                                                                                                                   |
| `primary`                                                        | accents: unread marker, focus rings, running status                                                                                                  |
| `secondary-container`                                            | selected message, active conversation                                                                                                                |
| `tertiary`, `tertiary-container` / `on-tertiary-container`       | a tool call awaiting permission                                                                                                                      |
| `error`, `error-container` / `on-error-container`                | failures, the danger banner                                                                                                                          |
| `outline`, `outline-variant`                                     | dividers, rules, pending/cancelled status icons                                                                                                      |
| `shadow`                                                         | the base color for `elevation-*`                                                                                                                     |
| `diff-added` / `diff-removed`                                    | `+N` / `−N` counts and diff lines in code blocks. MD3 has no green role, so these default to built-in hues with dark-mode variants, not `--md-sys-*` |

**Shape and elevation**

| Token                                                                                              | Default                                                     |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `--chx-chat-shape-corner-extra-small` / `-small` / `-medium` / `-large` / `-extra-large` / `-full` | `--md-sys-shape-corner-*` (`0.25rem` … `1.75rem`, `9999px`) |
| `--chx-chat-elevation-1`                                                                           | `0 1px 3px` shadow at 12%, compact message actions          |
| `--chx-chat-elevation-2`                                                                           | `0 2px 6px` shadow at 30%, floating buttons                 |

### Compact density

`compact` on `chx-chat` switches message and composer text from body-large to body-medium and tightens the spacing. Agent rows inside a compact message pick up the `--chx-part-*` density tokens (`row-height`, `icon-size`, `gap`, `padding-inline`) automatically. See [Agentic parts API](./src/docs/agentic.md).

### Using the tokens in your own components

`@symblight/chat/tokens.css` is the same token layer every chat component loads first. Add it to your own component's shadow root, for example a custom `partElements` renderer, and it resolves `--chx-chat-*` exactly like the built-in components do. Your styles then read the resolved values, `--_chx-*`, named after the public tokens: `--_chx-body-large-font-size`, `--_chx-color-on-surface`, `--_chx-shape-corner-medium`, and so on.

```js
import tokens from "@symblight/chat/tokens.css" with { type: "css" };

class MyPart extends LitElement {
  static styles = [
    tokens,
    css`
      :host {
        color: var(--_chx-color-on-surface);
        font-size: var(--_chx-body-large-font-size);
        line-height: var(--_chx-body-large-line-height);
      }
    `,
  ];
}
```

The file's rules target `:host`, so it only applies inside a shadow root. On a regular page, set the `--chx-chat-*` tokens directly instead. With a bundler that doesn't support CSS module scripts, import the file as a string (Vite: `?inline`) and wrap it in Lit's `unsafeCSS`.

## Development

```bash
pnpm install
pnpm --filter @symblight/chat sb   # Storybook dev server
pnpm --filter @symblight/chat test
pnpm --filter @symblight/chat build
```

## License

MIT
