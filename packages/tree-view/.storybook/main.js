/** @type {import("@storybook/web-components-vite").StorybookConfig} */
const config = {
  stories: ["../**/*.mdx", "../**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/web-components-vite",
    options: {
      builder: {
        viteConfigPath: ".storybook/vite.config.mjs",
      },
    },
  },
};
export default config;
