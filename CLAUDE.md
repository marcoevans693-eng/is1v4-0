# CLAUDE.md — IS1 v4.0

## System Identity

IntelliSys1 v4.0 (IS1 v4.0) is a unified personal AI intelligence platform — a single FastAPI application on a single VPS, hosting an open-ended series of capability modules under one React shell. Marco is the sole owner, operator, and curator.

**Spec reference:** IS1v4_0_System_Specification_v1.0 (decision-complete, April 27 2026)  
**Active version:** IS1 v4.0 — build in progress  
**Project root:** `/opt/is1v4_0/`  
**Subdomain (build):** `https://v4.matriixai.com`  
**Subdomain (production, post-cutover):** `https://matriixai.com`  
**v3 archive:** `/opt/intellisys1-v3/` (frozen read-only at v1.4.0)  

**Core philosophy:** LexisNexis-quality personal research library. Governed, auditable, event-sourced cognition system with first-class inference control. Marco curates; system stores and retrieves without editorial judgment.

---

## Architecture

IS1 v4.0 is a single unified platform (v3 + IS1-TR collapsed). One FastAPI process, one Postgres DB, one Qdrant instance, one React shell.

**Key v4 shifts from v3:**
1. CapaProxy is the inference firewall — every model call goes through it
2. Four-layer memory system — active from Day 1
3. Event sourcing — every event captured, 30-day retention
4. Append-only spec/doc system — lives in the platform
5. Multimodal first-class — text, image, video, audio, PDF
6. MapGraph — tagless semantic categorization via Apache AGE
7. Modular shell — one UI hosting open-ended module roster
8. Tagless enforcement — no `tags` columns anywhere in v4 schema

---

## Stack

| Layer | Component | Notes |
|---|---|---|
| Proxy | Nginx | Reverse proxy, SSL |
| Backend | FastAPI (Python) | Uvicorn on `127.0.0.1:8001` |
| Frontend | React + Vite | Dist served via Nginx static |
| Primary DB | PostgreSQL 17 | Database `is1v4_0` |
| Vector store | Qdrant | Docker `intellisys1-qdrant`, port `6333`. Collections: `is1v4_knowledge`, `is1v4_memory`, `is1v4_events` |
| Graph | Apache AGE | Postgres extension. Graph: `is1v4_mapgraph` |
| Analytics/Audit | DuckDB | `data/duckdb/intellisys1_v4.duckdb` |
| Governance | JSONL | `data/jsonl/governance.jsonl` (append-only) |
| Inference gateway | OpenRouter (primary) | Pay-per-token |
| Inference (Gemini MM) | Direct Google SDK | Carve-out for native multimodal |
| Inference firewall | CapaProxy | All calls preflight + receipt (Phase 6) |
| Embeddings | OpenAI `text-embedding-3-small` | 1536-dim, cosine |
| Extraction | Gemini 2.5 Flash-Lite | MapGraph entity/proposition extraction |

---

## Infrastructure

| Item | Value |
|---|---|
| Provider | Hostinger |
| OS | Ubuntu 24 |
| CPU | AMD EPYC 9354P, 4 vCPU |
| RAM | 16GB |
| Storage | 200GB NVMe |
| IP | `77.37.63.4` |
| Domain (build) | `https://v4.matriixai.com` |
| Domain (prod) | `https://matriixai.com` (post-cutover) |
| Project root | `/opt/is1v4_0/` |
| Dev editor | code-server on port 8080 |
| CLI build tool | Claude Code CLI (`claude`) with `--dangerously-skip-permissions` |
| Terminal | tmux |
| GitHub | `marcoevans693-eng/is1v4-0`, branch `main` |
| v3 archive | `/opt/intellisys1-v3/` (frozen) |

---

## Data Placement

| Store | Owns |
|---|---|
| PostgreSQL | `documents`, `folders`, `campaigns`, `conversations`, `turns`, `chat_links`, `spec_records` (Phase 3), `v4_events` (Phase 8), `v4_web_cache` (Phase 9), `memory_kv` (Phase 7), `mapgraph_nodes`/`mapgraph_edges` via AGE (Phase 11), `users`, `sessions` (Phase 13), `uploads_reservoir` (Phase 5) |
| Qdrant | `is1v4_knowledge` (corpus chunks), `is1v4_memory` (episodic memory, Phase 7), `is1v4_events` (semantic event recall, Phase 8) |
| AGE (in Postgres) | MapGraph nodes + relations (Phase 11) |
| DuckDB | `v4_receipts` (CapaProxy provenance, Phase 6), document facts, access log, query log |
| JSONL | `data/jsonl/governance.jsonl` (governance spine, append-only) |
| Filesystem | Uploaded files, extracted text, thumbnails (per spec §2.12 layout) |

**Do not cross-place data. If unsure, ask Marco.**

---

## Module Roster (Day-1 v4)

| Module | Nav | Status |
|---|---|---|
| Chat | Top tab | Phase 4 |
| Knowledge | Top tab | Phase 4/5 |
| Specs | Top tab | Phase 3 |
| Tasks | Top tab | Placeholder stub |
| Events | Top tab | Phase 8 |
| CapaProxy | Rail | Phase 6 |
| MapGraph Explorer | Rail | Phase 12 |

