# Public API

`<chx-chat>`'s imperative API is grouped into **namespaces**. Each is a getter on the element and on
`ChatController`, and each is backed by whichever part of the chat owns it:

| Namespace     | Needs                                     | For                                              |
| ------------- | ----------------------------------------- | ------------------------------------------------ |
| `delivery`    | —                                         | sending turns: retry, regenerate, stop, status   |
| `store`       | —                                         | cached messages: read, add, page, refresh, clear |
| `presence`    | —                                         | the other side's typing state                    |
| `viewport`    | a slotted `<chx-message-list>`            | scrolling                                        |
| `input`       | a slotted `<chx-message-composer>`        | the composer's text and inline chips             |
| `attachments` | a `<chx-attachments>` inside the composer | attached files                                   |

```js
const chat = document.querySelector("chx-chat");

chat.delivery.stop();
chat.store.refresh();
chat.presence.setTyping(true, "c2");
await chat.viewport.toMessage(searchHitId, { align: "center" });
chat.input.setText("Summarize the thread");
chat.input.focus();
chat.attachments.add(file);
```

Rules shared by every namespace:

- Reads are `get*` / `is*` / `has*`; everything else is an action.
- A trailing optional `conversationId` defaults to the active conversation.
- A namespace whose owner isn't mounted ignores calls and logs one console warning. Check
  `ChatController.isAvailable(ns)` to hide UI that would do nothing.
- Namespace objects are stable — destructuring (`const { viewport } = chat`) keeps working when the
  list or composer is swapped.
- `chx-*` events are unchanged; the namespaces sit next to them.

## Reference

### `delivery`

| Method                       | Notes                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `retry(messageId)`           | Re-sends a `status: "failed"` own message.                                               |
| `regenerate(messageId)`      | Redoes an assistant reply — the reply's id or its send's id. Needs `adapter.regenerate`. |
| `stop(conversationId?)`      | Aborts every in-flight delivery there.                                                   |
| `cancel(messageId)`          | Aborts one in-flight delivery, any conversation.                                         |
| `getStatus(conversationId?)` | `"ready" \| "submitted" \| "streaming" \| "error"`.                                      |
| `isBusy(conversationId?)`    | `submitted \| streaming`.                                                                |

### `store`

| Method                         | Notes                                                    |
| ------------------------------ | -------------------------------------------------------- |
| `getMessages(conversationId?)` | Without an id: what's on screen.                         |
| `add(message)`                 | Ingests one message, matched by `id`.                    |
| `loadMore()`                   | One older page of the active conversation.               |
| `refresh(conversationId?)`     | Clear + refetch via `adapter.listMessages`.              |
| `clear(conversationId?)`       | Clear without refetching. No argument clears everything. |
| `hasMore(conversationId?)`     | Older history left to load.                              |
| `isLoading(conversationId?)`   | A page fetch in flight.                                  |

### `presence`

| Method                                 | Notes                                    |
| -------------------------------------- | ---------------------------------------- |
| `setTyping(isTyping, conversationId?)` | Fires `chx-typing-change` when it flips. |
| `isTyping(conversationId?)`            |                                          |

### `viewport`

| Method                                         | Notes                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `toBottom(behavior?)`                          | Fires `chx-scroll-to-bottom`.                                                                  |
| `toMessage(id, {align, behavior}?)`            | `Promise<boolean>` — `false` when the message isn't loaded. Fetching older pages is up to you. |
| `isAwayFromBottom()`                           | Scrolled further than `buffer` from the bottom.                                                |
| `getScrollOffset()` / `scrollToOffset(offset)` | Save and restore a position.                                                                   |

### `input`

| Method                      | Notes                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `getValue()`                | `{value, html}`.                                                                                                                  |
| `setText(text)`             | Replaces the document with plain text.                                                                                            |
| `clear()`                   | Text only — files are `attachments.clear()`.                                                                                      |
| `focus()` / `focusEnd()`    | `composerEl.focus()` and `textboxEl.focus()` work too.                                                                            |
| `isEmpty()`                 |                                                                                                                                   |
| `insertChip(node, target?)` | With a `target` from `chx-command-query`, replaces that range — see [commands](./commands.md). Without one, inserts at the caret. |

