// ESLint 9 flat config for the Shenmay server.
//
// Philosophy mirrors client/eslint.config.js: catch real bugs (undefined
// identifiers, unreachable code, shadowed globals), don't force a rewrite
// of an existing pragmatic codebase. The server is CommonJS on Node 20 —
// no TypeScript, so tseslint is not in the mix here.

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "data/**", "public/**", "db/migrations/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      // The codebase is deliberately pragmatic; these would require a
      // wholesale rewrite for near-zero real-bug value. Revisit when the
      // hottest files have been split (portal.js, widget.js).
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
      "no-case-declarations": "off",
      "no-prototype-builtins": "off",
      "no-inner-declarations": "off",
      "no-control-regex": "off",

      // Keep the noisy ones that actually catch bugs.
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "prefer-const": "warn",
    },
  },
];
