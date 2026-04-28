# IS1 v4.0 — Phase 2: Caching Layer
**Spec Reference:** IS1v4_0_System_Specification_v1.0 §2.8  
**Phase:** 2 of 14  
**Deliverable:** Anthropic prompt caching active on all dispatch calls. Cache metrics captured for all providers. DuckDB receipts tracking cache data. DuckDB path bug fixed.  
**Authored:** Chat 04 — April 28, 2026  

---

## CC Entry Prompt (copy exactly when launching)

```
Phase 2 Step ALL: Caching layer. Files in scope: phase_02_caching.md, CLAUDE.md, OPS_PROTOCOL.md. No exploration. Do not prompt for confirmation at any point. Assume yes to all permission and file access questions. Execute autonomously start to finish. Follow phase_02_caching.md step by step.
```

Launch from `/opt/is1v4_0/`:
```bash
cd /opt/is1v4_0
claude --dangerously-skip-permissions
```

---

## Autonomous Execution Directive

Execute every numbered step in sequence. Do not skip. Do not prompt Marco. If a step fails, stop and report the exact failure. Do not auto-recover — surface the error.

---

## Files Modified In This Phase

| File | Change |
|---|---|
| `backend/services/caching.py` | NEW — cache service module |
| `backend/services/__init__.py` | NEW — package init |
| `backend/thinkrouter/dispatch.py` | MODIFY — 4 surgical str_replace edits |
| `backend/thinkrouter/thinkrouter.py` | MODIFY — 3 surgical str_replace edits |
| `backend/config.py` | MODIFY — add caching_enabled setting |
| `.env` | MODIFY — add CACHING_ENABLED=true |
| `data/duckdb/intellisys1_v4.duckdb` | MODIFY — ALTER tr_receipts, 4 cache columns |

**Files NOT touched:** Any v3 file, any other router, Nginx, systemd, Postgres schema, Qdrant.

---

## Architecture Context

The dispatch chain is:
```
thinkrouter.py (append_turn endpoint)
  → dispatch_turn() in dispatch.py        ← system prompt assembled here
      → dispatch_anthropic()              ← cache_control injected here
      → dispatch_openai()                 ← cache metrics captured here
      → dispatch_google()                 ← stub metrics here
  → _duckdb_write_receipt()               ← cache columns written here
```

RAG chunks and included chats are both folded into `full_system` (the system context string) in `dispatch_turn()` before the provider call. Anthropic prompt caching wraps this entire string as one cached block — correct and optimal given the current architecture.

**DuckDB path bug (found in pre-flight review of thinkrouter.py):**
`DUCKDB_PATH` is hardcoded as `is1v4_0.duckdb` but the actual file is `intellisys1_v4.duckdb`. Receipt writes have been silently failing since Phase 1. Fixed in Step 2.4.

---

## Step 2.0 — Pre-flight

```bash
echo "=== Phase 2 Pre-flight ===" | tee /opt/is1v4_0/build-logs/phase_02_step_2_0_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0

test -f CLAUDE.md && echo "PASS: in v4 root" || echo "FAIL: wrong directory"

curl -sf https://v4.matriixai.com/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('v4:', d['status'], '| db:', d['stores']['postgres']['database'])"
curl -sf https://matriixai.com/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('v3:', d['status'])"

test -f backend/thinkrouter/dispatch.py && echo "PASS: dispatch.py exists" || echo "FAIL"
test -f backend/thinkrouter/thinkrouter.py && echo "PASS: thinkrouter.py exists" || echo "FAIL"
test -f data/duckdb/intellisys1_v4.duckdb && echo "PASS: DuckDB file exists" || echo "FAIL"

echo "--- DuckDB path in thinkrouter.py ---"
grep "DUCKDB_PATH" backend/thinkrouter/thinkrouter.py

git status --short
```

---

## Step 2.1 — Create Cache Service Module

**Files in scope:** `backend/services/caching.py` (NEW), `backend/services/__init__.py` (NEW)

```bash
echo "=== Step 2.1: Cache service module ===" | tee -a /opt/is1v4_0/build-logs/phase_02_step_2_1_$(date +%Y%m%d_%H%M%S).log
mkdir -p /opt/is1v4_0/backend/services
```

