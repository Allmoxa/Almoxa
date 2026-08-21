import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config própria, separada do vite.config.ts do app -- o plugin do
// TanStack Start faz geração de rotas/SSR que não tem por que rodar
// dentro do Vitest, então os testes usam só o essencial: o alias "@" e
// um ambiente Node (os testes daqui são lógica pura, sem DOM).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
