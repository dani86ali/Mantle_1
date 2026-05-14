import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["tests/ui/**", "jsdom"]],
    setupFiles: ["tests/ui/setup.ts"],
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/app/**", "src/components/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
