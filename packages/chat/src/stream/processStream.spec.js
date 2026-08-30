import { expect } from "@open-wc/testing";

import { processStream } from "./processStream.js";
import { createChunkBuffer } from "./streamDeltaBuffer.js";

/** @param {unknown[]} items */
function streamOf(items) {
  return new ReadableStream({
    start(controller) {
      for (const item of items) controller.enqueue(item);
      controller.close();
    },
  });
}

/** @param {{flushInterval?: number}} [options] */
function setup(options = {}) {
  /** @type {any[][]} */
  const flushes = [];
  const buffer = createChunkBuffer({ flushInterval: options.flushInterval ?? 5, onFlush: (m) => flushes.push(m) });
  return {
    flushes,
    buffer,
    getMessages: () => [],
    getUserId: () => "me",
    ingest: (/** @type {any} */ item) => ("chunk" in item ? item.chunk : item),
  };
}

describe("processStream", () => {
  it("resolves for a stream ending in a finish chunk", async () => {
    const ctx = setup();
    await processStream(streamOf([{ kind: "finish", messageId: "r1" }]), ctx);
    expect(ctx.flushes).to.have.lengthOf(1);
    expect(ctx.flushes[0][0].status).to.equal("sent");
  });

  it("resolves for a stream ending in an abort chunk", async () => {
    const ctx = setup();
    await processStream(streamOf([{ kind: "abort", messageId: "r1" }]), ctx);
    expect(ctx.flushes[0][0].status).to.equal("cancelled");
  });

  it("throws when the stream closes without a terminal chunk", async () => {
    const ctx = setup();
    let threw = false;
    try {
      await processStream(
        streamOf([{ messageId: "r1", partId: "p1", delta: { text: "partial" } }]),
        ctx,
      );
    } catch {
      threw = true;
    }
    expect(threw).to.be.true;
    // the partial batch is still flushed before throwing — no data lost on disconnect
    expect(ctx.flushes).to.have.lengthOf(1);
  });

  it("drops a duplicate-eventId envelope via the provided ingest function", async () => {
    const ctx = setup();
    /** @type {Set<string>} */
    const seen = new Set();
    ctx.ingest = (/** @type {any} */ item) => {
      const envelope = "chunk" in item ? item : { chunk: item };
      if (envelope.eventId) {
        if (seen.has(envelope.eventId)) return null;
        seen.add(envelope.eventId);
      }
      return envelope.chunk;
    };

    await processStream(
      streamOf([
        { eventId: "e1", chunk: { messageId: "r1", partId: "p1", delta: { text: "Hi" } } },
        { eventId: "e1", chunk: { messageId: "r1", partId: "p1", delta: { text: "Hi" } } },
        { kind: "finish", messageId: "r1" },
      ]),
      ctx,
    );

    expect(ctx.flushes[0][0].parts[0].text).to.equal("Hi");
  });
});
