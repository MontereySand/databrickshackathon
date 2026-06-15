# API

All routes are mounted under `/api`. Inputs are validated with the Zod schemas in `src/shared/schemas.ts`. Responses use a consistent envelope: success returns `{ "data": ... }`; errors return `{ "error": <code>, "message": <text>, "details"?: [{ path, message }] }` with an appropriate HTTP status. The client (`src/client/lib/api.ts`) unwraps `data` and throws `ApiClientError` on failure.

## Endpoints

| Method | Path | Body (schema) | Returns |
|---|---|---|---|
| GET | `/health` | — | `HealthInfo` (mode, version, per-service capability) |
| GET | `/systems` | — | `WaterSystem[]` |
| GET | `/signals` | — | `SignalDTO[]` (with derived `status`, `caseId`, `systemName`) |
| POST | `/signals` | `createSignalSchema` | `Signal` (201) |
| GET | `/signals/:id` | — | `SignalDTO` |
| POST | `/signals/:id/analyze` | `analyzeSchema` | `CaseDetail` (201) |
| GET | `/cases` | — | `CaseListItem[]` |
| GET | `/cases/:id` | — | `CaseDetail` |
| POST | `/cases/:id/analyze` | `analyzeSchema` | `CaseDetail` |
| POST | `/cases/:id/approve` | `approveSchema` | `CaseDetail` |
| POST | `/cases/:id/override` | `overrideSchema` | `CaseDetail` |
| POST | `/cases/:id/request-more-evidence` | `requestMoreEvidenceSchema` | `CaseDetail` |
| GET | `/cases/:id/audit` | — | `AuditEvent[]` |
| GET | `/cases/:id/trace` | — | `CaseTrace` |
| POST | `/demo/reset` | `demoResetSchema` | `DemoResetSummary` |

## Inputs

- **createSignal** — `systemId`, `testType` (enum), `resultValue` (number), `unit`; optional `signalType`, `kitId`, `kitExpiresAt` (YYYY-MM-DD), `locationLabel`, `notes`, `photoRef`, `submittedBy`.
- **approve** — `approver`, `rationale` (both required).
- **override** — `approver`, `rationale`, `replacementAction` (all required). Creates a follow-up task.
- **request-more-evidence** — `requestedEvidence`, `owner`, `dueAt`; optional `approver`. Moves the case to `needs_more_evidence`.
- **demo/reset** — optional `scenario`, `seed`, `focusScenario`.

## State transitions

`approve`, `override`, and `request-more-evidence` reject cases already in a decided state (`approved`, `overridden`, `closed`) with `409 Conflict`. Unknown ids return `404`. Validation failures return `400` with `details`.

`check-scope` (`npm run check-scope`) statically verifies that every client call has a matching server route and vice versa.
