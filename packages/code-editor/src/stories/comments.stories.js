import { html } from "lit";
import { ref } from "lit/directives/ref.js";

import "../index.js";
import { webPreset } from "../presets/index.js";

const SOURCE = `/** @param {ReadableStream<Uint8Array>} stream */
async function* readChunks(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export class StreamReader {
  constructor(buffer) {
    this.buffer = buffer;
  }

  async processStream(stream, { ingest }) {
    for await (const item of readChunks(stream)) {
      const chunk = ingest(item);
      if (!chunk) continue;
      this.buffer.push(chunk);
    }
    this.buffer.flushAll();
  }
}
`;

/** A proposal against SOURCE: the reader is released early. */
const BEFORE_PROPOSAL = SOURCE.replace(
  "      if (!chunk) continue;\n      this.buffer.push(chunk);",
  "      this.buffer.push(chunk);",
);

const MIN = 60_000;
const ago = (/** @type {number} */ minutes) => Date.now() - minutes * MIN;

const me = { id: "me", name: "Aleksei" };
const ada = { id: "ada", name: "Ada Lovelace" };

/** @type {import("../index.js").CdxThread[]} */
const THREADS = [
  {
    id: "t1",
    line: 3,
    comments: [
      {
        id: "c1",
        author: ada,
        body: "Why not hold the lock until the consumer is done?",
        createdAt: ago(42),
      },
      {
        id: "c2",
        author: me,
        body: "The generator's `finally` releases it, so early return is safe.",
        createdAt: ago(31),
      },
    ],
  },
  {
    id: "t2",
    line: 26,
    resolved: true,
    comments: [
      {
        id: "c3",
        author: ada,
        body: "flushAll() should also run on error.",
        createdAt: ago(300),
      },
      {
        id: "c4",
        author: me,
        body: "Done in the next commit.",
        createdAt: ago(280),
      },
    ],
  },
];

/** @type {import("@storybook/web-components").Meta} */
const meta = {
  title: "Code Editor/Comments API",
  component: "cdx-code-editor",
  argTypes: {
    mode: { control: "inline-radio", options: ["thread", "single"] },
    visibility: { control: "inline-radio", options: ["auto", "always", "never"] },
    maxLength: { control: "number" },
  },
  args: { mode: "thread", visibility: "auto", maxLength: 2000 },
};
export default meta;

/** @typedef {import("@storybook/web-components").StoryObj} Story */

const EVENTS = [
  "open",
  "draft",
  "submit",
  "cancel",
  "edit",
  "delete",
  "resolve",
  "toggle",
  "navigate",
];

const LOG_STYLE = `block-size: 9rem; overflow: auto; padding: 8px 12px; border-radius: 12px;
  background: var(--md-sys-color-surface-container, #eee); font: 12px/1.6 ui-monospace, monospace`;

/** Every `cdx-comment-*` event, newest first, in the `.log` under the editor.
 * @param {HTMLElement} root */
function attachLog(root) {
  if (root.dataset.logged) return;
  root.dataset.logged = "1";
  const log = /** @type {HTMLElement} */ (root.querySelector(".log"));
  for (const name of EVENTS) {
    root.addEventListener(`cdx-comment-${name}`, (event) => {
      const { detail } = /** @type {CustomEvent} */ (event);
      const row = document.createElement("div");
      row.textContent = `cdx-comment-${name}${event.cancelable ? " (cancelable)" : ""} ${JSON.stringify(detail)}`;
      log.prepend(row);
    });
  }
}

/** A ref for the story's wrapper: logs events, then runs the story's host behavior. It waits a
 *  frame — the template's children aren't rendered yet when a ref fires.
 * @param {(root: HTMLElement, editor: import("../index.js").CdxCodeEditor) => void} [host] */
const wire = (host) =>
  ref((el) => {
    if (!el) return;
    requestAnimationFrame(() => {
      const root = /** @type {HTMLElement} */ (el);
      attachLog(root);
      const editor = /** @type {import("../index.js").CdxCodeEditor | null} */ (
        root.querySelector("cdx-code-editor")
      );
      if (host && editor && !editor.dataset.host) {
        editor.dataset.host = "1";
        host(root, editor);
      }
    });
  });

/** @type {(root: HTMLElement, editor: import("../index.js").CdxCodeEditor) => void} The host
 *  answers after 0.7 s, like a GitHub / GitLab request: every third submit fails, and so does every
 *  third resolve or delete. */
