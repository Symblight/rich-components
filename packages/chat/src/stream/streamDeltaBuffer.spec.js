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
    const buffer = createChunkBuffer({ flushInterval: 10, onFlush: (m) => flushes.push(m) });

    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "Hel" } }, [], "me");
    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "lo" } }, [], "me");

    await wait(30);

    expect(flushes).to.have.lengthOf(1);
    expect(flushes[0][0].parts[0].text).to.equal("Hello");
  });

  it("keys batches per messageId so concurrent streams don't share a window", async () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({ flushInterval: 10, onFlush: (m) => flushes.push(m) });

    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } }, [], "me");
    buffer.push({ messageId: "r2", partId: "p1", delta: { text: "b" } }, [], "me");

    await wait(30);

    expect(flushes).to.have.lengthOf(2);
  });

  it("flush() flushes immediately and clears the pending timer", async () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({ flushInterval: 1000, onFlush: (m) => flushes.push(m) });
    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } }, [], "me");

    buffer.flush("r1");
    expect(flushes).to.have.lengthOf(1);

    await wait(1100); // if the original timer weren't cleared, this would double-flush
    expect(flushes).to.have.lengthOf(1);
  });

  it("flushAll() flushes every pending batch", () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({ flushInterval: 1000, onFlush: (m) => flushes.push(m) });
    buffer.push({ messageId: "r1", partId: "p1", delta: { text: "a" } }, [], "me");
    buffer.push({ messageId: "r2", partId: "p1", delta: { text: "b" } }, [], "me");

    buffer.flushAll();

    expect(flushes).to.have.lengthOf(2);
  });

  it("flush() on an unknown/already-flushed messageId is a no-op", () => {
    /** @type {any[][]} */
    const flushes = [];
    const buffer = createChunkBuffer({ flushInterval: 1000, onFlush: (m) => flushes.push(m) });
    buffer.flush("never-pushed");
    expect(flushes).to.have.lengthOf(0);
  });
});
