/** Response + validation helpers shared by all routes. */

import type { Response } from "express";
import type { ZodType } from "zod";
import { BadRequestError } from "../lib/errors";

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new BadRequestError("Validation failed", details);
  }
  return result.data;
}
