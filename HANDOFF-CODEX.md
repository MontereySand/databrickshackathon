# Codex Handoff

This repository has been pruned into a Neelu-first workspace.

## Current Shape

- Product: [`neelu/`](./neelu)
- Active agent harness: Codex only (`.codex/`, `.agents/skills/`)
- Reference library: selected Neelu-useful `skills/` and `commands/`
- MCP config examples: `.mcp.json` and `mcp-configs/`

Removed surfaces include generated dependency folders, raw CSV data, non-Codex
harnesses, off-stack language packs, and root ECC package tooling.

## Product Commands

Run from `neelu/`:

```bash
npm run dev
npm run check-scope
npm run typecheck
npm run test
npm run eval
npm run build
```

## Testing Guidance

Use localhost first for development and `LOCAL_SIM` verification. Use the
Databricks Apps URL for deployed validation once credentials and workspace
resources are configured.

## Databricks Notes

The Databricks CLI is installed locally, but live validation/deploy still needs
an authenticated profile and a workspace tier that supports Databricks Apps and
Lakebase. Keep Databricks notebooks, bundle jobs, app manifests, SQL, and docs
under `neelu/`; they are product assets.