---

## Core Principles (Carried From v3)

- **Full-Fidelity Retrieval:** Chunks are indexing only. Full documents are the retrieval unit.
- **System Agnosticism:** No filtering, no editorial layer.
- **Forward-Only Ingestion:** All documents are net-new.
- **Governance Logging:** Every significant action produces an audit trail.
- **Idempotency:** All pipelines safe to re-run.
- **No Architectural Drift:** Build exactly what is specified.
- **No Background Loops:** No hidden autonomous processes.
- **HITL for Deletion and External Comms.**

---

## No-Blind-Decisions Rule (Non-Negotiable)

**Before producing any execution plan, build instruction, directory structure decision, or architectural recommendation that touches the VPS, first confirm the live state of the system.** Read the actual files. Check the actual services. Query the actual databases. The VPS is the source of truth for what exists. The spec is the source of truth for what we're building. No assumptions. No inventing what isn't confirmed.

This rule is permanent.

---

## Claude Code Execution Rules

### Autonomous Execution
Every CC session launches with `--dangerously-skip-permissions`. CC must never prompt for permission during execution. If the plan isn't fully decided before the run starts, the run doesn't start.

**CC entry prompt must include:** `"Do not prompt for confirmation at any point. Assume yes to all permission and file access questions. Execute autonomously start to finish."` and must reference the specific CC instruction file by name.

### Build Logs
Every CC run produces a log at `/opt/is1v4_0/build-logs/`. Naming: `{phase}_{step}_{YYYYMMDD}_{HHMMSS}.log`.

### Execution Prompt Contract
`"Phase [X] Step [Y]: [task]. Files in scope: [file1], [file2]. No exploration."` Reject if it doesn't match.

---

## Build Discipline

- Spec before code. Always.
- Contracts before code. Proof before expansion.
- Phase plans with sign-off-able milestones. No monolithic deliveries.
- Fault-test before sign-off.
- Observable outputs at every milestone.
- No improvisation. No architectural drift.
- Governance before execution. Idempotency enforced everywhere.
- One step at a time. Test, confirm, log, wait for sign-off.

---

## Working Conventions

### Session Structure
Each chat: Marco provides handoff docs + VPS snapshot → Claude produces CC instruction file → Marco executes autonomously → pastes build log → Claude verifies before proceeding.

### VPS Snapshot Commands (run at every session open)
```bash
cd /opt/is1v4_0 && git log --oneline -8 && git status
curl -s https://v4.matriixai.com/api/health | python3 -m json.tool
sudo -u postgres psql -d is1v4_0 -c "\dt"
docker ps | grep qdrant
ls -la /opt/is1v4_0/data/
df -h /
free -h
```

### Claude UI vs. Claude Code CLI
- **Claude UI (chat):** Diagnosis, planning, architecture, spec writing, handoff documents.
- **Claude Code CLI:** All build execution. No exceptions.

### File Editing
All file content as complete files for full select-all-and-paste replacement. Never surgical find-and-replace for heavily modified files. Targeted `str_replace` acceptable for single-line surgical edits only.

### Python Write Blocks
`python3 << 'PYEOF'` is the confirmed write pattern. Heredoc (`<< 'EOF'`) is prohibited — causes terminal truncation.

### psql Access
Always `sudo -u postgres psql` — never connect as root directly.

### Batch Processing
Groups of 50 for bulk operations.

---

## Permanently Excluded From v4

| Item | Rationale |
|---|---|
| Skills (prompt ingestion as composable units) | Marco: "rookie stuff" |
| AdamOS | Marco: "irrelevant, already baked in anyway" |
| Ollama / local models | Carries from v3 |
| Shadow / Sidekick / Datapoint pipeline | Removed in v3 |
| Auth0 | Excluded |
| Memgraph (the product) | Replaced by MapGraph (AGE-based capability) |
| Tags / human-applied subject markers | Schema-level exclusion. MapGraph only. |
| Retroactive MapGraph pass over v3 corpus | Day-1 forward only |
| Image generation (active) | Deferred |
| AAEP | Deferred — CC is the only build executor |

---

## Constraints

- Single-node VPS. 4 cores / 16GB. Don't propose what won't fit.
- Shoestring budget. No enterprise SaaS without explicit approval.
- No background loops. No hidden autonomous processes.
- No schema mutation without approval.
- Git for version control.

---

## Key Learnings (Carried From v3)

1. Legacy data pollution is real. Qdrant must be kept clean of stale points.
2. tsvector alone misses partial words. Layer tsvector + prefix + ILIKE + semantic.
3. Shadow pipeline added latency without value. Removed.
4. Raw markdown in document view is unreadable. Always render.
5. Multiple ingestion methods add complexity without value.
6. File ownership inconsistencies cause problems. Consistent ownership from the start.
7. Stale processes accumulate. Clean up lingering uvicorn processes.
8. `.env` backup files clutter root. Single `.env` only.

---

## Stop Condition

**Ambiguity → Pause. Do not invent. Ask Marco.**
