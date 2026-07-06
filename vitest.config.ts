import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Money code must never rely on wall-clock ordering; keep tests isolated.
    isolate: true,
    env: {
      // Unit tests never talk to a real database or partner.
      NODE_ENV: "test",
    },
  },
});
