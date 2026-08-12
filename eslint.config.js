import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "test-results/",
      "playwright-report/",
      "coverage/",
      "evidence/",
      "docs/",
      "ios/",
    ],
  },
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-console": "warn",
    },
  },
);
