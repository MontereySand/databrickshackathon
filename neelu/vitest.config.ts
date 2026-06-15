import { defineConfig } from "vitest/config"

// Server/eval tests run in Node against an ephemeral in-memory PGlite database.
// Setting these before the config module loads guarantees LOCAL_SIM + memory DB.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      LOCAL_SIM: "true",
      PGLITE_DATA_DIR: "memory",
    },
  },
})
