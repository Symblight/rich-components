// Not `/// <reference types="vite/client" />` — its own `*?inline` ambient
// declaration (typed `string`) collides with the `*.css?inline` pattern
// below (same empty prefix before the `*`, so TS's wildcard tie-break picks
// Vite's) and wins, even though postcss-lit actually transforms these into a
// Lit CSSResult at build time. Declaring only what this package needs avoids
// the collision instead of fighting it.
declare module "*.css?inline" {
  import { CSSResultGroup } from "lit";
  const content: CSSResultGroup;
  export default content;
}
declare module "*.svg?raw" {
  const content: string;
  export default content;
}
