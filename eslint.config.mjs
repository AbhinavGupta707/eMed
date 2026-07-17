import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals.map((configuration) => ({
    ...configuration,
    files: ["apps/web/**/*.{js,jsx,ts,tsx,mjs}"]
  })),
  ...nextTypeScript,
  globalIgnores([
    "HomeRounds_Source_Package/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
    "**/playwright-report/**",
    "**/test-results/**"
  ])
]);
