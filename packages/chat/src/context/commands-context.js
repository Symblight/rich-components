import { createContext } from "@lit/context";

/**
 * Currently resolved command chips in the composer's document — provided by
 * `chx-chat` (a `ContextProvider`, kept in sync via the bubbling `chx-change`
 * event's `commands` detail), same pattern as `attachmentsContext`.
 * @type {import("@lit/context").Context<symbol, Array<{label: string, element: HTMLElement}>>}
 */
export const commandsContext = createContext(Symbol("chx-commands"));
