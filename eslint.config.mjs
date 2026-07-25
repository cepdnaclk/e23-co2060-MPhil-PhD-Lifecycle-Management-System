import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Existing panels use effects to initiate async API synchronization.
      // Refactoring that UI data layer belongs to the global-template/UI work package.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "next-env.d.ts",
    "out/**",
    "output/**",
    "playwright-report/**",
    "reports/**",
    "scratch/**",
    "test-results/**",
    "vitest-report/**",
  ]),
]);
