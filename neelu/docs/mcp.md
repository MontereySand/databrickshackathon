# MCP (Model Context Protocol) configs

Neelu's agent pipeline runs **in-process** (the orchestrator + tools in `src/agents/`), so MCP servers are **not required** to run the app. This doc lists the MCP servers that are useful when *developing, operating, or extending* Neelu — for an agent working in this repo or for a future "tools over MCP" refactor of the orchestrator.

## When MCP helps here

- **Operating the live deployment** — querying Lakebase, inspecting Unity Catalog, or checking Model Serving from an agent session.
- **Extending the orchestrator** — if you later expose Neelu's tools (`searchGuidance`, `lookupSiteProfile`, `recordApproval`, …) over MCP so other agents can compose them, mirror the contracts in `src/agents/tools.ts`.

## Suggested servers

| Server | Use for Neelu | Notes |
|---|---|---|
| Postgres MCP | Inspect/seed the Lakebase (or local) DB | Point at `DATABASE_URL`. Read-only recommended for ops. |
| Databricks MCP | Workspace, Unity Catalog, jobs, serving | Auth via profile/token; needed only in DATABRICKS mode. |
| Filesystem MCP | Repo-scoped file access for agents | Scope to the `neelu/` directory. |
| Fetch / HTTP MCP | Pull public guidance source pages | Keep to allow-listed domains. |

## Where configs live

This repo keeps MCP server definitions under the workspace's `mcp-configs/` (root-level) per the project layout. Add a Neelu-specific entry there rather than committing credentials:

```jsonc
// example shape — do NOT commit secrets; use env/secret references
{
  "mcpServers": {
    "neelu-postgres": {
      "command": "<postgres-mcp-binary>",
      "env": { "DATABASE_URL": "${DATABASE_URL}" }
    }
  }
}
```

## Safety

- Never embed tokens or connection strings in committed MCP configs — reference environment variables or a secret manager.
- Give ops MCP servers **read-only** access where possible; Neelu's own mutations must continue to flow through the audited service/repository layer so the audit trail stays complete.
