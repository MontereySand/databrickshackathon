import { randomUUID } from "node:crypto";

/** Generate a human-readable, collision-resistant id like `CASE-9F3A2B7C10`. */
export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/gu, "").slice(0, 10).toUpperCase()}`;
}
