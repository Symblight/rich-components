import { BlockType, ViewPlugin } from "@codemirror/view";

/**
 * @typedef {{
 *   gutter: string,
 *   className: string,
 *   onlyOverGutter?: boolean,
 *   rangeAt: (view: import("@codemirror/view").EditorView, block: import("@codemirror/view").BlockInfo) => [number, number] | null,
 * }} GutterHoverOptions
 * `gutter`: the gutter's class. `rangeAt`: the doc range whose lines react to a hovered text line.
 */

/**
 * Puts `className` on a gutter's elements for the lines `rangeAt` returns while the pointer is over
 * a text line. DOM only — no transaction, no gutter resync per line crossed.
 * @param {GutterHoverOptions} options
 */
export function gutterHover({ gutter, className, onlyOverGutter = false, rangeAt }) {
  return ViewPlugin.define((view) => {
    /** @type {[number, number] | null} */
    let range = null;

    const apply = () =>
      view.requestMeasure({
        key: className,
        read() {
          const root = view.dom.querySelector(`.${gutter}`);
          if (!root) return [];
          const top = view.documentTop;
          return [...root.querySelectorAll(":scope > .cm-gutterElement")].map((element) => {
            const rect = element.getBoundingClientRect();
            const block = view.elementAtHeight((rect.top + rect.bottom) / 2 - top);
            const on =
              !!range &&
              rect.height > 0 &&
              block.type === BlockType.Text &&
              block.from >= range[0] &&
              block.from <= range[1];
            return /** @type {const} */ ([element, on]);
          });
        },
        write(elements) {
          for (const [element, on] of elements) element.classList.toggle(className, on);
        },
      });

    /** @param {[number, number] | null} next */
    const set = (next) => {
      if (next === range || (next && range && next[0] === range[0] && next[1] === range[1])) return;
      range = next;
      apply();
    };

    /** @param {MouseEvent} event */
    const move = (event) => {
      if (onlyOverGutter && !(/** @type {Element} */ (event.target).closest?.(`.${gutter}`)))
        return set(null);
      const block = view.elementAtHeight(event.clientY - view.documentTop);
      set(block.type === BlockType.Text ? rangeAt(view, block) : null);
    };
    const leave = () => set(null);
    view.dom.addEventListener("mousemove", move);
    view.dom.addEventListener("mouseleave", leave);

    return {
      /** @param {import("@codemirror/view").ViewUpdate} update */
      update(update) {
        if (update.docChanged) set(null);
        // a resync can redraw the elements; put the class back where it belongs
        else if (range) apply();
      },
      destroy() {
        view.dom.removeEventListener("mousemove", move);
        view.dom.removeEventListener("mouseleave", leave);
      },
    };
  });
}
