import {html, LitElement} from "lit";
import {customElement} from "lit/decorators.js";
import {classMap} from "lit/directives/class-map.js";
import {unsafeSVG} from "lit/directives/unsafe-svg.js";
import {when} from "lit/directives/when.js";
import {FormControlMixin, requiredValidator} from "@open-wc/form-control";

import {Editor} from "../../editor/Editor.js";

import styles from "./textbox.css?inline";

import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";

import send from "@material-design-icons/svg/outlined/arrow_upward.svg?raw";

/**
 * @tag chx-textbox
 * @summary MD3 filled-field container that owns the ProseMirror `EditorView`
 * directly — it renders the `.message-composer__input-content` mount div
 * itself (a **static, binding-free** node, see CLAUDE.md's "Composer input
 * model": the view silently dies if that node is ever recreated) and
 * constructs the `Editor` facade (`src/editor/Editor.js`) against it in
 * `firstUpdated()`. `chx-message-composer` never touches ProseMirror or the
 * mount div — it configures this element via `label`/`placeholder`/
 * `getCommandFields` and reacts to `chx-textbox-change`/`chx-command-selected`.
 * `leading`/`trailing`/`attachments` reflow between a one-line and a stacked layout
 * purely via CSS — see textbox.css.
 */
@customElement("chx-textbox")
export class ChxTextbox extends FormControlMixin(LitElement) {
    /** @type {import("lit").PropertyDeclarations} */
    static properties = {
        name: {type: String, attribute: true},
        required: {type: Boolean, attribute: true, reflect: true},
        label: {type: String, attribute: true},
        placeholder: {type: String, attribute: true},
        getCommandFields: {attribute: false},
        loading: {type: Boolean, reflect: true, attribute: true},
        simplified: {state: true},
        value: {state: true},
    };

    /** @type {ShadowRootInit} */
    static shadowRootOptions = {
        ...LitElement.shadowRootOptions,
        delegatesFocus: true,
    };

    static formControlValidators = [requiredValidator];

    constructor() {
        super();

        this.name = "";
        this.required = false;

        /** @type {String} */
        this.label = "";

        /** @type {String} */
        this.placeholder = "";

        /** @type {() => Map<Element, Element>} */
        this.getCommandFields = () => new Map();

        /** @type {Editor | undefined} */
        this.editor = undefined;

        /** @type {boolean} False once Shift-Enter has split the doc and there's still content. */
        this.simplified = true;

        /** @type {Boolean} */
        this.loading = false;

        /** @type {String} Mirrors the editor's live value — drives the submit button's visibility. */
        this.value = "";
    }

    /** @returns {import("lit").CSSResultGroup} */
    static get styles() {
        return [styles];
    }

    /** The ProseMirror mount div — see the class doc comment. @returns {HTMLElement} */
    get inputElement() {
        return /** @type {HTMLElement} */ (this.renderRoot?.querySelector(".textbox__content"));
    }

    /** Anchor for ElementInternals' constraint-validation UI — see FormControlMixin. */
    get validationTarget() {
        return this.inputElement;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("pointerdown", this.handlePointerdown);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener("pointerdown", this.handlePointerdown);
    }

    firstUpdated() {
        this.editor = new Editor(this.inputElement, {
            onChange: this.handleEditorChange,
            onSubmit: () => this.closest("form")?.requestSubmit(),
            getCommandFields: () => this.getCommandFields(),
            onCommandSelected: this.handleCommandSelected,
            placeholder: this.placeholder,
            attributes: {
                role: "textbox",
                dir: "ltr",
                writingsuggestions: "false",
                "aria-multiline": "true",
                translate: "no",
                tabindex: "0",
                enterkeyhint: "enter",
                autocorrect: "off",
            },
        });
        this.editor.view.dom.setAttribute("aria-label", this.label);
    }

