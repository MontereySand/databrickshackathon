# Third-party notices & data provenance

## Data

All data shipped with Neelu — water systems, field test results, people, guidance documents, and notices — is **synthetic and fictional**, created for demonstration only. It does not represent any real system, person, laboratory result, or official guidance. Contaminant reference thresholds approximate widely-cited public drinking-water values (e.g. EPA Maximum Contaminant Levels and WHO guideline values) and are used solely for demo reasoning. **Neelu does not certify regulatory or legal compliance.**

If you replace the synthetic corpus with real guidance documents, verify each source's license/terms permit redistribution and update this file with attributions.

## Key dependencies

Neelu builds on open-source software. Each is distributed under its own license (predominantly MIT); consult each project for the authoritative text.

| Package | Role | License (typical) |
|---|---|---|
| react, react-dom | UI runtime | MIT |
| react-router-dom | Client routing | MIT |
| vite, @vitejs/plugin-react | Build/dev server | MIT |
| express | HTTP server | MIT |
| zod | Schema validation | MIT |
| @electric-sql/pglite | In-process Postgres (LOCAL_SIM) | Apache-2.0 |
| pg | Postgres client (DATABRICKS / local) | MIT |
| tailwindcss, @tailwindcss/vite | Styling | MIT |
| shadcn/ui (generated components) | UI components | MIT |
| radix-ui | Headless UI primitives | MIT |
| @remixicon/react | Icons | Apache-2.0 |
| sonner | Toast notifications | MIT |
| class-variance-authority, clsx, tailwind-merge | Class utilities | MIT |
| @fontsource-variable/manrope | Font | SIL OFL-1.1 |
| tsx, esbuild | TS execution / bundling | MIT |
| vitest, supertest | Testing | MIT |
| dotenv, cross-env | Env handling | MIT / MIT |

This table is a convenience summary, not a legal document. Run `npm ls` / your license tooling of choice to produce an authoritative dependency + license report before any external distribution. Generated shadcn/ui component code lives in `src/client/components/ui` and is yours to modify under the shadcn/ui terms.
