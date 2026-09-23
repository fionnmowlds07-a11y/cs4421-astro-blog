import eslintPluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";

export default [
  // 1. Astro recommended rules setup
  ...eslintPluginAstro.configs.recommended,

  // 2. Extended accessibility (A11Y) rules for Astro components
  ...eslintPluginAstro.configs["jsx-a11y-recommended"],

  // 3. Parser settings and virtual module handling
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".astro"],
      },
    },
    settings: {
      "import/core-modules": ["astro:content", "astro:transitions", "astro:assets"],
      "import/parsers": {
        "astro-eslint-parser": [".astro"],
      },
    },
    rules: {
      // Custom rule overrides
      // "astro/no-set-html-directive": "error",
      // "astro/prefer-class-list-directive": "warn",
    },
  },

  // 4. Global ignoration pattern (build outputs, cache)
  {
    ignores: ["dist/", ".astro/", "node_modules/"],
  },
];