### `attachments`

| Method         | Notes                                    |
| -------------- | ---------------------------------------- |
| `add(files)`   | One `File` or an array; `source: "api"`. |
| `remove(file)` |                                          |
| `clear()`      |                                          |
| `getFiles()`   |                                          |
| `open()`       | Opens the native file picker.            |

## `ChatController`

For your own Lit element inside `<chx-chat>` — a toolbar, a status line, a custom header:

```js
import { ChatController } from "@symblight/chat";

class ChatToolbar extends LitElement {
  #chat = new ChatController(this);

  render() {
    const { delivery, viewport } = this.#chat;
    return html`
      <span>${this.#chat.status}</span>
      <button ?disabled=${!this.#chat.busy} @click=${() => delivery.stop()}>Stop</button>
      <button ?hidden=${!this.#chat.awayFromBottom} @click=${() => viewport.toBottom("smooth")}>
        Latest
      </button>
    `;
  }
}
```

Reactive properties — read them in `render()`:

| Property                         | From          |
| -------------------------------- | ------------- |
| `status`, `busy`                 | `delivery`    |
| `messages`, `hasMore`, `loading` | `store`       |
| `typing`                         | `presence`    |
| `awayFromBottom`                 | `viewport`    |
| `files`                          | `attachments` |

The element re-renders only when something it read changed — a toolbar that reads `status` doesn't
re-render on every streamed chunk. Namespace `get*` calls are **not** tracked, so in `render()` use
the properties above, not `delivery.getStatus()`.

Also: `connected` (a `<chx-chat>` was found), `isAvailable(ns)`, and the six namespaces. Outside a
`<chx-chat>` the namespaces are no-ops, so rendering never throws. Importing your element before
`@symblight/chat` is fine — the controller connects once `<chx-chat>` is defined.

## Migrating from the element methods

| Before                                                      | After                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `chat.retry(id)` / `regenerate` / `cancel`                  | `chat.delivery.retry(id)` / `regenerate` / `cancel`                           |
| `chat.stop()`                                               | `chat.delivery.stop()`                                                        |
| `chat.status` / `chat.busy`                                 | `chat.delivery.getStatus()` / `isBusy()`, or `ChatController.status` / `busy` |
| `chat.addMessage(m)`                                        | `chat.store.add(m)`                                                           |
| `chat.loadMoreHistory()`                                    | `chat.store.loadMore()`                                                       |
| `chat.refresh(id)` / `chat.cache.clear(id)`                 | `chat.store.refresh(id)` / `chat.store.clear(id)`                             |
| `chat.setTyping(v, id)`                                     | `chat.presence.setTyping(v, id)`                                              |
| `chat.setText(t)` / `composer.setText(t)`                   | `chat.input.setText(t)`                                                       |
| `chat.focus()`                                              | `chat.input.focus()`                                                          |
| `composer.clearValue()`                                     | `chat.input.clear()` + `chat.attachments.clear()`                             |
| `composer.insertAtRange(target, node)`                      | `chat.input.insertChip(node, target)`                                         |
| `chat.attachFile(f)` / `composer.attachFile(f)`             | `chat.attachments.add(f)`                                                     |
| `list.scrollToBottom(b)`                                    | `chat.viewport.toBottom(b)`                                                   |
| `list.list.scrollToIndex(i)`                                | `chat.viewport.toMessage(id)`                                                 |
| `chat.editor`, `composer.editor`, `composer.textboxElement` | removed — use `chat.input`                                                    |
| `chat.messageListElement` / `messageComposerElement`        | removed — query your own markup                                               |
| `chat.dragging`                                             | removed                                                                       |

`<chx-infinity-scroll>` and `<chx-attachments>` keep their own methods for standalone use.