```python3 << 'PYEOF'
content = '''"""
backend/services/caching.py
IS1 v4.0 — Cache Service
Spec ref: IS1v4_0_System_Specification_v1.0 §2.8

Handles cache_control injection for Anthropic prompt caching.
Captures cache metrics from all provider responses.
CapaProxy (Phase 6) will wrap and extend this module.

Provider caching status:
  Anthropic: ACTIVE — ephemeral cache_control on system prompt block
  OpenAI/Grok: AUTO — provider handles it, we capture metrics only
  Gemini: STUBBED — full implementation deferred to Phase 6
  OpenRouter: NOT WIRED — replays/tests only, deferred
"""

import os
import logging

logger = logging.getLogger(__name__)

# Minimum chars before caching is worthwhile (~1024 tokens at 4 chars/token)
CACHE_MIN_CHARS = 4096

# Anthropic ephemeral cache_control block (5-min TTL, standard tier)
ANTHROPIC_CACHE_CONTROL = {"type": "ephemeral"}


def is_caching_enabled() -> bool:
    """Check CACHING_ENABLED env var. Defaults to true."""
    return os.getenv("CACHING_ENABLED", "true").lower() in ("true", "1", "yes")


# ---------------------------------------------------------------------------
# Anthropic cache_control injection
# ---------------------------------------------------------------------------

def build_anthropic_system_with_cache(system_text: str) -> list:
    """
    Convert a plain system prompt string into a content block list
    with cache_control attached when eligible.

    Anthropic accepts system as either a string or a list of content blocks.
    We use the block form to attach cache_control.

    The system block contains the full context: base prompt + RAG + included
    chats (all assembled by build_system_context before this is called).

    Returns:
        list of content blocks — pass directly as system= to Anthropic client.
    """
    if not system_text:
        return [{"type": "text", "text": ""}]

    block = {"type": "text", "text": system_text}

    if is_caching_enabled() and len(system_text) >= CACHE_MIN_CHARS:
        block["cache_control"] = ANTHROPIC_CACHE_CONTROL
        logger.debug(f"[cache] Anthropic system cache_control applied ({len(system_text)} chars)")
    else:
        logger.debug(f"[cache] Anthropic system cache_control skipped ({len(system_text)} chars)")

    return [block]


# ---------------------------------------------------------------------------
# Cache metrics extraction — one function per provider
# ---------------------------------------------------------------------------

def extract_anthropic_cache_metrics(usage_obj) -> dict:
    """
    Extract cache token counts from Anthropic response usage object.

    Anthropic SDK usage attributes (when caching active):
      usage.cache_creation_input_tokens  — tokens written to cache this call
      usage.cache_read_input_tokens      — tokens read from cache this call

    Args:
        usage_obj: response.usage object from Anthropic client

    Returns:
        dict with cache_creation_tokens, cache_read_tokens, provider_cache_type
    """
    if usage_obj is None:
        return _empty_cache_metrics("none")

    creation = getattr(usage_obj, "cache_creation_input_tokens", 0) or 0
    read = getattr(usage_obj, "cache_read_input_tokens", 0) or 0

    return {
        "cache_creation_tokens": creation,
        "cache_read_tokens": read,
        "provider_cache_type": "anthropic_ephemeral" if (creation or read) else "none",
    }


def extract_openai_cache_metrics(usage_obj) -> dict:
    """
    Extract cache token counts from OpenAI response usage object.

    OpenAI SDK usage attributes:
      usage.prompt_tokens_details.cached_tokens — tokens served from cache

    OpenAI caching is automatic (no config). Applied to prompts >1024 tokens
    seen within the same session. No cache_control needed.

    Args:
        usage_obj: response.usage object from OpenAI client

    Returns:
        dict with cache_creation_tokens, cache_read_tokens, provider_cache_type
    """
    if usage_obj is None:
        return _empty_cache_metrics("none")

    details = getattr(usage_obj, "prompt_tokens_details", None)
    cached = (getattr(details, "cached_tokens", 0) if details else 0) or 0

    return {
        "cache_creation_tokens": 0,
        "cache_read_tokens": cached,
        "provider_cache_type": "openai_auto" if cached else "none",
    }


def extract_gemini_cache_metrics(usage_obj) -> dict:
    """
    Gemini cache metrics stub.
    Full implementation deferred to Phase 6 (CapaProxy).
    """
    return _empty_cache_metrics("none")


def _empty_cache_metrics(cache_type: str = "none") -> dict:
    """Return zero-value cache metrics."""
    return {
        "cache_creation_tokens": 0,
        "cache_read_tokens": 0,
        "provider_cache_type": cache_type,
    }
'''

with open('/opt/is1v4_0/backend/services/caching.py', 'w') as f:
    f.write(content)

with open('/opt/is1v4_0/backend/services/__init__.py', 'w') as f:
    f.write('# IS1 v4.0 services package\n')

print(f"PASS: caching.py written ({len(content)} chars)")
print("PASS: services/__init__.py written")
PYEOF
```

