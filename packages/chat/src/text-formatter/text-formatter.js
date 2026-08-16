const BLOCK_TAGS = new Set(["DIV", "P"]);

export class ContentTextoFormatter {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
  }

  /** returns {string */
  toPlainText() {
    const raw = this.#serialize(this.root);
    return this.#normalize(raw);
  }

  /** @returns {string[]} */
  getLines() {
    return this.toPlainText().split("\n");
  }

  /** @returns {boolean} */
  isMultiline() {
    return this.getLines().length > 1;
  }

  /** @returns {number} */
  getCharacterCount() {
    const segments = new Intl.Segmenter().segment(this.toPlainText());
    return [...segments].length;
  }

  /**
   * @param {Node} node
   * @returns {string}
   */
  #serialize(node) {
    let text = "";

    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.nodeValue;
        continue;
      }

      if (!(child instanceof Element)) continue;

      if (child.tagName === "BR") {
        text += "\n";
        continue;
      }

      if (BLOCK_TAGS.has(child.tagName)) {
        if (text.length && !text.endsWith("\n")) text += "\n";
        const content = this.#isEmptyLineBlock(child) ? "" : this.#serialize(child);
        text += content + "\n";
        continue;
      }

      text += this.#serialize(child);
    }

    return text;
  }

  /**
   * A block whose only child is a lone `<br>` is the browser's
   * placeholder for an empty line (an empty block has no caret position
   * otherwise), not real content — without this check its `<br>` and the
   * block's own trailing "\n" would both count as a line break for the
   * same empty line.
   * @param {Element} block
   * @returns {boolean}
   */
  #isEmptyLineBlock(block) {
    return block.childNodes.length === 1 && block.firstChild?.nodeName === "BR";
  }

  /**
   *
   * @param {string} text
   * @returns {string}
   */
  #normalize(text) {
    return text.replace(/\n+$/, "");
  }
}
