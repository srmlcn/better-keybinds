import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "agent-tools/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.browser
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      sourceType: "commonjs"
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "off",
      "no-unused-vars": ["error", {
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "none",
        ignoreRestSiblings: true
      }]
    }
  },
  {
    files: ["build.mjs", "eslint.config.mjs"],
    languageOptions: {
      sourceType: "module"
    }
  }
];