const answerSubmitLate = (_root, editor) => {
  let attempts = 0;
  const fails = () => ++attempts % 3 === 0;
  editor.addEventListener("cdx-comment-submit", (event) => {
    const { threadId } = /** @type {CustomEvent} */ (event).detail;
    event.preventDefault();
    setTimeout(() => {
      if (fails()) editor.comments.failSubmit(threadId, "Couldn’t save — try again.");
      else
        editor.comments.confirmSubmit(
          threadId,
          { id: crypto.randomUUID() },
          { threadId: `server-${threadId}` },
        );
    }, 700);
  });
  editor.addEventListener("cdx-comment-resolve", (event) => {
    const { threadId, resolved } = /** @type {CustomEvent} */ (event).detail;
    event.preventDefault();
    setTimeout(() => {
      if (fails()) editor.comments.fail(threadId, "Couldn’t update the thread.");
      else editor.comments.resolve(threadId, resolved);
    }, 700);
  });
  editor.addEventListener("cdx-comment-delete", (event) => {
    const { threadId, commentId } = /** @type {CustomEvent} */ (event).detail;
    event.preventDefault();
    setTimeout(() => {
      if (fails()) editor.comments.fail(threadId, "Couldn’t delete the comment.");
      else editor.comments.remove(threadId, commentId);
    }, 700);
  });
};

/** @type {(root: HTMLElement, editor: import("../index.js").CdxCodeEditor) => void} Buttons on the
 *  element's bulk methods. */
const bulkButtons = (root, editor) => {
  for (const button of root.querySelectorAll("button[data-bulk]")) {
    button.addEventListener("click", () => {
      const action = /** @type {HTMLElement} */ (button).dataset.bulk;
      if (action === "clear") editor.comments.clear();
      else editor.comments.resolveAll(action === "resolve");
    });
  }
};

const BULK = html`<div style="display: flex; gap: 8px">
  <button data-bulk="resolve">Resolve all</button>
  <button data-bulk="reopen">Reopen all</button>
  <button data-bulk="clear">Clear all</button>
</div>`;

/** @type {(root: HTMLElement, editor: import("../index.js").CdxCodeEditor) => void} The host owns
 *  the threads: each event is applied to a store, then `threads` is assigned again. */
const ownThreads = (root, editor) => {
  const carrier = /** @type {import("../index.js").CdxComments} */ (
    root.querySelector("cdx-comments")
  );
  /** @type {import("../index.js").CdxThread[]} */
  let store = structuredClone(THREADS);
  const publish = () => (carrier.comments = structuredClone(store));
  publish();
  editor.addEventListener("cdx-comment-submit", (event) => {
    const { threadId, line, body, lineText } = /** @type {CustomEvent} */ (event).detail;
    setTimeout(() => {
      const comment = { id: crypto.randomUUID(), author: me, body, createdAt: Date.now() };
      const thread = store.find((item) => item.id === threadId);
      if (thread) thread.comments.push(comment);
      else store.push({ id: threadId, line, lineText, comments: [comment] });
      publish();
    }, 500);
  });
  editor.addEventListener("cdx-comment-resolve", (event) => {
    const { threadId, resolved } = /** @type {CustomEvent} */ (event).detail;
    const thread = store.find((item) => item.id === threadId);
    if (thread) thread.resolved = resolved;
    publish();
  });
  editor.addEventListener("cdx-comment-delete", (event) => {
    const { threadId, commentId } = /** @type {CustomEvent} */ (event).detail;
    store = store
      .map((item) =>
        item.id === threadId
          ? { ...item, comments: item.comments.filter((c) => c.id !== commentId) }
          : item,
      )
      .filter((item) => item.comments.length);
    publish();
  });
};

/** GitHub / GitLab style: replies, Resolve / Reopen, a resolved thread collapsed to one row.
 *  "+" in the gutter (or Ctrl/⌘ Alt M) opens the field; the second thread is resolved. The buttons
 *  call `resolveAll()` / `resolveAll(false)` — one event per thread, only where the user may — and
 *  `clearComments()`, a silent wipe (no events, no permission hooks). The floating bar (`<cdx-comments-bar>`)
 *  steps through open comments with ‹ › and has its own Resolve all; `visibility` in the controls.
 *  @type {Story} */
export const Thread = {
  render: (args) => html`
    <div style="display: grid; gap: 12px" ${wire(bulkButtons)}>
      ${BULK}
      <cdx-code-editor
        style="block-size: 36rem"
        label="StreamReader.js"
        .plugins=${webPreset}
        filename="StreamReader.js"
        .defaultValue=${SOURCE}
      >
        <cdx-comments
          slot="comments"
          mode=${args.mode}
          max-length=${args.maxLength}
          .author=${me}
          .defaultComments=${THREADS}
        ></cdx-comments>
        <cdx-comments-bar slot="comments-bar" visibility=${args.visibility}></cdx-comments-bar>
      </cdx-code-editor>
      <div class="log" style=${LOG_STYLE}></div>
    </div>
  `,
};

/** One comment per line: once it exists the field is gone; its author's Edit / Delete and
 *  Resolve / Reopen show, and the bar's Resolve all works too. Delete a comment and the "+" comes
 *  back.
 *  @type {Story} */
