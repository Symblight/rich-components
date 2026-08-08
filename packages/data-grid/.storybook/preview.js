import { generateTheme } from "@symblight/md-colors/client";

const STORAGE_KEY_COLOR = "md-theme-color";
const STORAGE_KEY_SCHEME = "md-theme-scheme";
const DEFAULT_COLOR = "#1D5D78";
const DEFAULT_SCHEME = "light";

/** @type {import("@storybook/web-components").Decorator} */
const themeToolDecorator = (story) => {
  if (!document.getElementById("md-theme-tool")) {
    const savedColor = localStorage.getItem(STORAGE_KEY_COLOR) ?? DEFAULT_COLOR;
    const savedScheme =
      localStorage.getItem(STORAGE_KEY_SCHEME) ?? DEFAULT_SCHEME;

    const panel = document.createElement("div");
    panel.id = "md-theme-tool";
    panel.innerHTML = `
      <style>
        #md-theme-tool {
          position: fixed;
          bottom: 16px;
          right: 16px;
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          gap: 10px;
          align-items: center;
          z-index: 9999;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          font-family: sans-serif;
          font-size: 13px;
        }
        #md-theme-tool label {
          display: flex;
          align-items: center;
          gap: 6px;
        }
      </style>
      <label>
        Color
        <input type="color" id="md-color-input" value="${savedColor}" />
      </label>
      <label>
        Scheme
        <select id="md-scheme-select">
          <option value="light"${savedScheme === "light" ? " selected" : ""}>Light</option>
          <option value="dark"${savedScheme === "dark" ? " selected" : ""}>Dark</option>
        </select>
      </label>
    `;
    document.body.appendChild(panel);

    generateTheme({ sourceColor: savedColor, scheme: savedScheme });

    const applyTheme = () => {
      const color = /** @type {HTMLInputElement} */ (
        document.getElementById("md-color-input")
      ).value;
      const scheme = /** @type {HTMLSelectElement} */ (
        document.getElementById("md-scheme-select")
      ).value;
      localStorage.setItem(STORAGE_KEY_COLOR, color);
      localStorage.setItem(STORAGE_KEY_SCHEME, scheme);
      generateTheme({ sourceColor: color, scheme });
    };

    /** @type {HTMLElement} */ (
      document.getElementById("md-color-input")
    ).addEventListener("input", applyTheme);
    /** @type {HTMLElement} */ (
      document.getElementById("md-scheme-select")
    ).addEventListener("change", applyTheme);
  }

  return story();
};

/** @type {import("@storybook/web-components").Preview} */
const preview = {
  decorators: [themeToolDecorator],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
