import { expect, fixture, html } from "@open-wc/testing";

import "../../index.js";
import "../../components/attachments/attachments.js";
/** @import { ChxChat } from "../../components/base/chat.js" */
/** @import { ChxMessageComposer } from "../../components/message-composer/message-composer.js" */

/** A chx-chat inside another element's shadow root — the case a window-level `closest()` lookup missed. */
async function nestedChat({ attachments = true } = {}) {
  const outer = await fixture(html`<div></div>`);
  const root = outer.attachShadow({ mode: "open" });
  root.innerHTML = `
    <chx-chat>
      <chx-message-composer slot="message-composer">
        ${attachments ? '<chx-attachments slot="attachments"></chx-attachments>' : ""}
      </chx-message-composer>
    </chx-chat>`;
  const chat = /** @type {ChxChat} */ (root.querySelector("chx-chat"));
  const composer = /** @type {ChxMessageComposer} */ (root.querySelector("chx-message-composer"));
  await chat.updateComplete;
  await composer.updateComplete;
  // A node inside the composer's own shadow tree: events from it reach chx-chat only by composing.
  const inner = /** @type {Element} */ (composer.shadowRoot?.firstElementChild);
  return { chat, composer, inner };
}

/** @param {Element} target @param {string} type @param {DataTransfer} dataTransfer */
function drag(target, type, dataTransfer) {
  const event = new DragEvent(type, { dataTransfer, bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function filesTransfer() {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(new File(["hello"], "a.txt", { type: "text/plain" }));
  return dataTransfer;
}

describe("DropTargetController", () => {
  it("accepts an OS file drop from inside nested shadow roots and attaches the files", async () => {
    const { chat, composer, inner } = await nestedChat();
    /** @type {File[]} */
    let attached = [];
    chat.addEventListener("chx-attach", (event) => {
      attached = /** @type {CustomEvent<{ files: File[] }>} */ (event).detail.files;
    });
    const dataTransfer = filesTransfer();

    drag(inner, "dragenter", dataTransfer);
    expect(drag(inner, "dragover", dataTransfer).defaultPrevented).to.be.true;
    await chat.updateComplete;
    expect(composer.dragging).to.be.true;

    expect(drag(inner, "drop", dataTransfer).defaultPrevented).to.be.true;
    await chat.updateComplete;
    expect(attached.map((f) => f.name)).to.deep.equal(["a.txt"]);
    expect(composer.dragging).to.be.false;
  });

  it("keeps dragging while moving between descendants, clears it when the drag leaves", async () => {
    const { chat, composer, inner } = await nestedChat();
    const dataTransfer = filesTransfer();

    drag(inner, "dragenter", dataTransfer);
    drag(composer, "dragenter", dataTransfer); // entering the next node fires before leaving the last
    drag(inner, "dragleave", dataTransfer);
    await chat.updateComplete;
    expect(composer.dragging).to.be.true;

    drag(composer, "dragleave", dataTransfer);
    await chat.updateComplete;
    expect(composer.dragging).to.be.false;
  });

  it("ignores drags without files, and every drag when no chx-attachments is connected", async () => {
    const text = new DataTransfer();
    text.setData("text/plain", "hi");
    const { inner } = await nestedChat();
    expect(drag(inner, "dragover", text).defaultPrevented).to.be.false;

    const { inner: noAttachments } = await nestedChat({ attachments: false });
    expect(drag(noAttachments, "dragover", filesTransfer()).defaultPrevented).to.be.false;
  });
});