export const Single = {
  args: { mode: "single" },
  render: (args) => html`
    <div style="display: grid; gap: 12px" ${wire()}>
      <cdx-code-editor
        style="block-size: 36rem"
        label="StreamReader.js"
        .plugins=${webPreset}
        filename="StreamReader.js"
        .defaultValue=${SOURCE}
      >
        <cdx-comments
          slot="comments"
          mode=${args.mode}
          max-length=${args.maxLength}
          .author=${me}
          .defaultComments=${[{ ...THREADS[0], comments: [THREADS[0].comments[1]] }]}
        ></cdx-comments>
        <cdx-comments-bar slot="comments-bar" visibility=${args.visibility}></cdx-comments-bar>
      </cdx-code-editor>
      <div class="log" style=${LOG_STYLE}></div>
    </div>
  `,
};

/** Comments next to a proposal under review. Reject the chunk and the thread on its line turns
 *  Outdated.
 *  @type {Story} */
export const WithDiff = {
  render: (args) => html`
    <div style="display: grid; gap: 12px" ${wire()}>
      <cdx-code-editor
        style="block-size: 36rem"
        label="StreamReader.js"
        .plugins=${webPreset}
        filename="StreamReader.js"
        .defaultValue=${SOURCE}
        .reviewBase=${BEFORE_PROPOSAL}
      >
        <cdx-diff slot="diff" kind="review"></cdx-diff>
        <cdx-comments
          slot="comments"
          mode=${args.mode}
          max-length=${args.maxLength}
          .author=${me}
          .defaultComments=${[
            {
              id: "ag1",
              line: 23,
              comments: [
                {
                  id: "ac1",
                  author: ada,
                  body: "Skipping falsy chunks avoids pushing empty buffers.",
                  createdAt: ago(1),
                },
              ],
            },
          ]}
        ></cdx-comments>
        <cdx-comments-bar slot="comments-bar" visibility=${args.visibility}></cdx-comments-bar>
      </cdx-code-editor>
      <div class="log" style=${LOG_STYLE}></div>
    </div>
  `,
};

/** Consumer-side rules: `maxLength` (counter, blocks submit), an async `validate` ("TODO" is
 *  refused), permission hooks (Ada's comment can't be edited or deleted, line 1 takes no
 *  comment), and a host that answers submit / resolve / delete late — one in three fails (text kept
 *  for Retry, an error on the thread for resolve / delete).
 *  @type {Story} */
export const ValidationAndPermissions = {
  args: { maxLength: 120 },
  render: (args) => html`
    <div
      style="display: grid; gap: 12px"
      ${wire((root, editor) => (answerSubmitLate(root, editor), bulkButtons(root, editor)))}
    >
      ${BULK}
      <cdx-code-editor
        style="block-size: 36rem"
        label="StreamReader.js"
        .plugins=${webPreset}
        filename="StreamReader.js"
        .defaultValue=${SOURCE}
      >
        <cdx-comments
          slot="comments"
          mode=${args.mode}
          max-length=${args.maxLength}
          .author=${me}
          .defaultComments=${THREADS}
          .validate=${async (/** @type {import("../index.js").CdxCommentDraft} */ draft) => {
            await new Promise((resolve) => setTimeout(resolve, 250));
            return /\bTODO\b/i.test(draft.body) ? "Say what to do instead of TODO." : null;
          }}
          .canEdit=${(/** @type {import("../index.js").CdxComment} */ comment) =>
            comment.author.id === "me"}
          .canDelete=${(/** @type {import("../index.js").CdxComment} */ comment) =>
            comment.author.id === "me"}
          .canComment=${(/** @type {{ line: number }} */ { line }) => line !== 1}
        ></cdx-comments>
        <cdx-comments-bar slot="comments-bar" visibility=${args.visibility}></cdx-comments-bar>
      </cdx-code-editor>
      <div class="log" style=${LOG_STYLE}></div>
    </div>
  `,
};

/** `threads` set: the editor only mirrors it. Every action is an event, and the store in the
 *  story applies it and assigns a new array — with a short delay, so the field shows Sending…
 *  meanwhile.
 *  @type {Story} */
export const ControlledThreads = {
  render: (args) => html`
    <div style="display: grid; gap: 12px" ${wire(ownThreads)}>
      <cdx-code-editor
        style="block-size: 36rem"
        label="StreamReader.js"
        .plugins=${webPreset}
        filename="StreamReader.js"
        .defaultValue=${SOURCE}
      >
        <cdx-comments
          slot="comments"
          mode=${args.mode}
          max-length=${args.maxLength}
          .author=${me}
          .comments=${[]}
        ></cdx-comments>
        <cdx-comments-bar slot="comments-bar" visibility=${args.visibility}></cdx-comments-bar>
      </cdx-code-editor>
      <div class="log" style=${LOG_STYLE}></div>
    </div>
  `,
};
