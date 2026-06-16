# Codex Notes For Neelu

This project keeps Codex as the active agent harness. The product is
`neelu/`; root-level `skills/` and `commands/` are a trimmed reference library,
not a separate app.

## Working Defaults

- Start product work in `neelu/`.
- Prefer Neelu docs and scripts over root-level references.
- Use `.agents/skills/` when a matching skill is relevant.
- Treat networked MCP and Databricks operations as read-only until the user
  explicitly asks for a deploy, mutation, post, push, or credential change.

## Useful Local Gates

```bash
cd neelu
npm run check-scope
npm run typecheck
npm run test
npm run eval
npm run build
```

## Testing Surfaces

- `localhost` is the primary development loop.
- The Databricks Apps URL validates production hosting, env wiring, Lakebase,
  Unity Catalog, serving endpoints, and public app behavior.
