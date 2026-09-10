import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .vercel e .nitro guardam a saída do build (milhares de .mjs); .tanstack é
  // cache do plugin de rotas. Sem ignorar, o lint varre tudo isso e leva
  // minutos em vez de segundos.
  // Os globs precisam do `/**`: no flat config um padrao sem barra casa a
  // entrada com aquele nome, nao o que esta dentro dela. Sem isso o lint
  // desce no bundle minificado do build e devolve dezenas de milhares de
  // erros de formatacao em codigo que nao e nosso.
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vinxi/**",
      ".vercel/**",
      ".nitro/**",
      ".tanstack/**",
      "src/routeTree.gen.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
