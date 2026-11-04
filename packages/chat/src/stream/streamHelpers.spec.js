import { expect } from "@open-wc/testing";

import {
  applyChunkToParts,
  finalizePart,
  finalizeStreamingParts,
  getOrCreateMessage,
  reconcileChunk,
} from "./streamHelpers.js";

describe("getOrCreateMessage", () => {
  it("creates a shell for an unseen messageId, own computed from authorId === userId", () => {
    const { messages, index } = getOrCreateMessage(
      [],
      /** @type {any} */ ({ messageId: "r1", authorId: "assistant" }),
      "me",
    );
    expect(messages).to.have.lengthOf(1);
    expect(index).to.equal(0);
    expect(messages[0]).to.include({
      id: "r1",
      authorId: "assistant",
      own: false,
      status: "sending",
    });
    expect(messages[0].parts).to.deep.equal([]);
  });

  it("tags a new shell with replyToId, but only meaningful the first time", () => {
    const { messages } = getOrCreateMessage(
      [],
      /** @type {any} */ ({ messageId: "r1", authorId: "assistant" }),
      "me",
      "user-msg-1",
    );
    expect(messages[0].replyToId).to.equal("user-msg-1");
  });

  it("finds an existing message by id instead of creating a duplicate", () => {
    const existing = /** @type {any} */ ([{ id: "r1", own: false, parts: [] }]);
    const { messages, index } = getOrCreateMessage(
      existing,
      /** @type {any} */ ({ messageId: "r1" }),
      "me",
    );
    expect(messages).to.equal(existing);
    expect(index).to.equal(0);
  });
});

describe("applyChunkToParts", () => {
  it("creates a new streaming part for an unseen partId", () => {
    const parts = applyChunkToParts([], { messageId: "r1", partId: "p1", delta: { text: "Hel" } });
    expect(parts).to.deep.equal([{ id: "p1", type: "text", state: "streaming", text: "Hel" }]);
  });

  it("respects an explicit partType when creating a new part", () => {
    const parts = applyChunkToParts([], {
      messageId: "r1",
      partId: "p1",
      partType: "reasoning",
      delta: { text: "thinking" },
    });
    expect(parts[0].type).to.equal("reasoning");
  });

  it("appends text deltas onto an existing streaming part", () => {
    const parts = applyChunkToParts([{ id: "p1", type: "text", state: "streaming", text: "Hel" }], {
      messageId: "r1",
      partId: "p1",
      delta: { text: "lo" },
    });
    expect(parts[0].text).to.equal("Hello");
  });

  it("replaces (not appends) html deltas", () => {
    const parts = applyChunkToParts(
      [{ id: "p1", type: "text", state: "streaming", text: "a", html: "<em>a" }],
      { messageId: "r1", partId: "p1", delta: { html: "<em>a</em>" } },
    );
    expect(parts[0].html).to.equal("<em>a</em>");
  });

  it("drops a chunk targeting an already-done part and warns", () => {
    const original = console.warn;
    /** @type {unknown[][]} */
    const calls = [];
    console.warn = (...args) => calls.push(args);
    try {
      const donePartsIn = [
        { id: "p1", type: "text", state: /** @type {"done"} */ ("done"), text: "x" },
      ];
      const parts = applyChunkToParts(donePartsIn, {
        messageId: "r1",
        partId: "p1",
        delta: { text: "late" },
      });
      expect(parts).to.equal(donePartsIn); // unchanged, same reference
      expect(calls).to.have.lengthOf(1);
    } finally {
      console.warn = original;
    }
  });

  it("keeps patching a done part that carries a tool-call status", () => {
    const parts = applyChunkToParts(
      /** @type {any} */ ([
        { id: "t1", type: "tool_call", state: "done", status: "in_progress", title: "npm test" },
      ]),
      { messageId: "r1", partId: "t1", delta: /** @type {any} */ ({ status: "failed" }) },
    );
    expect(parts[0].status).to.equal("failed");
    // untouched fields survive the patch — `title` is part of chx-tool-call's still-draft surface,
    // not yet on ChxMessagePart
    expect(/** @type {any} */ (parts[0]).title).to.equal("npm test");
    expect(parts[0].state).to.equal("done"); // the turn is still over
  });

  it("exempts a done part on having a status at all, not on it being non-terminal", () => {
    const parts = applyChunkToParts(
      /** @type {any} */ ([{ id: "t1", type: "tool_call", state: "done", status: "cancelled" }]),
      { messageId: "r1", partId: "t1", delta: /** @type {any} */ ({ status: "failed" }) },
    );
    expect(parts[0].status).to.equal("failed"); // a real trailing update overrides a local cancel
  });
});