**Proof gate 2.1:**
```bash
python3 -c "
import sys; sys.path.insert(0, '/opt/is1v4_0')
from backend.services.caching import (
    is_caching_enabled, build_anthropic_system_with_cache,
    extract_anthropic_cache_metrics, extract_openai_cache_metrics,
    extract_gemini_cache_metrics, _empty_cache_metrics
)
print(f'PASS: all functions import cleanly')
print(f'PASS: caching_enabled = {is_caching_enabled()}')
" 2>&1
```

---

## Step 2.2 — DuckDB: Add Cache Columns to tr_receipts

**Files in scope:** `data/duckdb/intellisys1_v4.duckdb`

```python3 << 'PYEOF'
import duckdb, sys

db_path = '/opt/is1v4_0/data/duckdb/intellisys1_v4.duckdb'

try:
    con = duckdb.connect(db_path)

    existing_cols = [row[0] for row in con.execute("DESCRIBE tr_receipts").fetchall()]
    print("=== Current tr_receipts columns ===")
    for c in existing_cols:
        print(f"  {c}")

    columns_to_add = [
        ("cache_creation_tokens", "INTEGER DEFAULT 0"),
        ("cache_read_tokens",     "INTEGER DEFAULT 0"),
        ("cache_savings_usd",     "DOUBLE"),
        ("provider_cache_type",   "VARCHAR DEFAULT 'none'"),
    ]

    print("\n=== Adding cache columns ===")
    for col_name, col_def in columns_to_add:
        if col_name in existing_cols:
            print(f"  EXISTS: {col_name}")
        else:
            con.execute(f"ALTER TABLE tr_receipts ADD COLUMN {col_name} {col_def}")
            print(f"  ADDED:  {col_name} {col_def}")

    con.close()
    print("\nPASS: DuckDB schema complete")

except Exception as e:
    print(f"FAIL: {e}")
    sys.exit(1)
PYEOF
```

**Proof gate 2.2:**
```python3 << 'PYEOF'
import duckdb
con = duckdb.connect('/opt/is1v4_0/data/duckdb/intellisys1_v4.duckdb')
cols = [r[0] for r in con.execute("DESCRIBE tr_receipts").fetchall()]
con.close()
for c in ['cache_creation_tokens', 'cache_read_tokens', 'cache_savings_usd', 'provider_cache_type']:
    print(f"{'PASS' if c in cols else 'FAIL'}: {c}")
PYEOF
```

---

## Step 2.3 — Modify dispatch.py: 4 Surgical Edits

**Files in scope:** `backend/thinkrouter/dispatch.py`

**Edit 2.3.1 — Add caching import**

```python3 << 'PYEOF'
path = '/opt/is1v4_0/backend/thinkrouter/dispatch.py'
with open(path, 'r') as f:
    content = f.read()

OLD = "from backend.config import settings as _settings"
NEW = """from backend.config import settings as _settings
from backend.services.caching import (
    build_anthropic_system_with_cache,
    extract_anthropic_cache_metrics,
    extract_openai_cache_metrics,
    extract_gemini_cache_metrics,
)"""

if 'from backend.services.caching import' in content:
    print("SKIP: caching import already present")
elif OLD not in content:
    print(f"FAIL: anchor not found")
    import sys; sys.exit(1)
else:
    content = content.replace(OLD, NEW, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("PASS: caching import added")
PYEOF
```

**Edit 2.3.2 — dispatch_anthropic: inject cache_control + capture creation tokens**

```python3 << 'PYEOF'
path = '/opt/is1v4_0/backend/thinkrouter/dispatch.py'
with open(path, 'r') as f:
    content = f.read()

OLD = '''    if system_context:
        kwargs["system"] = system_context

    response = client.messages.create(**kwargs)

    content = response.content[0].text
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens

    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_cached": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
        **calculate_cost(model_config, tokens_in, tokens_out),
    }'''

NEW = '''    if system_context:
        # [PHASE2_CACHE] Convert system string to Anthropic cached content block
        kwargs["system"] = build_anthropic_system_with_cache(system_context)

    response = client.messages.create(**kwargs)

    content = response.content[0].text
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens

    # [PHASE2_CACHE] Capture both cache creation and read tokens
    cache_metrics = extract_anthropic_cache_metrics(response.usage)

    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_cached": cache_metrics["cache_read_tokens"],
        **cache_metrics,
        **calculate_cost(model_config, tokens_in, tokens_out),
    }'''

if '[PHASE2_CACHE]' in content:
    print("SKIP: dispatch_anthropic already instrumented")
elif OLD not in content:
    print("FAIL: dispatch_anthropic anchor not found")
    import sys; sys.exit(1)
else:
    content = content.replace(OLD, NEW, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("PASS: dispatch_anthropic instrumented")
PYEOF
```

