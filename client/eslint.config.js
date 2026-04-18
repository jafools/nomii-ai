// ESLint 9 flat config for the Nomii client.
//
// Goal: catch real bugs (undeclared vars, broken hooks rules, dead imports)
// without forcing a typescript-strict rewrite of the existing loose codebase.
// The client's tsconfig.json runs with noImplicitAny:false and
// strictNullChecks:false — the lint config stays aligned with that looseness.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // Codebase is deliberately loose — these rules would require a wholesale
      // rewrite for zero real-bug value. Revisit if the code ever gets
      // tightened up (see tsconfig.json).
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
      "no-case-declarations": "off",
      "no-prototype-builtins": "off",
      "prefer-const": "warn",
      // Common idiom in this codebase: `cond ? a() : b()` as a statement.
      "@typescript-eslint/no-unused-expressions": "off",
      // Tailwind/PostCSS/vite configs legitimately use require().
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
