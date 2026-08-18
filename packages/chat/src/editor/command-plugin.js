import { Plugin, PluginKey } from "prosemirror-state";

const WHITESPACE = /\s/;
const OBJECT_REPLACEMENT = "￼"; // PM's leafText fallback for non-command leaves (hard_break) in range

/**
 * @typedef {object} CommandPluginState
 * @property {boolean} active
 * @property {number | null} from
 * @property {number | null} to
 * @property {string | null} character
 * @property {string | null} query
 * @property {string | null} target
 * @property {(Element & { commandCharacter?: string }) | null} element
 */

/** @type {import("prosemirror-state").PluginKey<CommandPluginState>} */
export const commandPluginKey = new PluginKey("command");

/**
 * Nearest trigger character before the caret, valid at a word boundary
 * (start of line, or preceded by whitespace).
 * @param {string} textBeforeCaret
 * @param {(string | undefined)[]} characters
 * @returns {{ character: string, query: string } | null}
 */
function findActiveTrigger(textBeforeCaret, characters) {
  for (let i = textBeforeCaret.length - 1; i >= 0; i--) {
    const char = textBeforeCaret[i];
    if (char === OBJECT_REPLACEMENT) return null;
    if (characters.includes(char)) {
      const before = textBeforeCaret[i - 1];
      if (i === 0 || (before && WHITESPACE.test(before))) {
        return { character: char, query: textBeforeCaret.slice(i + 1) };
      }
      return null; // trigger char found but not at a valid boundary (e.g. "email@domain")
    }
  }
  return null;
}

/** @type {CommandPluginState} */
const INACTIVE_STATE = {
  active: false,
  from: null,
  to: null,
  character: null,
  query: null,
  target: null,
  element: null,
};

/**
 * Detects an open trigger search and dispatches chx-command-* events.
 * @param {{ getCommandFields: () => Map<Element, Element> }} options
 * @returns {import("prosemirror-state").Plugin}
 */
export function createCommandPlugin({ getCommandFields }) {
  return new Plugin({
    key: commandPluginKey,

    state: {
      /** @returns {CommandPluginState} */
      init: () => INACTIVE_STATE,
      /**
       * @param {import("prosemirror-state").Transaction} tr
       * @param {CommandPluginState} value
       * @param {import("prosemirror-state").EditorState} _oldState
       * @param {import("prosemirror-state").EditorState} newState
       * @returns {CommandPluginState}
       */
      apply(tr, value, _oldState, newState) {
        if (tr.getMeta(commandPluginKey)?.forceClose) return INACTIVE_STATE;

        const { selection } = newState;
        if (!selection.empty) return INACTIVE_STATE;

        const commandFields = getCommandFields();
        if (commandFields.size === 0) return INACTIVE_STATE;

        const characters = [...commandFields.values()]
          .map((element) => /** @type {{ commandCharacter?: string }} */ (element).commandCharacter)
          .filter((character) => !!character);

        const $from = selection.$from;
        const textBeforeCaret = $from.parent.textBetween(
          0,
          $from.parentOffset,
          undefined,
          OBJECT_REPLACEMENT,
        );
        const trigger = findActiveTrigger(textBeforeCaret, characters);
        if (!trigger) return INACTIVE_STATE;

        const nextChar = $from.parent.textBetween(
          $from.parentOffset,
          Math.min($from.parentOffset + 1, $from.parent.content.size),
          undefined,
          OBJECT_REPLACEMENT,
        );
        if (nextChar && !WHITESPACE.test(nextChar)) return INACTIVE_STATE;

        const element = [...commandFields.values()].find(
          (candidate) =>
            /** @type {{ commandCharacter?: string }} */ (candidate).commandCharacter ===
            trigger.character,
        );
        if (!element) return INACTIVE_STATE;

        const target =
          value.active && value.element === element ? value.target : crypto.randomUUID();

        return {
          active: true,
          from: $from.pos - trigger.query.length - 1, // position of the trigger character itself
          to: $from.pos, // caret
          character: trigger.character,
          query: trigger.query,
          target,
          element,
        };
      },
    },

    view() {
      return {
        update(view, prevState) {
          const prev = commandPluginKey.getState(prevState);
          const next = commandPluginKey.getState(view.state);
          if (!prev || !next || prev === next) return;

          if (next.active && next.element) {
            // Coords at the trigger character's position, not the (moving)
            // caret — `next.from` stays fixed for the whole search session,
            // so the menu doesn't jump around as the query grows.
            const coords = view.coordsAtPos(/** @type {number} */ (next.from));
            next.element.dispatchEvent(
              new CustomEvent("chx-command-query", {
                detail: {
                  value: next.query,
                  character: next.character,
                  target: next.target,
                  x: coords.left,
                  y: coords.bottom,
                },
                bubbles: true,
              }),
            );
          } else if (prev.active && prev.element) {
            prev.element.dispatchEvent(
              new CustomEvent("chx-command-query", {
                detail: { value: null, character: prev.character, target: null },
                bubbles: true,
              }),
            );
          }
        },
      };
    },

    props: {
      handleKeyDown(view, event) {
        const state = commandPluginKey.getState(view.state);
        if (!state?.active) return false;

        if (event.key === "Escape") {
          view.dispatch(view.state.tr.setMeta(commandPluginKey, { forceClose: true }));
          return true;
        }

        if (event.key === "Enter") {
          queueMicrotask(() => {
            state.element?.dispatchEvent(
              new CustomEvent("chx-command-confirm", {
                detail: { target: state.target },
                bubbles: true,
              }),
            );
          });
          return true;
        }

        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          state.element?.dispatchEvent(
            new CustomEvent("chx-command-navigate", {
              detail: { target: state.target, direction: event.key === "ArrowUp" ? "up" : "down" },
              bubbles: true,
            }),
          );
          return true;
        }

        return false;
      },
    },
  });
}