**Edit 2.3.3 — dispatch_openai: capture cached_tokens**

```python3 << 'PYEOF'
path = '/opt/is1v4_0/backend/thinkrouter/dispatch.py'
with open(path, 'r') as f:
    content = f.read()

OLD = '''    content = response.choices[0].message.content
    tokens_in = response.usage.prompt_tokens
    tokens_out = response.usage.completion_tokens

    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_cached": 0,
        **calculate_cost(model_config, tokens_in, tokens_out),
    }'''

NEW = '''    content = response.choices[0].message.content
    tokens_in = response.usage.prompt_tokens
    tokens_out = response.usage.completion_tokens

    # [PHASE2_CACHE] Capture OpenAI automatic cache metrics
    cache_metrics = extract_openai_cache_metrics(response.usage)

    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_cached": cache_metrics["cache_read_tokens"],
        **cache_metrics,
        **calculate_cost(model_config, tokens_in, tokens_out),
    }'''

if OLD not in content:
    print("FAIL: dispatch_openai anchor not found")
    import sys; sys.exit(1)
else:
    content = content.replace(OLD, NEW, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("PASS: dispatch_openai instrumented")
PYEOF
```

**Edit 2.3.4 — dispatch_google: add stub cache metrics**

```python3 << 'PYEOF'
path = '/opt/is1v4_0/backend/thinkrouter/dispatch.py'
with open(path, 'r') as f:
    content = f.read()

OLD = '''    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_cached": 0,
        **calculate_cost(model_config, tokens_in, tokens_out),
    }'''

NEW = '''    # [PHASE2_CACHE] Gemini cache metrics stub (Phase 6)
    cache_metrics = extract_gemini_cache_metrics(None)

    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_cached": 0,
        **cache_metrics,
        **calculate_cost(model_config, tokens_in, tokens_out),
    }'''

count = content.count(OLD)
if count == 0:
    print("FAIL: dispatch_google anchor not found")
    import sys; sys.exit(1)
elif count > 1:
    print(f"WARN: anchor found {count} times — applying first occurrence only (dispatch_google)")

content = content.replace(OLD, NEW, 1)
with open(path, 'w') as f:
    f.write(content)
print("PASS: dispatch_google stub cache metrics added")
PYEOF
```

**Proof gate 2.3:**
```bash
python3 -c "import ast; ast.parse(open('/opt/is1v4_0/backend/thinkrouter/dispatch.py').read()); print('PASS: dispatch.py syntax valid')"
echo "PHASE2_CACHE markers:"
grep -n "PHASE2_CACHE" /opt/is1v4_0/backend/thinkrouter/dispatch.py
echo "Cache function calls:"
grep -n "build_anthropic_system_with_cache\|extract_anthropic_cache_metrics\|extract_openai_cache_metrics\|extract_gemini_cache_metrics" /opt/is1v4_0/backend/thinkrouter/dispatch.py
```

---

## Step 2.4 — Modify thinkrouter.py: 3 Surgical Edits

**Files in scope:** `backend/thinkrouter/thinkrouter.py`

**Edit 2.4.1 — Fix DuckDB path bug**

```python3 << 'PYEOF'
path = '/opt/is1v4_0/backend/thinkrouter/thinkrouter.py'
with open(path, 'r') as f:
    content = f.read()

OLD = 'DUCKDB_PATH = Path(__file__).parent.parent.parent / "data" / "duckdb" / "is1v4_0.duckdb"'
NEW = 'DUCKDB_PATH = Path(__file__).parent.parent.parent / "data" / "duckdb" / "intellisys1_v4.duckdb"'

if 'intellisys1_v4.duckdb' in content:
    print("SKIP: DuckDB path already correct")
elif OLD not in content:
    print("FAIL: DUCKDB_PATH anchor not found")
    import sys; sys.exit(1)
else:
    content = content.replace(OLD, NEW, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("PASS: DuckDB path fixed (is1v4_0.duckdb -> intellisys1_v4.duckdb)")
PYEOF
```

