# Neelu Product Context

Neelu is a Databricks-native water-evidence ledger for prioritizing unsafe water infrastructure where healthcare access is weak. It combines citizen reports, contractor repair work, provider review, and Databricks-backed analytics into one auditable app.

## Users

- Citizens report suspected water issues from mobile devices using voice transcripts or a scan-to-report UPI QR mock.
- Contractors see repair tasks, complete work in the field, and sync completions after reconnecting.
- Healthcare providers review raw evidence, severity, symptoms, and recommendations before approving action.

## Product Rules

- Every state-changing action writes to `audit_events`.
- Local development must work with spoofed data under `LOCAL_SIM=true`.
- Production uses Lakebase for operational state and Databricks tables, Vector Search, and Model Serving for intelligence.
- The UI uses shadcn/ui, shadcn chart patterns, and the existing OKLCH preset.
