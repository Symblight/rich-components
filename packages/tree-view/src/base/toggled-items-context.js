import { createContext } from "@lit/context";

/** Map of item key -> expanded, for items toggled at least once. */
/** @type {import("@lit/context").Context<"tvx-toggled-items-context", Map<PropertyKey, boolean>>} */
export const toggledItemsContext = createContext("tvx-toggled-items-context");
