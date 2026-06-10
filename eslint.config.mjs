import nextVitals from "eslint-config-next/core-web-vitals.js";
import nextTs from "eslint-config-next/typescript.js";

const asArray = (config) => Array.isArray(config) ? config : [config];

const eslintConfig = [
  ...asArray(nextVitals),
  ...asArray(nextTs),
  // Override default ignores of eslint-config-next.
  {
    ignores: [
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