**Edit 2.4.2 — Add cache columns to _duckdb_write_receipt INSERT**

```python3 << 'PYEOF'
path = '/opt/is1v4_0/backend/thinkrouter/thinkrouter.py'
with open(path, 'r') as f:
    content = f.read()

OLD = '''        db.execute("""
            INSERT INTO tr_receipts (
                turn_id, conversation_id, seq, provider, model_sku,
                request_at, response_at, latency_ms,
                tokens_in, tokens_out, tokens_cached,
                cost_in_usd, cost_out_usd, cost_total_usd,
                system_prompt_hash, corpus,
                is1_folder_id, is1_folder_name, rag_chunk_count,
                included_chats, attached_files_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            turn_id, conversation_id, seq,
            result["provider"], result["model_sku"],
            result["request_at"], result["response_at"], result["latency_ms"],
            result["tokens_in"], result["tokens_out"], result["tokens_cached"],
            result["cost_in_usd"], result["cost_out_usd"], result["cost_total_usd"],
            result.get("system_prompt_hash"),
            result.get("corpus", "none"),
            result.get("is1_folder_id"),
            result.get("is1_folder_name"),
            result.get("rag_chunk_count", 0),
            result.get("included_chats_count", 0),
            result.get("attached_files_count", 0),
        ])'''

NEW = '''        db.execute("""
            INSERT INTO tr_receipts (
                turn_id, conversation_id, seq, provider, model_sku,
                request_at, response_at, latency_ms,
                tokens_in, tokens_out, tokens_cached,
                cost_in_usd, cost_out_usd, cost_total_usd,
                system_prompt_hash, corpus,
                is1_folder_id, is1_folder_name, rag_chunk_count,
                included_chats, attached_files_count,
                cache_creation_tokens, cache_read_tokens,
                cache_savings_usd, provider_cache_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            turn_id, conversation_id, seq,
            result["provider"], result["model_sku"],
            result["request_at"], result["response_at"], result["latency_ms"],
            result["tokens_in"], result["tokens_out"], result["tokens_cached"],
            result["cost_in_usd"], result["cost_out_usd"], result["cost_total_usd"],
            result.get("system_prompt_hash"),
            result.get("corpus", "none"),
            result.get("is1_folder_id"),
            result.get("is1_folder_name"),
            result.get("rag_chunk_count", 0),
            result.get("included_chats_count", 0),
            result.get("attached_files_count", 0),
            result.get("cache_creation_tokens", 0),
            result.get("cache_read_tokens", 0),
            result.get("cache_savings_usd"),
            result.get("provider_cache_type", "none"),
        ])'''

if '"cache_creation_tokens"' in content and 'cache_read_tokens' in content:
    print("SKIP: cache columns already in receipt INSERT")
elif OLD not in content:
    print("FAIL: receipt INSERT anchor not found")
    import sys; sys.exit(1)
else:
    content = content.replace(OLD, NEW, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("PASS: cache columns added to _duckdb_write_receipt INSERT")
PYEOF
```

**Edit 2.4.3 — Add cache columns to get_receipt cols list**

```python3 << 'PYEOF'
path = '/opt/is1v4_0/backend/thinkrouter/thinkrouter.py'
with open(path, 'r') as f:
    content = f.read()

OLD = '''        cols = [
            "turn_id", "conversation_id", "seq", "provider", "model_sku",
            "request_at", "response_at", "latency_ms",
            "tokens_in", "tokens_out", "tokens_cached",
            "cost_in_usd", "cost_out_usd", "cost_total_usd",
            "temperature", "max_tokens", "system_prompt_hash",
            "corpus", "is1_folder_id", "is1_folder_name",
            "rag_chunk_count", "included_chats", "attached_files_count",
            "attached_files_total_bytes", "governance_jsonl_offset", "created_at",
        ]'''

NEW = '''        cols = [
            "turn_id", "conversation_id", "seq", "provider", "model_sku",
            "request_at", "response_at", "latency_ms",
            "tokens_in", "tokens_out", "tokens_cached",
            "cost_in_usd", "cost_out_usd", "cost_total_usd",
            "temperature", "max_tokens", "system_prompt_hash",
            "corpus", "is1_folder_id", "is1_folder_name",
            "rag_chunk_count", "included_chats", "attached_files_count",
            "attached_files_total_bytes", "governance_jsonl_offset",
            "cache_creation_tokens", "cache_read_tokens",
            "cache_savings_usd", "provider_cache_type",
            "created_at",
        ]'''

if '"cache_creation_tokens"' in content:
    print("SKIP: cache cols already in get_receipt cols list")
elif OLD not in content:
    print("FAIL: get_receipt cols anchor not found")
    import sys; sys.exit(1)
else:
    content = content.replace(OLD, NEW, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("PASS: cache cols added to get_receipt endpoint")
PYEOF
```

