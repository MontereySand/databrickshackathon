/**
 * Server entry point. Boots the database (auto-seeding demo data on first run),
 * creates the Express app, and serves the client:
 *   - dev:  Vite middleware mode (single port, HMR)
 *   - prod: static dist/client with SPA fallback
 * The same Express server hosts /api in both modes (Databricks App pattern).
 */

import express from "express";
import path from "node:path";
import { config } from "./config";
import { getDb } from "./db";
import { ensureSeeded } from "./services/demo";
import { createApp } from "./app";

async function attachClient(app: express.Express): Promise<void> {
  if (config.isProduction) {
    const clientDir = path.resolve(process.cwd(), "dist/client");
    app.use(express.static(clientDir));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(clientDir, "index.html"));
    });
    return;
  }
  // Dev only: dynamic import keeps Vite out of the production server bundle.
  // eslint-disable-next-line no-inline-import -- intentional build/runtime split
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      hmr: false,
      middlewareMode: true,
      ws: false,
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

async function main(): Promise<void> {
  const db = await getDb();
  const seeded = await ensureSeeded(db);
  const app = await createApp({ attachClient });
  app.listen(config.port, () => {
    const seedNote = seeded ? " (seeded demo data)" : "";
    console.log(
      `Neelu [${config.mode}] listening on http://localhost:${config.port}${seedNote}`,
    );
  });
}

main().catch((error) => {
  console.error("Failed to start Neelu:", error);
  process.exit(1);
});
