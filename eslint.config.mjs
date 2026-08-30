import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // PocketBase's local runtime directory: the SQLite database plus the 787k-line
    // types.d.ts that the binary regenerates on every boot. Generated, gitignored,
    // and not ours to lint — but present as soon as anyone runs `npm run dev`,
    // which is why linting it must be switched off rather than left to chance.
    "pb/pb_data/**",
    // Installed third-party agent tooling (impeccable's bundled scripts).
    ".claude/skills/**",
  ]),
  {
    // PocketBase migrations run inside PocketBase's own JavaScript VM (goja),
    // not Node and not the browser: the globals below are injected by the
    // binary, and the `/// <reference>` line is how PocketBase itself wires up
    // editor types. Both are correct here and wrong everywhere else in the repo.
    files: ["pb/pb_migrations/**/*.js"],
    languageOptions: {
      globals: {
        $app: "readonly",
        $http: "readonly",
        $os: "readonly",
        $security: "readonly",
        Collection: "readonly",
        Record: "readonly",
        console: "readonly",
        migrate: "readonly",
        unmarshal: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
]);

export default eslintConfig;
