import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/worker/src/**/*.test.ts", "apps/web/lib/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    pool: "forks",
  },
});
