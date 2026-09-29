import { EdxEditor } from "./base/editor.js";

declare global {
  interface HTMLElementTagNameMap {
    "edx-editor": EdxEditor;
  }
}

export {};