describe("finalizeStreamingParts", () => {
  it("flips every streaming part to done, leaves done parts alone", () => {
    const message = /** @type {any} */ ({
      id: "r1",
      parts: [
        { id: "p1", type: "text", state: "streaming", text: "a" },
        { id: "p2", type: "text", state: "done", text: "b" },
      ],
    });
    const next = finalizeStreamingParts(message);
    expect(next.parts[0].state).to.equal("done");
    expect(next.parts[1].state).to.equal("done");
  });

  it("is reference-stable when nothing changes", () => {
    const message = /** @type {any} */ ({
      id: "r1",
      parts: [{ id: "p1", type: "text", state: "done", text: "a" }],
    });
    expect(finalizeStreamingParts(message)).to.equal(message);
  });

  it("settles a tool call on an ordinary finish, unless it's detached", () => {
    const message = /** @type {any} */ ({
      id: "r1",
      parts: [
        { id: "t1", type: "tool_call", state: "streaming", status: "in_progress" },
        { id: "t2", type: "tool_call", state: "streaming", status: "in_progress", detached: true },
      ],
    });
    const next = finalizeStreamingParts(message);
    expect(next.parts[0]).to.include({ state: "done", status: "cancelled" });
    expect(next.parts[1]).to.include({ state: "done", status: "in_progress" }); // reports back later
  });

  it("settles an unsettled tool call under {cancelled}", () => {
    const message = /** @type {any} */ ({
      id: "r1",
      parts: [
        { id: "t1", type: "tool_call", state: "streaming", status: "in_progress" },
        { id: "t2", type: "tool_call", state: "done", status: "awaiting-permission" },
        { id: "p1", type: "text", state: "streaming", text: "a" },
      ],
    });
    const next = finalizeStreamingParts(message, { cancelled: true });
    expect(next.parts[0].status).to.equal("cancelled");
    expect(next.parts[1].status).to.equal("cancelled"); // already done, still settled
    expect(next.parts[2].state).to.equal("done");
    expect(next.parts[2].status).to.equal(undefined); // text parts have no status to settle
  });

  it("leaves an already-settled status alone under {cancelled}", () => {
    const message = /** @type {any} */ ({
      id: "r1",
      parts: [
        { id: "t1", type: "tool_call", state: "done", status: "completed" },
        { id: "t2", type: "tool_call", state: "done", status: "failed" },
        { id: "t3", type: "tool_call", state: "done", status: "rejected" },
      ],
    });
    const next = finalizeStreamingParts(message, { cancelled: true });
    expect(next).to.equal(message); // nothing to change, reference-stable
  });
});

describe("finalizePart", () => {
  it("finalizes exactly the targeted part", () => {
    const parts = /** @type {any} */ ([
      { id: "p1", type: "text", state: "streaming", text: "a" },
      { id: "p2", type: "text", state: "streaming", text: "b" },
    ]);
    const next = finalizePart(parts, "p1");
    expect(next[0].state).to.equal("done");
    expect(next[1].state).to.equal("streaming");
  });

  it("is a no-op for an unknown or already-final part id", () => {
    const parts = /** @type {any} */ ([{ id: "p1", type: "text", state: "done", text: "a" }]);
    expect(finalizePart(parts, "p1")).to.equal(parts);
    expect(finalizePart(parts, "nope")).to.equal(parts);
  });
});

describe("reconcileChunk", () => {
  it("finish sets status sent and finalizes streaming parts", () => {
    const messages = reconcileChunk(
      /** @type {any} */ ([
        {
          id: "r1",
          own: false,
          status: "sending",
          parts: [{ id: "p1", type: "text", state: "streaming", text: "hi" }],
        },
      ]),
      { kind: "finish", messageId: "r1" },
      "me",
    );
    expect(messages[0].status).to.equal("sent");
    expect(messages[0].parts[0].state).to.equal("done");
  });

  it("abort sets status cancelled", () => {
    const messages = reconcileChunk(
      /** @type {any} */ ([{ id: "r1", own: false, status: "sending", parts: [] }]),
      { kind: "abort", messageId: "r1" },
      "me",
    );
    expect(messages[0].status).to.equal("cancelled");
  });

  it("part-end finalizes one part without touching message status", () => {
    const messages = reconcileChunk(
      /** @type {any} */ ([
        {
          id: "r1",
          own: false,
          status: "sending",
          parts: [{ id: "p1", type: "text", state: "streaming", text: "hi" }],
        },
      ]),
      { kind: "part-end", messageId: "r1", partId: "p1" },
      "me",
    );
    expect(messages[0].status).to.equal("sending");
    expect(messages[0].parts[0].state).to.equal("done");
  });

  it("abort settles a mid-flight tool call, and a trailing update still lands", () => {
    let messages = reconcileChunk(
      /** @type {any} */ ([
        {
          id: "r1",
          own: false,
          status: "sending",
          parts: [{ id: "t1", type: "tool_call", state: "streaming", status: "in_progress" }],
        },
      ]),
      { kind: "abort", messageId: "r1" },
      "me",
    );
    expect(messages[0].status).to.equal("cancelled");
    expect(messages[0].parts[0].state).to.equal("done");
    expect(messages[0].parts[0].status).to.equal("cancelled"); // no spinner left behind

    // the agent's own final update arrives after the cancel — dropping it is what froze the card
    messages = reconcileChunk(
      messages,
      { messageId: "r1", partId: "t1", delta: /** @type {any} */ ({ status: "failed" }) },
      "me",
    );
    expect(messages[0].parts[0].status).to.equal("failed");
  });

  it("a delta chunk creates a shell then patches it across calls", () => {
    let messages = reconcileChunk(
      [],
      { messageId: "r1", partId: "p1", delta: { text: "Hel" } },
      "me",
    );
    messages = reconcileChunk(
      messages,
      { messageId: "r1", partId: "p1", delta: { text: "lo" } },
      "me",
    );
    expect(messages).to.have.lengthOf(1);
    expect(messages[0].parts[0].text).to.equal("Hello");
  });
});
