# 3-minute demo script

**Setup:** `cd neelu && npm install && npm run dev`, open `http://localhost:8000`. The DB auto-seeds 3 systems and 3 scenarios on first boot. (Optional: click **Reset demo data** on the command desk for a clean, deterministic state.)

## 0:00 — The problem (15s)

"A field worker tests water in a village. Today that result lives in a notebook or a WhatsApp message. Neelu turns it into a **cited, human-approved, fully auditable** public-health case — and it's built Databricks-native."

## 0:15 — Field intake (30s)

- Go to **`/field`**.
- Pick **North School Tap**, test type **Nitrate**, value **18.4 mg/L**, add a location and note.
- Submit → show the **Signal ID** and "Received" status.
- "Phone-submittable. That write also created an immutable audit event."

## 0:45 — Command desk (30s)

- Go to **`/`**.
- Left: the **water systems**. Center: the **signal queue** (your new submission) and the **case queue**. Right: the **Databricks proof panel**.
- "The proof panel is honest: in this hackathon build everything is **Local fallback** — PGlite instead of Lakebase, deterministic analyzer instead of Model Serving. Flip one env var and these go green; the app logic is identical."
- Click **Analyze** on the nitrate signal.

## 1:15 — Cited agent finding (45s)

- Land on **`/cases/:id`**. Walk the tabs:
  - **Agent finding** — severity, recommendation, and **citations** to guidance. Note the "deterministic fallback, fully cited" banner.
  - **Evidence** — the field result + retrieved guidance + site profile.
  - **Tasks** — the generated action plan (confirmatory sample, notify supervisor, review notice, follow-up, record decision).
  - **Notice draft** — English + Hindi, clearly stamped **DRAFT**, never auto-sent.

## 2:00 — Human in the loop (30s)

- Go to the **Approval** tab. "Neelu never acts on its own."
- Open **Approve** (or **Override** to show the replacement-action path, or **Request more evidence**). Enter approver + rationale, confirm.
- Show the case status flip and the new decision in history.

## 2:30 — Proof: audit + trace + evals (30s)

- **Audit** tab — the immutable timeline: signal → case → guidance → finding → tasks → notice → approval.
- **Trace** tab — the trace id, each tool call (with `fallback` markers and timings), and the **eval scorers** all passing: has_citations, requires_human_approval, flags_uncertainty, creates_required_tasks, no_certified_compliance_claim, writes_audit_events.
- "Same scorers run in CI via `npm run eval`. Safety is tested, not promised."

## Close (10s)

"Built to be picked up and shipped on a real Databricks workspace — the adapters and handoff doc are ready. That's Neelu."