    /** @param {import("lit").PropertyValues} changedProperties */
    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has("label") && this.editor) {
            this.editor.view.dom.setAttribute("aria-label", this.label);
        }
    }

    /** FormControlMixin's formResetCallback hook. */
    resetFormControl() {
        this.clear();
    }

    /** @returns {string} */
    getValue() {
        return this.editor?.getValue() ?? "";
    }

    /** @returns {string} */
    getHTML() {
        return this.editor?.getHTML() ?? "";
    }

    focus() {
        this.editor?.focus();
    }

    focusEnd() {
        this.editor?.focusEnd();
    }

    /** Clears both the editor's document and the form value — used on send/reset. */
    clear() {
        this.editor?.clear();
        this.setValue("");
        this.simplified = true;
        this.value = "";
    }

    /**
     * Forwarded from chx-message-composer's own insertAtCommand — see
     * Editor.resolveCommand for the actual insertion logic.
     * @param {string | null} target
     * @param {Node} node
     */
    insertAtCommand(target, node) {
        this.editor?.resolveCommand(target, node);
    }

    /**
     * Bound via Editor's onChange — fires on every doc-changing transaction.
     * Keeps the form value in sync directly (the caller no longer has to).
     * @param {{value: string, html: string}} detail
     */
    handleEditorChange = (detail) => {
        this.setValue(detail.value);
        this.value = detail.value;
        if (detail.value.length === 0) {
            this.simplified = true;
        } else if (this.editor?.isMultiline()) {
            this.simplified = false;
        }
        this.dispatchEvent(
            new CustomEvent("chx-textbox-change", {detail, bubbles: true, composed: true}),
        );
    };

    /** @param {{target: string | null, id: string | undefined}} detail */
    handleCommandSelected = (detail) => {
        this.dispatchEvent(
            new CustomEvent("chx-command-selected", {detail, bubbles: true, composed: true}),
        );
    };

    /**
     * Clicking empty padding inside the field should focus the input, caret
     * landing at the end of the document — same exclusion-list pattern
     * `chx-message-composer` used to run itself against `md-text-field`, just
     * generalized to whatever's slotted into `leading`/`attachments`/`trailing` now.
     * @param {PointerEvent} event
     */
    handlePointerdown = (event) => {
        const path = event.composedPath();
        /** @param {string} name */
        const slotted = (name) =>
            /** @type {HTMLSlotElement | null} */ (
            this.renderRoot?.querySelector(`slot[name="${name}"]`)
        )?.assignedElements({flatten: true}) ?? [];
        const excludedElements = [
            ...slotted("leading"),
            ...slotted("attachments"),
            ...slotted("trailing"),
            this.inputElement,
        ];
        if (excludedElements.some((element) => element && path.includes(element))) return;

        event.preventDefault();
        this.focusEnd();
    };

    render() {
        return html`
            <div class="textbox" part="box">
                <div class="textbox__container">
                    <div
                            class=${classMap({
                                textbox__row: !this.simplified,
                                textbox__row_simplified: this.simplified,
                            })}
                            part="row"
                    >
                        <div class="textbox__box">
                            <div class="textbox__content" part="content"></div>
                        </div>
                        <div class="textbox__attachments" part="attachments">
                            <slot name="attachments"></slot>
                        </div>
                        <div class="textbox__leading" part="leading">
                            <slot name="leading"></slot>
                        </div>
                        <div class="textbox__trailing" part="trailing">
                            <slot name="trailing"></slot>
                            ${when(
                                    this.value !== "" && !this.loading,
                                    () => html`
                                        <md-icon-button
                                                ?disabled=${this.value === "" || this.loading}
                                                type="submit"
                                                variant="filled"
                                                class="textbox__submit"
                                                selected
                                        >
                                            <md-icon>${unsafeSVG(send)}</md-icon>
                                        </md-icon-button>
                                    `,
                            )}
                            ${when(
                                    this.loading,
                                    () => html`
                                        <md-icon-button
                                                class="textbox__submit"
                                                type="submit"
                                                variant="tonal"
                                        >
                                            <slot name="flight-icon"></slot>
                                        </md-icon-button>
                                    `,
                            )}
                        </div>
                    </div>
                </div>
            </div>
            </div>
        `;
    }
}
