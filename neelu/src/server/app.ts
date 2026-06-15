/**
 * Express app factory. Mounts the API router and a typed error handler. Client
 * serving (Vite dev middleware or static prod files) is attached by the caller
 * via `attachClient`, before the error handler so it stays last.
 */

import express from "express";
import type { Express, ErrorRequestHandler } from "express";
import { apiRouter } from "./routes/api";
import { AppError } from "./lib/errors";
import type { ApiError } from "../shared/types";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiError = {
      error: err.code,
      message: err.message,
      details: err.details,
    };
    res.status(err.status).json(body);
    return;
  }
  // Unexpected: log server-side, return a generic message (no internals leaked).
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_error", message: "Internal server error" });
};

export interface CreateAppOptions {
  attachClient?: (app: Express) => Promise<void> | void;
}

export async function createApp(
  options: CreateAppOptions = {},
): Promise<Express> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", apiRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found", message: "Unknown API route" });
  });

  if (options.attachClient) {
    await options.attachClient(app);
  }

  app.use(errorHandler);
  return app;
}
