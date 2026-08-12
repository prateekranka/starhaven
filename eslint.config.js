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
  {
    files: ["src/game/sim/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "pow", "exp", "log", "log2", "log10", "hypot"].map((property) => ({ object: "Math", property, message: "Simulation math must use committed integer lookup tables." })),
      ],
      "no-restricted-syntax": ["error", { selector: "BinaryExpression[operator='**']", message: "Simulation math must not use exponentiation." }],
    },
  },
);
