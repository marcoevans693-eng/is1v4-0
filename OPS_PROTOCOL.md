# IS1 v4.0 Operations Protocol — Token Governance

## BEFORE EVERY TASK EXECUTION

1. DO NOT run Explore tasks unless explicitly instructed with: `EXPLORE AUTHORIZED`
2. DO NOT read the Spec file unless explicitly instructed with: `SPEC READ AUTHORIZED`
3. DO NOT walk the directory tree. The canonical map below is your structure reference.
4. Read ONLY files explicitly named in the prompt or this list:
   - `CLAUDE.md`
   - The specific implementation file named in the task
   - The specific test/gate file for the current phase

## ENTRY PROMPT CONTRACT

Every Phase prompt follows this format — reject and ask for clarification if it doesn't:

> "Phase [X] Step [Y]: [task]. Files in scope: [file1], [file2]. No exploration."

## AUTONOMOUS EXECUTION

Claude Code launches with `--dangerously-skip-permissions`. No permission prompts. Ever. If the plan isn't decided before the run, the run doesn't start.

Entry prompt must include: `"Do not prompt for confirmation at any point. Assume yes to all permission and file access questions. Execute autonomously start to finish."`

## BUILD LOGS

Every CC run produces a log at `build-logs/`. Naming: `{phase}_{step}_{YYYYMMDD}_{HHMMSS}.log`.

## THINKING BUDGET

- Simple implementation tasks: minimal thinking, execute directly
- Architecture decisions only: full thinking authorized
- Default: DO NOT enter extended thinking for build execution steps

## SESSION HYGIENE

- After every major step: run `/compact` if context is heavy
- Before any new step: if context exceeds 40k tokens, compact first
- Spec file is NEVER in scope during build execution phases

---

## DIRECTORY MAP (Canonical — Phase 1 State)

Phase annotations mark when directories/files are created or become active.

```
/opt/is1v4_0/
├── CLAUDE.md                                     ← v4 system identity + CC directives
├── OPS_PROTOCOL.md                               ← this file
├── IS1v4_0_System_Specification_v1_0.md          ← canonical v4 spec
├── .claude/
│   └── settings.local.json
├── .env                                          ← secrets, never print
├── .gitignore
├── pyproject.toml
├── docker-compose.yml
│
├── config/
│   ├── routing.yaml                              ← IS1v3 inference failover (carried, Phase 9 refactor)
│   ├── thinkrouter_models.yaml                   ← model registry (Phase 9 replacement)
│   └── limits.yaml                               ← file size caps per spec §2.12 (Phase 5)
│
├── backend/
│   ├── main.py                                   ← FastAPI app factory + router registration
│   ├── config.py                                 ← env/config loader (Pydantic BaseSettings)
│   ├── __init__.py
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   └── health.py                             ← health check endpoint
│   │
│   ├── routers/                                  ← IS1v3 routers (carried, Phase 4 refactor)
│   │   ├── __init__.py
│   │   ├── knowledge.py
│   │   ├── chat.py
│   │   ├── folders.py
│   │   ├── campaigns.py
│   │   ├── queries.py
│   │   └── observability.py
│   │
│   ├── thinkrouter/                              ← IS1-TR routers (carried, Phase 4 unification)
│   │   ├── __init__.py
│   │   ├── thinkrouter.py
│   │   ├── thinkrouter_search.py
│   │   └── thinkrouter_usage.py
│   │
│   ├── capaproxy/                                ← [Phase 6] inference firewall
│   │   └── __init__.py                          ← scaffold
│   │
│   ├── memory/                                   ← [Phase 7] four-layer memory router
│   │   └── __init__.py                          ← scaffold
│   │
│   ├── events/                                   ← [Phase 8] event sourcing
│   │   └── __init__.py                          ← scaffold
│   │
│   ├── mapgraph/                                 ← [Phase 11] MapGraph core
│   │   └── __init__.py                          ← scaffold
│   │
│   ├── agents/                                   ← scaffold (__init__.py)
│   ├── db/                                       ← scaffold (__init__.py)
│   ├── governance/                               ← scaffold (__init__.py)
│   ├── orchestration/                            ← scaffold (__init__.py)
│   ├── retrieval/                                ← scaffold (__init__.py)
│   ├── routing/                                  ← scaffold (__init__.py)
│   ├── services/                                 ← scaffold (__init__.py)
│   └── utils/                                    ← scaffold (__init__.py)
│
├── data/
│   ├── duckdb/
│   │   ├── intellisys1_v4.duckdb                ← active v4 DuckDB
│   │   └── intellisys1_v3.duckdb                ← historical v3 data (read-only ref)
│   ├── governance/
│   │   └── ingest_receipts.jsonl                ← IS1v3 ingest audit (carried)
│   ├── jsonl/
│   │   └── governance.jsonl                     ← governance spine (append-only)
│   ├── uploads/
│   │   ├── reservoir/                            ← [Phase 5] pre-folder staging
│   │   │   └── _expired/
│   │   └── corpus/                              ← [Phase 5] folder-assigned files
│   │       ├── images/{folder_id}/
│   │       ├── audio/{folder_id}/
│   │       ├── video/{folder_id}/
│   │       ├── pdf/{folder_id}/
│   │       └── text/{folder_id}/
│   ├── extracted/                               ← [Phase 5] derived text
│   │   ├── transcripts/
│   │   ├── ocr/
│   │   └── descriptions/
│   ├── thumbnails/                              ← [Phase 5]
│   └── tr_uploads/                             ← IS1-TR legacy attach drop (Phase 4 cleanup)
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js                           ← proxy: 127.0.0.1:8001
│   ├── public/
│   │   └── md-viewer.html
│   └── src/
│       ├── main.jsx
│       ├── index.css
│       ├── App.jsx
│       ├── styles/
│       │   └── tokens.css
│       ├── api/
│       │   └── client.js
│       ├── config/
│       │   └── modules.js                       ← [Phase 4] module registry
│       ├── hooks/
│       └── components/
│           ├── [all v3 components carried]      ← Phase 4 shell refactor
│           └── [v4 modules scaffold here]       ← Phase 4+
│
├── build-logs/                                  ← CC build logs (auto-generated)
├── logs/
│   └── uvicorn.log
└── tests/
    └── __init__.py
```

**Map maintenance rule:** When a new file is created, add it to this map as part of that task's completion step. One line, same step. No separate explore run.

---

## WHAT IS NOT IN THIS SYSTEM

Permanently excluded. Do not reference, reintroduce, or suggest:

- **Memgraph (the product)** — MapGraph (AGE-based) is the graph layer
- **Ollama** — No local models
- **Shadow / Sidekick / Datapoint pipeline** — Removed in v3
- **AdamOS** — Does not exist
- **Auth0** — Does not exist
- **Skills** — Does not exist in v4
- **Tags / document_tags tables** — DROPPED. MapGraph only.
- **AAEP** — Deferred
- **Image generation** — Deferred
- **Retroactive MapGraph corpus pass** — Day-1 forward only

---

*This protocol governs Claude Code session behavior only.*
*Updated: Phase 1 Migration — April 27, 2026*