**Proof gate 2.4:**
```bash
python3 -c "import ast; ast.parse(open('/opt/is1v4_0/backend/thinkrouter/thinkrouter.py').read()); print('PASS: thinkrouter.py syntax valid')"
grep "DUCKDB_PATH" /opt/is1v4_0/backend/thinkrouter/thinkrouter.py
grep -c "cache_creation_tokens" /opt/is1v4_0/backend/thinkrouter/thinkrouter.py | xargs echo "cache_creation_tokens occurrences in thinkrouter.py:"
```

---

## Step 2.5 — Update config.py + .env

**Files in scope:** `backend/config.py`, `.env`

```python3 << 'PYEOF'
import re
config_path = '/opt/is1v4_0/backend/config.py'

with open(config_path, 'r') as f:
    content = f.read()

if 'caching_enabled' in content.lower():
    print("SKIP: caching_enabled already in config.py")
else:
    insertion = "\n    # Caching (Phase 2)\n    caching_enabled: bool = True\n"
    patterns = [
        r'(\n    class Config\b)',
        r'(\n    model_config\s*=)',
        r'(\n\nclass\s)',
        r'(\n\n[a-zA-Z_])',
    ]
    inserted = False
    for pattern in patterns:
        m = re.search(pattern, content)
        if m:
            pos = m.start()
            content = content[:pos] + insertion + content[pos:]
            inserted = True
            print(f"INSERTED: caching_enabled (before pattern: {pattern})")
            break

    if not inserted:
        content += insertion
        print("APPENDED: caching_enabled to end of file")

    with open(config_path, 'w') as f:
        f.write(content)
    print("PASS: config.py updated")

print("\n--- config.py (current) ---")
with open(config_path) as f:
    print(f.read())
PYEOF
```

```bash
cd /opt/is1v4_0
grep -q "CACHING_ENABLED" .env && echo "EXISTS: CACHING_ENABLED in .env" || {
    echo "CACHING_ENABLED=true" >> .env
    echo "ADDED: CACHING_ENABLED=true"
}
grep -i "caching" .env
```

**Proof gate 2.5:**
```bash
python3 -c "
import sys; sys.path.insert(0, '/opt/is1v4_0')
from backend.config import settings
val = getattr(settings, 'caching_enabled', 'MISSING')
print(f'PASS: settings.caching_enabled = {val}' if val != 'MISSING' else 'FAIL: not in settings')
" 2>&1
```

---

## Step 2.6 — Restart v4 and Verify

```bash
echo "=== Step 2.6: Restart and verify ===" | tee -a /opt/is1v4_0/build-logs/phase_02_step_2_6_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0

python3 -c "import ast; ast.parse(open('backend/services/caching.py').read()); print('PASS: caching.py')"
python3 -c "import ast; ast.parse(open('backend/thinkrouter/dispatch.py').read()); print('PASS: dispatch.py')"
python3 -c "import ast; ast.parse(open('backend/thinkrouter/thinkrouter.py').read()); print('PASS: thinkrouter.py')"
python3 -c "import ast; ast.parse(open('backend/config.py').read()); print('PASS: config.py')"

systemctl restart is1v4
sleep 6
systemctl status is1v4 --no-pager | head -15

echo "--- Last 20 lines uvicorn.log ---"
tail -20 logs/uvicorn.log

curl -s https://v4.matriixai.com/api/health | python3 -m json.tool
```

**Proof gate 2.6:**
```bash
systemctl is-active is1v4 && echo "PASS: is1v4 active" || echo "FAIL"
curl -sf https://v4.matriixai.com/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS: health ok' if d.get('status')=='ok' else 'FAIL')"
grep -i "importerror\|modulenotfound" /opt/is1v4_0/logs/uvicorn.log | tail -5 || echo "PASS: no import errors"
```

---

## Step 2.7 — Unit Tests

