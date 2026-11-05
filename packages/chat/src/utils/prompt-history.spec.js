import { expect } from "@open-wc/testing";

import { recallable, step } from "./prompt-history.js";

/** @param {string} id @param {Partial<import("../types/message.js").ChxMessage>} [fields] */
const message = (id, fields) => ({
  id,
  own: true,
  createdAt: 0,
  parts: [{ id: `${id}-t`, type: "text", text: id }],
  ...fields,
});

describe("prompt history", () => {
  it("recalls your own messages that have text, whatever became of them", () => {
    // Arrange
    const reply = message("reply", { own: false });
    const failed = message("failed", { status: "failed" });
    const cancelled = message("cancelled", { status: "cancelled" });
    const chipOnly = message("chip", {
      parts: [{ id: "c", type: "chip", label: "a.js", templateId: "t" }],
    });
    const blank = message("blank", { parts: [{ id: "b", type: "text", text: "  " }] });
    const fileOnly = message("file", { parts: [{ id: "f", type: "attachment", attachment: {} }] });

    // Act
    const prompts = recallable([reply, failed, blank, cancelled, fileOnly, chipOnly]);

    // Assert
    expect(prompts.map((prompt) => prompt.id)).to.deep.equal(["failed", "cancelled", "chip"]);
  });

  it("steps through prompts by id, newest first, and down to the draft", () => {
    // Arrange
    const prompts = [message("a"), message("b"), message("c")];
    const cases = /** @type {const} */ ([
      // [at, direction, expected, why]
      [null, "up", "c", "from the draft to the newest"],
      ["c", "up", "b", "to the next older"],
      ["a", "up", "a", "stays at the oldest"],
      ["a", "down", "b", "to the next newer"],
      ["c", "down", null, "from the newest to the draft"],
      [null, "down", null, "stays at the draft"],
      ["gone", "up", null, "a removed prompt falls back to the draft"],
      ["gone", "down", null, "a removed prompt falls back to the draft"],
    ]);

    for (const [at, direction, expected, why] of cases) {
      // Act
      const next = step(prompts, at, direction);

      // Assert
      expect(next, why).to.equal(expected);
    }
  });

  it("has nowhere to go without prompts, and keeps its place when one arrives", () => {
    // Act
    const none = step([], null, "up");
    const afterArrival = step([message("a"), message("b"), message("new")], "b", "up");

    // Assert
    expect(none).to.equal(null);
    expect(afterArrival, "the position is the id, not an index").to.equal("a");
  });
});
