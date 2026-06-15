# Session handoff → Codex

> Single source of truth for picking up this work. Read this first, then `neelu/HANDOFF.md`. Nothing here requires the prior chat transcript.

## 1. What this repo is

- The working directory (`/home/user/Downloads/Databricks`) is the **"Everything Claude Code" (ECC) toolkit** (`ecc-universal` v2.0.0), cloned from GitHub — 64 agents, 197 skills, 84 commands, 20 rule sets, 7 harness adapters, doc translations.
- The **actual product lives in [`neelu/`](./neelu/)**: *Neelu*, a Databricks-native water-evidence ledger (Vite + React 19 + Express 5 + TypeScript; PGlite locally, Lakebase in prod).
- ECC is just a dev harness/library here. **Run all product commands from `neelu/`**, never the root `package.json` (that's ECC's own tooling).
- **No git anywhere** (root or `neelu/` are not repos). Deletions are irreversible. **Recommended first action: `cd neelu && git init && git add -A && git commit -m "baseline"`** (a `.gitignore` already ignores `.env` and `.data/`). Optionally `git init` at root before any harness deletion so it's reversible.

## 2. Neelu product status — COMPLETE & VERIFIED

Built end-to-end and runs fully in `LOCAL_SIM` mode with no Databricks creds. All gates were green this session:

| Gate | Result |
|---|---|
| `npm run typecheck` | clean (client + server) |
| `npm run build` | client 157 modules + server bundle (79.5kb) |
| `npm run test` | 9/9 (vitest + supertest) |
| `npm run eval` | 18/18 scorer checks across 3 scenarios |
| `npm run check-scope` | OK (36 files, 15 client calls ↔ 15 server routes) |
| Live prod-server demo walk | health → analyze (4 citations, 5 tasks, 2 notices) → approve → full audit timeline → trace 6/6 → 409 on re-decide |

Run it: `cd neelu && npm install && npm run dev` → http://localhost:8000 (auto-seeds). Screens: `/field` (mobile intake), `/` (command desk), `/cases/:id` (7 tabs: Agent finding, Evidence, Tasks, Notice draft, Approval, Audit, Trace).

### Key paths inside `neelu/`
- `src/shared/{types,schemas,constants}.ts` — single source of truth (Zod + types). Don't let contracts drift.
- `src/server/` — `app.ts`, `routes/api.ts` (15 routes), `db/` (PGlite + Postgres behind one `Db` interface), `services/`, `databricks/` (adapters + capability probe).
- `src/agents/` — `orchestrator.ts`, `tools.ts`, `safety.ts`, `fallbackFindings.ts`, `prompts.ts`.
- `src/evals/` — `scorers.ts` (6 deterministic safety/quality scorers) + `runEval.ts`.
- `src/client/` — `routes/{FieldPage,DeskPage,CasePage}.tsx`, `components/` (incl. `ui/` shadcn, `ProofPanel`, `badges`, `states`, `Logo`), `lib/{api,useApi,format,labels}.ts`.
- `docs/` (9 files), `HANDOFF.md`, `sql/`, `scripts/{seedDemo,resetDemo,checkScope}.ts`, `app.yaml`, `databricks.yml`, `.env.example`.

### Non-negotiable safety invariants (enforced in `src/agents/safety.ts`, checked by `src/evals/scorers.ts`)
cite-or-mark-unsupported · human-approval-required · flag-uncertainty · no-compliance-claim · audit-every-mutation. **Keep `npm run eval` green** through any change; prefer the deterministic fallback over unsafe model output.

### To go live on Databricks (not possible on Free Edition)
Implement the four `// DATABRICKS extension point` blocks (`databricks/{aiSearch,modelServing,mlflow,unityCatalog}.ts`), set `LOCAL_SIM=false` + `DATABASE_URL` + resource env vars (see `.env.example`). Full steps in `neelu/docs/databricks_setup.md` and `neelu/HANDOFF.md`.

## 3. In-flight task: ECC harness cleanup — PARTIALLY DONE, deletion PENDING

User asked to trim the ECC harness to this stack and do housekeeping. Decision = **Moderate** trim (remove active noise + translations + other-harness adapters; **keep** root `agents/`/`skills/`/`commands/`/`rules/` as a searchable library).

**Done (additive, safe):**
- Root `AGENTS.md`: prepended an "Active project: `neelu/`" banner so sessions stop treating ECC as the product.
- `neelu/HANDOFF.md`: added "Repository & harness context" section.

**Pending (NOT executed — Auto-review blocked the bulk `rm`, then the retry was interrupted; 0 files deleted):**
Run these from the repo root once git is initialized / you accept the approval prompt:
```bash
rm -rf docs .gemini .qwen .opencode .zed .codex .codex-plugin .claude-plugin README.zh-CN.md
rm -f .cursor/rules/golang-*.md .cursor/rules/kotlin-*.md .cursor/rules/php-*.md .cursor/rules/swift-*.md .cursor/rules/python-*.md
rm -rf .cursor/skills/{article-writing,bun-runtime,content-engine,frontend-slides,investor-materials,investor-outreach,market-research,nextjs-turbopack}
```
**Keep:** root `agents/`, `skills/`, `commands/`, `rules/` (library); `.cursor/rules/` common-* + typescript-*; `.cursor/skills/` `documentation-lookup` + `mcp-server-patterns`; `.mcp.json`. Aggressive/minimal alternatives were offered; user skipped the scope choice, so Moderate is the chosen default.

## 4. Next task the user wants: UI overhaul + checking (on `neelu/`)

- Design tokens are fixed in `lookhere.txt` (OKLCH): `--primary: oklch(0.841 0.238 128.85)` (green), `--radius: 0`; mirrored into `src/client/styles/index.css` with a `--neelu-green` alias. Logo = Remix Icon `RiFlashlightFill` bolt.
- Stack: shadcn/ui, Tailwind v4, React 19, react-router-dom v7, `sonner` toasts, local `theme-provider` (NOT `next-themes` — that import was already fixed in `ui/sonner.tsx`).
- For visual checking, `.mcp.json` includes the **Playwright MCP** (and context7 for live docs). Use it for screenshots / flow verification of `/field`, `/`, `/cases/:id`.
- When overhauling: preserve the safety UX (visible `DRAFT` badges on notices, approval-gated actions, no fake buttons, loading/error/empty states) and keep `npm run typecheck && npm run build && npm run test` green.

## 5. Gotchas for Codex

- **Auto-review blocks broad `rm -rf`** in this environment; either init git first, delete in smaller scoped batches, or proceed through the approval card.
- `commands/*.md` are **Claude Code / opencode slash commands** — Cursor does NOT load them as `/commands`; the equivalent in Cursor is the matching `SKILL.md`. No extra integration makes `/foo` work in Cursor.
- PGlite allows **one connection per data dir** → stop `npm run dev` before `npm run seed`/`reset-demo` on a file-backed DB. Tests/eval use in-memory PGlite (`PGLITE_DATA_DIR=memory`, set in `vitest.config.ts` / `runEval.ts`).
- Server port: `PORT` or `DATABRICKS_APP_PORT`, default 8000.
- Zod v4 + verbatimModuleSyntax + `noUnusedLocals` are on — keep `import type` for type-only imports and no dead imports, or typecheck fails.
