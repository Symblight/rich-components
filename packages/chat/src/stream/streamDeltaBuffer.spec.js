import { expect } from "@open-wc/testing";

import { createChunkBuffer } from "./streamDeltaBuffer.js";

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createChunkBuffer", () => {
  it("coalesces multiple pushes for the same messageId into one flush", async () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({
      flushInterval: 10,
      getMessages: () => [],
      getUserId: () => "me",
      onFlush: (m) => flushes.push(m),
    });

    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "Hel" } });
    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "lo" } });

    await wait(30);

    expect(flushes).to.have.lengthOf(1);
    expect(flushes[0][0].parts[0].text).to.equal("Hello");
  });

  it("runs one timer across messages and reports each touched conversation once, all chunks committed", async () => {
    /** @type {{messages: any[], conversationId: string | undefined}[]} */
    const flushes = [];
    const buffer = createChunkBuffer({
      flushInterval: 10,
      getMessages: () => [],
      getUserId: () => "me",
      onFlush: (messages, conversationId) => flushes.push({ messages, conversationId }),
    });

    const chunk = (/** @type {string} */ messageId) => ({ messageId, partId: "p1", delta: {} });
    buffer.push(chunk("r1"), { conversationId: "c1" });
    buffer.push(chunk("r2"), { conversationId: "c2" });
    buffer.push(chunk("r3"), { conversationId: "c1" });

    await wait(30);

    expect(flushes.map((f) => f.conversationId)).to.have.members(["c1", "c2"]);
    for (const { messages } of flushes) {
      expect(messages.map((m) => m.id)).to.deep.equal(["r1", "r2", "r3"]);
    }
  });

  it("flush() flushes immediately and clears the pending timer", async () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({
      flushInterval: 1000,
      getMessages: () => [],
      getUserId: () => "me",
      onFlush: (m) => flushes.push(m),
    });
    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } });

    buffer.flush("r1");
    expect(flushes).to.have.lengthOf(1);

    await wait(1100); // if the original timer weren't cleared, this would double-flush
    expect(flushes).to.have.lengthOf(1);
  });

  it("flushAll() commits every pending message in one flush", () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({
      flushInterval: 1000,
      getMessages: () => [],
      getUserId: () => "me",
      onFlush: (m) => flushes.push(m),
    });
    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } });
    buffer.push({ messageId: "r2", partId: "p1", delta: { text: "b" } });

    buffer.flushAll();

    expect(flushes).to.have.lengthOf(1);
    expect(flushes[0].map((m) => m.id)).to.deep.equal(["r1", "r2"]);
  });

  it("flush() on an unknown/already-flushed messageId is a no-op", () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({
      flushInterval: 1000,
      getMessages: () => [],
      getUserId: () => "me",
      onFlush: (m) => flushes.push(m),
    });
    buffer.flush("never-pushed");
    expect(flushes).to.have.lengthOf(0);
  });
});

/**
 * Stands in for chx-chat: holds the messages array and commits every flush synchronously, the way
 * `#applyMessages` assigns `#internalMessages` — the invariant replay-at-flush depends on.
 * @param {{flushInterval?: number, messages?: any[]}} [options]
 */
function createHost({ flushInterval = 10, messages = [] } = {}) {
  /** @type {(string | undefined)[]} */
  const targets = [];
  const host = {
    messages,
    targets,
    /** @type {ReturnType<typeof createChunkBuffer>} */ buffer: /** @type {any} */ (null),
  };
  host.buffer = createChunkBuffer({
    flushInterval,
    getMessages: () => host.messages,
    getUserId: () => "me",
    onFlush: (next, conversationId) => {
      host.messages = next;
      targets.push(conversationId);
    },
  });
  return host;
}

describe("createChunkBuffer — concurrent messages", () => {
  it("does not let one message's flush clobber another's", async () => {
    const host = createHost();

    // both batches open before either flushes — the case that used to drop whichever committed first
    host.buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } });
    host.buffer.push({ messageId: "r2", partId: "p1", delta: { text: "b" } });

    await wait(30);

    expect(host.messages).to.have.lengthOf(2);
    expect(host.messages.find((m) => m.id === "r1").parts[0].text).to.equal("a");
    expect(host.messages.find((m) => m.id === "r2").parts[0].text).to.equal("b");
  });

  it("replays a batch against state committed after the batch opened", () => {
    const host = createHost({ flushInterval: 1000 });

    host.buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } });
    host.buffer.push({ messageId: "r2", partId: "p1", delta: { text: "b" } });
    host.buffer.flush("r1"); // commits r1 while r2's batch is still open
    host.buffer.push({ messageId: "r2", partId: "p1", delta: { text: "c" } });
    host.buffer.flushAll();

    expect(host.messages).to.have.lengthOf(2);
    expect(host.messages.find((m) => m.id === "r2").parts[0].text).to.equal("bc");
  });

  it("flushAll() commits every pending message, not just the last", () => {
    const host = createHost({ flushInterval: 1000 });

    host.buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } });
    host.buffer.push({ messageId: "r2", partId: "p1", delta: { text: "b" } });
    host.buffer.push({ messageId: "r3", partId: "p1", delta: { text: "c" } });
    host.buffer.flushAll();

    expect(host.messages.map((m) => m.id)).to.deep.equal(["r1", "r2", "r3"]);
  });

  it("a push made from inside onFlush opens a fresh batch instead of being swallowed", async () => {
    /** @type {any[]} */
    let messages = [];
    let reentered = false;
    /** @type {any} */
    let buffer;
    buffer = createChunkBuffer({
      flushInterval: 10,
      getMessages: () => messages,
      getUserId: () => "me",
      onFlush: (next) => {
        messages = next;
        if (reentered) return; // one re-entry is enough; this would otherwise never settle
        reentered = true;
        buffer.push({ messageId: "r1", partId: "p2", delta: { text: "z" } });
      },
    });

    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } });
    await wait(60);

    expect(messages[0].parts.map((/** @type {any} */ p) => p.id)).to.deep.equal(["p1", "p2"]);
  });
});

describe("createChunkBuffer — which conversation a flush targets", () => {
  it("reports the conversation the chunk itself named, with no caller target", () => {
    const host = createHost({ flushInterval: 1000 });
    host.buffer.push({ messageId: "r1", conversationId: "c2", partId: "p1", delta: { text: "a" } });
    host.buffer.flush("r1");
    expect(host.targets).to.deep.equal(["c2"]);
  });

  it("uses the caller's target when the chunk names none", () => {
    const host = createHost({ flushInterval: 1000 });
    host.buffer.push(
      { messageId: "r1", partId: "p1", delta: { text: "a" } },
      { conversationId: "c1" },
    );
    host.buffer.flush("r1");
    expect(host.targets).to.deep.equal(["c1"]);
  });

  it("lets an existing message's own conversation win over the caller's", () => {
    const host = createHost({
      flushInterval: 1000,
      messages: [{ id: "r1", conversationId: "c9", own: false, createdAt: 0, parts: [] }],
    });
    host.buffer.push(
      { messageId: "r1", partId: "p1", delta: { text: "a" } },
      { conversationId: "c1" },
    );
    host.buffer.flush("r1");
    expect(host.targets).to.deep.equal(["c9"]);
  });

  it("reports undefined when nothing attributes the message", () => {
    const host = createHost({ flushInterval: 1000 });
    host.buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } });
    host.buffer.flush("r1");
    expect(host.targets).to.deep.equal([undefined]);
  });
});