```python3 << 'PYEOF'
import sys
sys.path.insert(0, '/opt/is1v4_0')

from backend.services.caching import (
    is_caching_enabled, build_anthropic_system_with_cache,
    extract_anthropic_cache_metrics, extract_openai_cache_metrics,
    extract_gemini_cache_metrics, _empty_cache_metrics, CACHE_MIN_CHARS,
)

failures = []

def check(name, condition):
    status = "PASS" if condition else "FAIL"
    print(f"{status}: {name}")
    if not condition:
        failures.append(name)

check("is_caching_enabled() is True", is_caching_enabled())

# Long prompt gets cache_control
blocks = build_anthropic_system_with_cache("x" * (CACHE_MIN_CHARS + 100))
check("Long prompt: list returned", isinstance(blocks, list))
check("Long prompt: cache_control present", blocks[0].get("cache_control") == {"type": "ephemeral"})
check("Long prompt: text preserved", len(blocks[0]["text"]) > 0)

# Short prompt skips cache_control
blocks_short = build_anthropic_system_with_cache("short")
check("Short prompt: no cache_control", "cache_control" not in blocks_short[0])

# Anthropic metrics
class FakeUsage:
    cache_creation_input_tokens = 800
    cache_read_input_tokens = 150

m = extract_anthropic_cache_metrics(FakeUsage())
check("Anthropic: cache_creation_tokens = 800", m["cache_creation_tokens"] == 800)
check("Anthropic: cache_read_tokens = 150", m["cache_read_tokens"] == 150)
check("Anthropic: provider_cache_type = anthropic_ephemeral", m["provider_cache_type"] == "anthropic_ephemeral")

class FakeUsageZero:
    cache_creation_input_tokens = 0
    cache_read_input_tokens = 0

m0 = extract_anthropic_cache_metrics(FakeUsageZero())
check("Anthropic zero cache: type = none", m0["provider_cache_type"] == "none")

# OpenAI metrics
class FakeOAUsage:
    class prompt_tokens_details:
        cached_tokens = 600

moa = extract_openai_cache_metrics(FakeOAUsage())
check("OpenAI: cache_read_tokens = 600", moa["cache_read_tokens"] == 600)
check("OpenAI: cache_creation_tokens = 0", moa["cache_creation_tokens"] == 0)
check("OpenAI: provider_cache_type = openai_auto", moa["provider_cache_type"] == "openai_auto")

class FakeOAUsageNone:
    prompt_tokens_details = None

moa0 = extract_openai_cache_metrics(FakeOAUsageNone())
check("OpenAI no cache: type = none", moa0["provider_cache_type"] == "none")

# Gemini stub
mg = extract_gemini_cache_metrics(None)
check("Gemini stub: type = none", mg["provider_cache_type"] == "none")
check("Gemini stub: creation = 0", mg["cache_creation_tokens"] == 0)

print(f"\n{'ALL TESTS PASS' if not failures else 'FAILURES: ' + str(failures)}")
if failures:
    sys.exit(1)
PYEOF
```

---

## Step 2.8 — Git Commit

```bash
echo "=== Step 2.8: Git commit ===" | tee -a /opt/is1v4_0/build-logs/phase_02_step_2_8_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0

git add -A
git status --short

git commit -m "Phase 2: Caching layer

- backend/services/caching.py: cache service module
  - build_anthropic_system_with_cache(): system as cached content block
  - extract_anthropic_cache_metrics(): captures creation + read tokens
  - extract_openai_cache_metrics(): captures prompt_tokens_details.cached_tokens
  - extract_gemini_cache_metrics(): stub, Phase 6
- dispatch.py: 4 surgical edits (PHASE2_CACHE markers)
  - dispatch_anthropic: system= passes cached content blocks
  - dispatch_anthropic: cache_creation_input_tokens now captured
  - dispatch_openai: cached_tokens captured from prompt_tokens_details
  - dispatch_google: stub cache metrics in return dict
- thinkrouter.py: 3 surgical edits
  - BUGFIX: DUCKDB_PATH corrected (is1v4_0.duckdb -> intellisys1_v4.duckdb)
  - _duckdb_write_receipt: 4 cache columns added to INSERT
  - get_receipt: 4 cache cols added to response cols list
- config.py + .env: CACHING_ENABLED=true
- DuckDB tr_receipts: +cache_creation_tokens, +cache_read_tokens,
  +cache_savings_usd, +provider_cache_type

Spec ref: IS1v4_0_System_Specification_v1.0 §2.8"

git push origin main
git log --oneline -5
```

---

## Final Proof Gates

