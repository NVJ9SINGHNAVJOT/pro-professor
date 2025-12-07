import js from "@eslint/js";
import tseslint from "typescript-eslint";
import drizzle from "eslint-plugin-drizzle";

const nodeGlobals = {
  console: "readonly",
  module: "readonly",
  require: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  process: "readonly",
  Buffer: "readonly",
  exports: "readonly",
};

export default [
  // ignore files
  {
    ignores: ["dist", "build", ".eslintrc.cjs", "upload-storage"],
  },

  // JavaScript (rules only — no env)
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: js.configs.recommended.rules, // only rules, no env
  },

  // TypeScript (full rules)
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: config.languageOptions?.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
    plugins: {
      ...config.plugins,
      drizzle,
    },
    rules: {
      ...config.rules,

      // your custom rules
      semi: "warn",
      "no-unused-vars": "warn",
      "no-console": "warn",

      // drizzle safety rules
      "drizzle/enforce-delete-with-where": "error",
      "drizzle/enforce-update-with-where": "error",
    },
  })),

  // drizzle recommended rules
  {
    files: ["src/**/*.ts"],
    rules: drizzle.configs.recommended.rules,
  },
];
