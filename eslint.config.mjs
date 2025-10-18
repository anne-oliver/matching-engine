import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      ".git/**",
      "**/eslint.config.*",
    ],
  },

  // Project JS
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    ...js.configs.recommended,
    rules: {
      "no-unused-vars": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
    },
  },

  // Jest tests
  {
    files: ["**/__tests__/**/*.js", "**/*.test.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    }
  },
];