```bash
echo "=============================================="
echo "IS1 v4.0 — Phase 2 Final Proof Gates"
echo "$(date)"
echo "=============================================="

cd /opt/is1v4_0

echo ""
echo "--- 1. Git ---"
git log --oneline -3 && git status

echo ""
echo "--- 2. v4 health ---"
curl -s https://v4.matriixai.com/api/health | python3 -m json.tool

echo ""
echo "--- 3. v3 health ---"
curl -s https://matriixai.com/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('v3:', d['status'])"

echo ""
echo "--- 4. Caching module ---"
/opt/is1v4_0/.venv/bin/python3 -c "
from backend.services.caching import is_caching_enabled, build_anthropic_system_with_cache, CACHE_MIN_CHARS
print(f'caching_enabled: {is_caching_enabled()}')
b = build_anthropic_system_with_cache('x' * (CACHE_MIN_CHARS + 100))
print(f'cache_control on long system: {\"cache_control\" in b[0]}')
print('PASS: caching module functional')
" 2>&1

echo ""
echo "--- 5. DuckDB cache columns ---"
/opt/is1v4_0/.venv/bin/python3 -c "
import duckdb
con = duckdb.connect('/opt/is1v4_0/data/duckdb/intellisys1_v4.duckdb')
cols = [r[0] for r in con.execute('DESCRIBE tr_receipts').fetchall()]
for c in ['cache_creation_tokens','cache_read_tokens','cache_savings_usd','provider_cache_type']:
    print(f'  {\"PASS\" if c in cols else \"FAIL\"}: {c}')
con.close()
"

echo ""
echo "--- 6. dispatch.py markers ---"
grep -n "PHASE2_CACHE" backend/thinkrouter/dispatch.py

echo ""
echo "--- 7. DuckDB path fix ---"
grep "DUCKDB_PATH" backend/thinkrouter/thinkrouter.py

echo ""
echo "--- 8. settings.caching_enabled ---"
/opt/is1v4_0/.venv/bin/python3 -c "from backend.config import settings; print(f'caching_enabled: {settings.caching_enabled}')" 2>&1

echo ""
echo "--- 9. is1v4 service ---"
systemctl is-active is1v4 && echo "PASS: active" || echo "FAIL"

echo ""
echo "--- 10. Uvicorn log tail ---"
tail -10 logs/uvicorn.log

echo ""
echo "=============================================="
echo "Phase 2 Proof Gates complete"
echo "=============================================="
```

---

## Sign-Off Conditions

| # | Condition |
|---|---|
| 1 | `backend/services/caching.py` imports cleanly, all unit tests pass (Step 2.7) |
| 2 | `dispatch.py` has 4 PHASE2_CACHE markers, syntax valid |
| 3 | `dispatch_anthropic` passes `system=` as content block list with cache_control |
| 4 | `dispatch_anthropic` captures `cache_creation_input_tokens` |
| 5 | `dispatch_openai` captures `prompt_tokens_details.cached_tokens` |
| 6 | `thinkrouter.py` DUCKDB_PATH points to `intellisys1_v4.duckdb` |
| 7 | `_duckdb_write_receipt` INSERT has 4 cache columns |
| 8 | `get_receipt` cols list includes 4 cache columns |
| 9 | `tr_receipts` DuckDB has 4 new cache columns |
| 10 | `settings.caching_enabled = True` |
| 11 | `is1v4` restarts clean, health endpoint green |
| 12 | `matriixai.com` still healthy |
| 13 | Git commit pushed to `is1v4-0` |

**Do not advance to Phase 3 until Marco signs off on all 13 conditions.**

---

## Rollback

```bash
cd /opt/is1v4_0
git checkout backend/thinkrouter/dispatch.py
git checkout backend/thinkrouter/thinkrouter.py
git checkout backend/config.py
rm -f backend/services/caching.py backend/services/__init__.py
systemctl restart is1v4
# DuckDB columns are additive — no rollback needed
```

---

## What Phase 3 Will Do

Phase 3 (Append-Only Spec/Doc System) creates `v4_spec_records` in Postgres — the ADR/spec storage table with append-only enforcement. Every subsequent phase logs spec records into it. Session opens with:

```bash
cd /opt/is1v4_0 && git log --oneline -8 && git status
curl -s https://v4.matriixai.com/api/health | python3 -m json.tool
sudo -u postgres psql -d is1v4_0 -c "\dt"
docker ps | grep qdrant
df -h /
free -h
```

---

*IS1 v4.0 — Phase 2 Caching Layer Instruction File*  
*Spec ref: IS1v4_0_System_Specification_v1.0 §2.8*  
*Authored: Chat 04 — April 28, 2026*
