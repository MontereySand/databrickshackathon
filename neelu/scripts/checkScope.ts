/**
 * `npm run check-scope` — static guardrail that the project surface stays intact:
 *   1. every file the master spec requires actually exists, and
 *   2. the client API client and the Express router agree (no client call to a
 *      missing route, and no obviously dead server route).
 *
 * It reads source as text (no DB, no server boot) so it is fast and safe to run
 * in CI. Exits non-zero if any required file is missing or a client call has no
 * matching server route.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  // Shared contracts
  "src/shared/types.ts",
  "src/shared/schemas.ts",
  "src/shared/constants.ts",
  // Data layer + SQL
  "sql/lakebase_schema.sql",
  "sql/uc_tables.sql",
  "sql/ai_search_indexes.sql",
  "src/server/db/index.ts",
  "src/server/db/schema.ts",
  "src/server/db/repositories.ts",
  // Agents + evals
  "src/agents/orchestrator.ts",
  "src/agents/tools.ts",
  "src/agents/prompts.ts",
  "src/agents/safety.ts",
  "src/agents/fallbackFindings.ts",
  "src/evals/scorers.ts",
  "src/evals/runEval.ts",
  // Server
  "src/server/app.ts",
  "src/server/index.ts",
  "src/server/config.ts",
  "src/server/routes/api.ts",
  // Databricks adapters
  "src/server/databricks/aiSearch.ts",
  "src/server/databricks/modelServing.ts",
  "src/server/databricks/mlflow.ts",
  "src/server/databricks/unityCatalog.ts",
  "src/server/databricks/capabilities.ts",
  // Client screens
  "src/client/main.tsx",
  "src/client/App.tsx",
  "src/client/lib/api.ts",
  "src/client/routes/FieldPage.tsx",
  "src/client/routes/DeskPage.tsx",
  "src/client/routes/CasePage.tsx",
  // Deploy + docs + handoff
  "app.yaml",
  "databricks.yml",
  ".env.example",
  "README.md",
  "HANDOFF.md",
];

interface Route {
  method: string;
  path: string;
}

function normalize(routePath: string): string {
  return routePath
    .replace(/\$\{[^}]+\}/g, ":p") // client template params
    .replace(/:[^/]+/g, ":p"); // express params
}

function key(route: Route): string {
  return `${route.method.toUpperCase()} ${normalize(route.path)}`;
}

function readServerRoutes(): Route[] {
  const file = readFileSync(path.join(ROOT, "src/server/routes/api.ts"), "utf8");
  const routes: Route[] = [];
  const re = /apiRouter\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(file)) !== null) {
    routes.push({ method: match[1], path: match[2] });
  }
  return routes;
}

function readClientRoutes(): Route[] {
  const file = readFileSync(path.join(ROOT, "src/client/lib/api.ts"), "utf8");
  const routes: Route[] = [];
  // GET calls: http<...>("..." | `...`)
  const getRe = /\bhttp<[^>]*>\(\s*[`"]([^`"]+)[`"]/g;
  // POST helper: post<...>("..." | `...`)
  const postRe = /\bpost<[^>]*>\(\s*[`"]([^`"]+)[`"]/g;
  let m: RegExpExecArray | null;
  while ((m = getRe.exec(file)) !== null) {
    routes.push({ method: "get", path: m[1] });
  }
  while ((m = postRe.exec(file)) !== null) {
    routes.push({ method: "post", path: m[1] });
  }
  return routes;
}

function main(): void {
  const problems: string[] = [];
  const warnings: string[] = [];

  for (const rel of REQUIRED_FILES) {
    if (!existsSync(path.join(ROOT, rel))) {
      problems.push(`Missing required file: ${rel}`);
    }
  }

  const serverRoutes = readServerRoutes();
  const clientRoutes = readClientRoutes();
  const serverKeys = new Set(serverRoutes.map(key));
  const clientKeys = new Set(clientRoutes.map(key));

  for (const route of clientRoutes) {
    if (!serverKeys.has(key(route))) {
      problems.push(
        `Client calls ${key(route)} but no matching server route exists`,
      );
    }
  }

  for (const route of serverRoutes) {
    if (!clientKeys.has(key(route))) {
      warnings.push(`Server route ${key(route)} is not called by the client`);
    }
  }

  console.log(
    `check-scope: ${REQUIRED_FILES.length} required files, ` +
      `${serverRoutes.length} server routes, ${clientRoutes.length} client calls`,
  );
  for (const warning of warnings) console.warn(`  warn: ${warning}`);

  if (problems.length > 0) {
    console.error("\ncheck-scope FAILED:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("check-scope OK");
}

main();
