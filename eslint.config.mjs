import js from "@eslint/js";
import globals from "globals";
import importPlugin from "eslint-plugin-import";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/coverage/**",
      "**/dist/**",
      "**/bundle*.js",
      ".git/**",
      "**/eslint.config.*"
    ],
  },

  // Base rules for JS
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: globals.node,
    },
    plugins: { import: importPlugin },
    ...js.configs.recommended,
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "import/no-unresolved": "off",
    },
  },
  // Tests: enable Jest globals
  {
    files: ["**/__tests__/**/*.js", "**/*.test.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
];