import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000, // PGlite migration bootstrap is a bit slower than a unit test
  },
});
