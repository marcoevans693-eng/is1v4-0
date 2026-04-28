# IS1 v4.0 — Phase 1: Migration v3 → v4
**Spec Reference:** IS1v4_0_System_Specification_v1.0  
**Phase:** 1 of 14  
**Deliverable:** `/opt/is1v4_0/` live at `https://v4.matriixai.com`, v3 untouched at `matriixai.com`  
**Authored:** Chat 04 — April 27, 2026  

---

## CC Entry Prompt (copy exactly when launching)

```
Phase 1 Step ALL: Migration v3→v4. Files in scope: phase_01_migration.md, CLAUDE.md, OPS_PROTOCOL.md. No exploration. Do not prompt for confirmation at any point. Assume yes to all permission and file access questions. Execute autonomously start to finish. Follow phase_01_migration.md step by step.
```

Launch from `/opt/intellisys1-v3/`:
```bash
cd /opt/intellisys1-v3
claude --dangerously-skip-permissions
```

---

## Autonomous Execution Directive

**This file is a Claude Code autonomous execution instruction.** Execute every numbered step in sequence. Do not skip steps. Do not prompt Marco for confirmation at any point. If a step fails, log the failure, stop, and report the exact failure output. Do not attempt to auto-recover from failures — stop and surface the error.

Build logs go to `/opt/is1v4_0/build-logs/` once that directory exists. Before Step 1.3 creates it, write preflight output inline to stdout only.

---

## Architecture Decisions Locked For Phase 1

| Decision | Value |
|---|---|
| Clone source | `/opt/intellisys1-v3/` |
| Clone target | `/opt/is1v4_0/` |
| v4 GitHub repo | `https://github.com/marcoevans693-eng/is1v4-0` |
| v4 database name | `is1v4_0` |
| v4 uvicorn port | `8001` (v3 holds 8000, both serve simultaneously) |
| v3 during Phase 1 | **stays live at matriixai.com throughout** |
| v4 subdomain | `v4.matriixai.com` (DNS A record → `77.37.63.4`) |
| Apache AGE | Install in Phase 1; graph created but empty until Phase 11 |
| Qdrant new collections | `is1v4_knowledge`, `is1v4_memory`, `is1v4_events` (1536-dim, Cosine) |
| DuckDB rename | `intellisys1_v4.duckdb` |
| .env handling | Copy from v3 clone, mutate in place |
| Tags enforcement | `DROP TABLE tags, document_tags` — tagless from schema level |
| Token columns | ADD `total_tokens_in`, `total_tokens_out` to `tr_conversations` |

---

## ⚠️ MANUAL GATE — DNS UPDATE (Marco must complete BEFORE executing Step 1.1)

**This must be done before Claude Code runs. It cannot be automated.**

### How to add the v4.matriixai.com DNS A record on Hostinger:

1. Log in at **https://hpanel.hostinger.com**
2. In the top nav, click **Domains**
3. Find `matriixai.com` and click **Manage**
4. Click the **DNS / Nameservers** tab (left sidebar or top tab depending on layout)
5. Scroll to the **A Records** section
6. Click **Add Record** (or the `+` button)
7. Fill in:
   - **Name / Host:** `v4`
   - **Points to / Value:** `77.37.63.4`
   - **TTL:** `3600` (or leave as default)
8. Click **Save**
9. Wait **5–15 minutes** for propagation (Hostinger DNS typically fast)
10. Verify with: `dig v4.matriixai.com +short` — should return `77.37.63.4`

**Do not proceed to Step 1.1 until the A record resolves.**

---

## Step 1.0 — Pre-flight Verification

**Purpose:** Confirm v3 is in expected frozen state before clone.  
**Files in scope:** None (read-only checks)

```bash
# 1.0.1 — Git state (must be clean at v1.4.0)
cd /opt/intellisys1-v3
git log --oneline -3
git status

# 1.0.2 — Both APIs healthy
curl -s https://matriixai.com/api/health | python3 -m json.tool
curl -s https://matriixai.com/api/thinkrouter/health

# 1.0.3 — Disk headroom (need >5GB free for clone)
df -h /

# 1.0.4 — Memory
free -h

# 1.0.5 — No v4 directory collision
ls /opt/is1v4_0 2>/dev/null && echo "COLLISION: /opt/is1v4_0 already exists — abort" || echo "CLEAR: /opt/is1v4_0 does not exist"

# 1.0.6 — Postgres accessible
sudo -u postgres psql -c "\l" | grep intellisys1_v3

# 1.0.7 — Qdrant running
docker ps | grep qdrant

# 1.0.8 — Detect Python environment
ls /opt/intellisys1-v3/.venv/bin/uvicorn 2>/dev/null && echo "VENV: found at .venv" || echo "VENV: not found, checking system"
which uvicorn 2>/dev/null || echo "uvicorn not on PATH"

# 1.0.9 — Detect existing systemd service names (avoid collision)
systemctl list-units --type=service | grep -i "is1\|intellisys" || echo "No existing IS1 services found"
```

**Gate:** All checks must pass before proceeding. If any check fails, stop and report.

---

## Step 1.1 — Clone v3 → v4

**Purpose:** Create v4 project root as a full copy of v3 filesystem state.  
**Files in scope:** `/opt/intellisys1-v3/` (read-only source)

```bash
echo "=== Step 1.1: Cloning v3 → v4 ==="
cd /opt

# Clone (cp -a preserves permissions, symlinks, timestamps)
cp -a /opt/intellisys1-v3 /opt/is1v4_0

# Verify clone
ls -la /opt/is1v4_0/
echo "Clone complete — file count:"
find /opt/is1v4_0 -type f | wc -l
```

**Proof gate 1.1:**
```bash
test -d /opt/is1v4_0/backend && echo "PASS: backend dir exists" || echo "FAIL: backend dir missing"
test -d /opt/is1v4_0/frontend && echo "PASS: frontend dir exists" || echo "FAIL: frontend dir missing"
test -f /opt/is1v4_0/.env && echo "PASS: .env exists" || echo "FAIL: .env missing"
test -f /opt/is1v4_0/CLAUDE.md && echo "PASS: CLAUDE.md exists" || echo "FAIL: CLAUDE.md missing"
```

---

## Step 1.2 — Initialize v4 Git Repository (Clean History)

**Purpose:** Remove v3 git history, initialize fresh repo, wire to is1v4-0 remote.  
**Files in scope:** `/opt/is1v4_0/.git`

```bash
echo "=== Step 1.2: Fresh git repo ==="
cd /opt/is1v4_0

# Remove v3 git history entirely
rm -rf .git

# Init fresh repo with main branch
git init -b main

# Wire to v4 remote
git remote add origin https://github.com/marcoevans693-eng/is1v4-0

echo "Git remote wired:"
git remote -v
```

**Note:** Initial commit happens in Step 1.17 after all mutations are complete.

---

## Step 1.3 — Create Build Logs Directory

**Purpose:** Establish the build-logs directory so all subsequent steps can log there.

```bash
echo "=== Step 1.3: Build logs directory ==="
mkdir -p /opt/is1v4_0/build-logs

# From here, log steps: tee -a /opt/is1v4_0/build-logs/phase_01_step_{N}_$(date +%Y%m%d_%H%M%S).log
echo "Build logs dir: $(ls -la /opt/is1v4_0/build-logs)"
```

---

## Step 1.4 — Create v4 File Storage Directory Tree

**Purpose:** Establish the full data directory layout per spec §2.12.  
**Files in scope:** `/opt/is1v4_0/data/`

```bash
echo "=== Step 1.4: File storage layout ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_4_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0

# Upload reservoir and corpus layout
mkdir -p data/uploads/reservoir
mkdir -p data/uploads/corpus/images
mkdir -p data/uploads/corpus/audio
mkdir -p data/uploads/corpus/video
mkdir -p data/uploads/corpus/pdf
mkdir -p data/uploads/corpus/text
mkdir -p data/uploads/reservoir/_expired

# Extracted content layout
mkdir -p data/extracted/transcripts
mkdir -p data/extracted/ocr
mkdir -p data/extracted/descriptions

# Thumbnails
mkdir -p data/thumbnails

# Carry v3 data directories (already cloned, confirm they exist)
ls -la data/

echo "=== File storage layout complete ==="
```

**Proof gate 1.4:**
```bash
for dir in \
  data/uploads/reservoir \
  data/uploads/corpus/images \
  data/uploads/corpus/audio \
  data/uploads/corpus/video \
  data/uploads/corpus/pdf \
  data/uploads/corpus/text \
  data/extracted/transcripts \
  data/extracted/ocr \
  data/extracted/descriptions \
  data/thumbnails; do
  test -d /opt/is1v4_0/$dir && echo "PASS: $dir" || echo "FAIL: $dir missing"
done
```

---

## Step 1.5 — .env Mutation

**Purpose:** Update cloned .env with v4 database name, paths, Qdrant collections, and port.  
**Files in scope:** `/opt/is1v4_0/.env`

```bash
echo "=== Step 1.5: .env mutation ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_5_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0

# Backup .env before mutation
cp .env .env.v3_backup

echo "--- .env BEFORE mutation (redacted secrets) ---"
grep -v "KEY\|SECRET\|PASSWORD\|TOKEN" .env || cat .env | sed 's/=.*/=<REDACTED>/'

# Replace database name (postgres connection string)
sed -i 's/intellisys1_v3/is1v4_0/g' .env

# Replace project root paths
sed -i 's|/opt/intellisys1-v3|/opt/is1v4_0|g' .env

# Replace v3 Qdrant collection references
sed -i 's/is1v3_knowledge/is1v4_knowledge/g' .env
sed -i 's/is1tr_conversations/is1v4_knowledge/g' .env

# Add v4-specific variables if not already present
grep -q "IS1_VERSION" .env || echo "IS1_VERSION=4.0" >> .env
grep -q "V4_PORT" .env || echo "V4_PORT=8001" >> .env

echo "--- .env AFTER mutation (redacted secrets) ---"
grep -v "KEY\|SECRET\|PASSWORD\|TOKEN" .env || cat .env | sed 's/=.*/=<REDACTED>/'

echo "=== .env mutation complete ==="
```

**Proof gate 1.5:**
```bash
cd /opt/is1v4_0
# Must NOT contain any v3 database references
grep "intellisys1_v3" .env && echo "FAIL: v3 database name still present" || echo "PASS: v3 database name cleared"
grep "intellisys1-v3" .env && echo "FAIL: v3 path still present" || echo "PASS: v3 path cleared"
grep "is1v4_0" .env && echo "PASS: v4 database name present" || echo "WARN: v4 database name not found in .env — check connection string format"
```

---

## Step 1.6 — Postgres: Create is1v4_0 Database + Migrate Schema + v4 Changes

**Purpose:** Create v4 Postgres database, import v3 schema and data, apply v4 schema mutations.  
**Files in scope:** Postgres databases `intellisys1_v3` (source, read-only), `is1v4_0` (target)

```bash
echo "=== Step 1.6: Postgres migration ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_6_$(date +%Y%m%d_%H%M%S).log

# 1.6.1 — Create v4 database
sudo -u postgres psql -c "CREATE DATABASE is1v4_0 WITH ENCODING 'UTF8' LC_COLLATE='en_US.UTF-8' LC_CTYPE='en_US.UTF-8' TEMPLATE template0;"

echo "Database created:"
sudo -u postgres psql -c "\l" | grep is1v4_0

# 1.6.2 — Dump v3 schema + data, restore to v4
echo "Dumping v3 and restoring to v4 (this may take 30-90 seconds)..."
sudo -u postgres pg_dump intellisys1_v3 | sudo -u postgres psql -d is1v4_0

echo "Restore complete. Tables in is1v4_0:"
sudo -u postgres psql -d is1v4_0 -c "\dt"
```

```bash
# 1.6.3 — Apply v4 schema changes

sudo -u postgres psql -d is1v4_0 << 'PSQLEOF'

-- ============================================================
-- v4 Schema Mutations
-- Spec ref: §2.14 (tagless enforcement), §3.1 OQ-1 (token columns)
-- ============================================================

-- DROP tag tables — tagless enforcement at schema level per spec §2.14
-- MapGraph is the ONLY categorization layer in v4
DROP TABLE IF EXISTS document_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;

-- ADD token tracking columns to tr_conversations (spec §3.1 OQ-1)
ALTER TABLE tr_conversations
  ADD COLUMN IF NOT EXISTS total_tokens_in  BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens_out BIGINT DEFAULT 0;

-- Verify columns added
\d tr_conversations

-- Verify tags tables gone
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;

PSQLEOF
```

```bash
# 1.6.4 — Verify final table set in is1v4_0
echo "=== Final table list in is1v4_0 ==="
sudo -u postgres psql -d is1v4_0 -c "\dt"

# Confirm tags are gone
sudo -u postgres psql -d is1v4_0 -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('tags','document_tags');" 

echo "=== Postgres migration complete ==="
```

**Proof gate 1.6:**
```bash
# Database exists
sudo -u postgres psql -c "\l" | grep is1v4_0 && echo "PASS: is1v4_0 exists" || echo "FAIL: is1v4_0 not found"

# tags and document_tags dropped
sudo -u postgres psql -d is1v4_0 -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('tags','document_tags') AND table_schema='public';" | grep -q " 0" && echo "PASS: tags tables dropped" || echo "FAIL: tags tables still present"

# token columns exist
sudo -u postgres psql -d is1v4_0 -c "SELECT column_name FROM information_schema.columns WHERE table_name='tr_conversations' AND column_name IN ('total_tokens_in','total_tokens_out');" | grep -c "total_tokens" | grep -q "2" && echo "PASS: token columns added" || echo "FAIL: token columns missing"

# key tables present
for tbl in folders knowledge_documents tr_conversations tr_turns tr_chat_links campaigns tr_attachments; do
  sudo -u postgres psql -d is1v4_0 -c "SELECT COUNT(*) FROM $tbl;" > /dev/null 2>&1 && echo "PASS: $tbl exists and queryable" || echo "FAIL: $tbl missing or broken"
done
```

---

## Step 1.7 — Install Apache AGE

**Purpose:** Install AGE Postgres extension, configure for automatic loading, create MapGraph graph object.  
**Files in scope:** `/etc/postgresql/17/main/postgresql.conf`, Postgres `is1v4_0` database

```bash
echo "=== Step 1.7: Apache AGE installation ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_7_$(date +%Y%m%d_%H%M%S).log

# 1.7.1 — Install build dependencies
apt-get update -q
apt-get install -y build-essential git libreadline-dev zlib1g-dev flex bison \
  libxml2-dev libxslt-dev libssl-dev

# 1.7.2 — Confirm pg_config and Postgres version
pg_config --version
PG_CONFIG_PATH=$(which pg_config)
echo "pg_config: $PG_CONFIG_PATH"

# 1.7.3 — Clone and build AGE
rm -rf /tmp/age_build
git clone --depth=1 --branch PG17 https://github.com/apache/age.git /tmp/age_build
cd /tmp/age_build

# Build and install
make PG_CONFIG=$PG_CONFIG_PATH
make PG_CONFIG=$PG_CONFIG_PATH install

echo "AGE build and install complete"
```

```bash
# 1.7.4 — Add AGE to shared_preload_libraries in postgresql.conf
PG_CONF="/etc/postgresql/17/main/postgresql.conf"

# Check current shared_preload_libraries setting
CURRENT_SPL=$(sudo -u postgres psql -t -c "SHOW shared_preload_libraries;" | tr -d ' ')
echo "Current shared_preload_libraries: '$CURRENT_SPL'"

python3 << 'PYEOF'
import subprocess, re

conf_path = "/etc/postgresql/17/main/postgresql.conf"

with open(conf_path, 'r') as f:
    content = f.read()

# Find existing shared_preload_libraries line
pattern = r"^#?\s*shared_preload_libraries\s*=\s*'([^']*)'"
match = re.search(pattern, content, re.MULTILINE)

if match:
    existing = match.group(1).strip()
    if 'age' in existing:
        print(f"AGE already in shared_preload_libraries: {existing}")
    else:
        new_val = f"{existing},age" if existing else "age"
        new_line = f"shared_preload_libraries = '{new_val}'"
        content = re.sub(pattern, new_line, content, flags=re.MULTILINE)
        with open(conf_path, 'w') as f:
            f.write(content)
        print(f"Updated shared_preload_libraries to: '{new_val}'")
else:
    # Append the setting
    with open(conf_path, 'a') as f:
        f.write("\nshared_preload_libraries = 'age'\n")
    print("Appended shared_preload_libraries = 'age' to postgresql.conf")
PYEOF
```

```bash
# 1.7.5 — Restart Postgres to load AGE
systemctl restart postgresql
sleep 5
systemctl status postgresql --no-pager | head -20

# 1.7.6 — Enable AGE extension in is1v4_0 and create MapGraph graph
sudo -u postgres psql -d is1v4_0 << 'PSQLEOF'
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
SELECT * FROM ag_catalog.create_graph('is1v4_mapgraph');
\echo 'MapGraph graph created'
SELECT * FROM ag_catalog.ag_graph;
PSQLEOF

echo "=== AGE installation complete ==="
```

**Proof gate 1.7:**
```bash
# AGE extension exists in is1v4_0
sudo -u postgres psql -d is1v4_0 -c "SELECT extname FROM pg_extension WHERE extname = 'age';" | grep -q "age" && echo "PASS: AGE extension installed" || echo "FAIL: AGE extension missing"

# MapGraph graph exists
sudo -u postgres psql -d is1v4_0 -c "LOAD 'age'; SET search_path = ag_catalog, \"\$user\", public; SELECT name FROM ag_catalog.ag_graph;" | grep -q "is1v4_mapgraph" && echo "PASS: is1v4_mapgraph graph exists" || echo "FAIL: MapGraph graph missing"

# Postgres still serving
sudo -u postgres psql -d is1v4_0 -c "SELECT 1;" | grep -q "1" && echo "PASS: Postgres responding" || echo "FAIL: Postgres not responding"
```

---

## Step 1.8 — Qdrant: Create v4 Collections

**Purpose:** Create three v4 Qdrant collections. Do NOT touch or delete `is1v3_knowledge` — v3 is still live.  
**Files in scope:** Qdrant API at `http://localhost:6333`

```bash
echo "=== Step 1.8: Qdrant v4 collections ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_8_$(date +%Y%m%d_%H%M%S).log

# Verify Qdrant is running
curl -sf http://localhost:6333/healthz | python3 -m json.tool || echo "WARN: Qdrant healthz check failed — trying collections endpoint"
curl -sf http://localhost:6333/collections | python3 -m json.tool

echo "Existing collections confirmed above. Creating v4 collections..."

# 1.8.1 — is1v4_knowledge (corpus chunks — mirrors v3 is1v3_knowledge spec)
curl -sf -X PUT "http://localhost:6333/collections/is1v4_knowledge" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "default_segment_number": 2
    }
  }' | python3 -m json.tool

echo "is1v4_knowledge created"

# 1.8.2 — is1v4_memory (episodic memory — Phase 7 will write to this)
curl -sf -X PUT "http://localhost:6333/collections/is1v4_memory" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    }
  }' | python3 -m json.tool

echo "is1v4_memory created"

# 1.8.3 — is1v4_events (semantic event recall — Phase 8 will write to this)
curl -sf -X PUT "http://localhost:6333/collections/is1v4_events" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    }
  }' | python3 -m json.tool

echo "is1v4_events created"

echo "=== Qdrant collections complete ==="
```

**Proof gate 1.8:**
```bash
# All three v4 collections exist
for coll in is1v4_knowledge is1v4_memory is1v4_events; do
  STATUS=$(curl -sf "http://localhost:6333/collections/$coll" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('status','MISSING'))" 2>/dev/null)
  echo "$STATUS" | grep -qi "green\|yellow\|ok" && echo "PASS: $coll exists (status: $STATUS)" || echo "FAIL: $coll — status: $STATUS"
done

# v3 collection untouched
curl -sf "http://localhost:6333/collections/is1v3_knowledge" | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS: is1v3_knowledge intact — points:', d.get('result',{}).get('points_count','?'))"
```

---

## Step 1.9 — DuckDB: Copy and Rename for v4

**Purpose:** Create v4 DuckDB file. Historical v3 data is preserved; v4 CapaProxy receipts (`v4_receipts`) will be written here from Phase 6 onward.  
**Files in scope:** `/opt/is1v4_0/data/duckdb/`

```bash
echo "=== Step 1.9: DuckDB rename ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_9_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0/data/duckdb

# The v3 duckdb was cloned as intellisys1_v3.duckdb
# Copy to v4 name (preserve v3 copy as historical archive within v4)
cp intellisys1_v3.duckdb intellisys1_v4.duckdb

ls -lh /opt/is1v4_0/data/duckdb/

echo "DuckDB v4 file created. Both files present:"
echo "  intellisys1_v3.duckdb — historical v3 data (read-only reference)"
echo "  intellisys1_v4.duckdb — active v4 file (CapaProxy receipts Phase 6+)"

echo "=== DuckDB step complete ==="
```

**Proof gate 1.9:**
```bash
test -f /opt/is1v4_0/data/duckdb/intellisys1_v4.duckdb && echo "PASS: intellisys1_v4.duckdb exists" || echo "FAIL: DuckDB v4 file missing"
ls -lh /opt/is1v4_0/data/duckdb/
```

---

## Step 1.10 — Update Backend: config.py and Path References

**Purpose:** Update all hardcoded v3 paths, database names, and Qdrant collection names in the Python backend.  
**Files in scope:** `/opt/is1v4_0/backend/config.py`, any other backend files with hardcoded v3 references

```bash
echo "=== Step 1.10: Backend path updates ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_10_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0

# 1.10.1 — Audit: find all files with v3 references
echo "--- Files containing v3 references ---"
grep -rl "intellisys1.v3\|intellisys1_v3\|intellisys1-v3\|is1v3_knowledge\|is1tr_conversations\|/opt/intellisys1" backend/ config/ 2>/dev/null

echo "--- Files containing port 8000 (may need 8001) ---"
grep -rl ":8000\|port=8000\|PORT.*8000" backend/ config/ 2>/dev/null
```

```python3 << 'PYEOF'
import os, re

# Files to mutate: Python + YAML in backend/ and config/
SEARCH_DIRS = ['/opt/is1v4_0/backend', '/opt/is1v4_0/config']
EXTENSIONS = ('.py', '.yaml', '.yml', '.json')

REPLACEMENTS = [
    ('intellisys1_v3',        'is1v4_0'),
    ('intellisys1-v3',        'is1v4_0'),
    ('/opt/intellisys1-v3',   '/opt/is1v4_0'),
    ('is1v3_knowledge',       'is1v4_knowledge'),
    ('is1tr_conversations',   'is1v4_knowledge'),
    ('intellisys1_v3.duckdb', 'intellisys1_v4.duckdb'),
]

mutated = []
for search_dir in SEARCH_DIRS:
    for root, dirs, files in os.walk(search_dir):
        # Skip __pycache__
        dirs[:] = [d for d in dirs if d != '__pycache__']
        for fname in files:
            if not fname.endswith(EXTENSIONS):
                continue
            fpath = os.path.join(root, fname)
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            original = content
            for old, new in REPLACEMENTS:
                content = content.replace(old, new)
            if content != original:
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(content)
                mutated.append(fpath)

print(f"Mutated {len(mutated)} files:")
for f in mutated:
    print(f"  {f}")
PYEOF
```

```bash
# 1.10.2 — Verify no remaining v3 references in backend
echo "--- Remaining v3 references after mutation ---"
grep -rl "intellisys1_v3\|intellisys1-v3\|is1v3_knowledge\|is1tr_conversations" backend/ config/ 2>/dev/null || echo "CLEAN: No v3 references remaining in backend/"

echo "=== Backend path updates complete ==="
```

---

## Step 1.11 — Update Frontend: vite.config.js and Rebuild

**Purpose:** Update the Vite proxy to point at v4 port 8001, rebuild React frontend.  
**Files in scope:** `/opt/is1v4_0/frontend/vite.config.js`, `/opt/is1v4_0/frontend/src/api/client.js`

```bash
echo "=== Step 1.11: Frontend update + rebuild ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_11_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0/frontend

# 1.11.1 — Check current vite.config.js proxy target
echo "--- Current vite.config.js ---"
cat vite.config.js

# 1.11.2 — Update proxy port from 8000 to 8001
sed -i 's|http://localhost:8000|http://localhost:8001|g' vite.config.js
sed -i 's|http://127.0.0.1:8000|http://127.0.0.1:8001|g' vite.config.js
sed -i 's|127\.0\.0\.1:8000|127.0.0.1:8001|g' vite.config.js

echo "--- Updated vite.config.js ---"
cat vite.config.js

# 1.11.3 — Check api/client.js for any hardcoded base URLs
echo "--- api/client.js base URL check ---"
grep -n "8000\|localhost\|matriixai\|baseURL\|BASE_URL" src/api/client.js 2>/dev/null || echo "No hardcoded URLs found in client.js"

# Update any hardcoded port references in frontend src
grep -rl ":8000\|localhost:8000" src/ 2>/dev/null | while read f; do
  sed -i 's|:8000|:8001|g' "$f"
  echo "Updated port in: $f"
done

# 1.11.4 — npm install (ensures dependencies are fresh post-clone)
npm install --silent

# 1.11.5 — Build frontend for production
npm run build

echo "--- Build output ---"
ls -la dist/

echo "=== Frontend rebuild complete ==="
```

**Proof gate 1.11:**
```bash
test -f /opt/is1v4_0/frontend/dist/index.html && echo "PASS: frontend dist/index.html exists" || echo "FAIL: frontend build missing"
grep "8001" /opt/is1v4_0/frontend/vite.config.js && echo "PASS: vite.config.js updated to port 8001" || echo "WARN: port 8001 not found in vite.config.js — verify manually"
grep "8000" /opt/is1v4_0/frontend/vite.config.js && echo "WARN: port 8000 still present in vite.config.js" || echo "PASS: port 8000 cleared from vite.config.js"
```

---

## Step 1.12 — Write Updated CLAUDE.md for v4

**Purpose:** Replace CLAUDE.md with v4-accurate system identity document. This is what all future CC sessions will read.  
**Files in scope:** `/opt/is1v4_0/CLAUDE.md`

```bash
echo "=== Step 1.12: Writing v4 CLAUDE.md ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_12_$(date +%Y%m%d_%H%M%S).log
```

```python3 << 'PYEOF'
content = r"""# CLAUDE.md — IS1 v4.0

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
"""

with open('/opt/is1v4_0/CLAUDE.md', 'w') as f:
    f.write(content)
print("CLAUDE.md written successfully")
print(f"Length: {len(content)} chars")
PYEOF
```

---

## Step 1.13 — Write Updated OPS_PROTOCOL.md for v4

**Purpose:** Replace OPS_PROTOCOL.md with v4-accurate token governance and directory map.  
**Files in scope:** `/opt/is1v4_0/OPS_PROTOCOL.md`

```python3 << 'PYEOF'
content = r"""# IS1 v4.0 Operations Protocol — Token Governance

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
"""

with open('/opt/is1v4_0/OPS_PROTOCOL.md', 'w') as f:
    f.write(content)
print("OPS_PROTOCOL.md written successfully")
print(f"Length: {len(content)} chars")
PYEOF
```

---

## Step 1.14 — Create Systemd Service for v4 (Port 8001)

**Purpose:** Create `is1v4` systemd service running uvicorn on port 8001. v3 service on 8000 is untouched.  
**Files in scope:** `/etc/systemd/system/is1v4.service`

```bash
echo "=== Step 1.14: Systemd service (is1v4 on port 8001) ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_14_$(date +%Y%m%d_%H%M%S).log

# Detect Python/uvicorn location
UVICORN_BIN=""
if [ -f "/opt/is1v4_0/.venv/bin/uvicorn" ]; then
    UVICORN_BIN="/opt/is1v4_0/.venv/bin/uvicorn"
    echo "Using venv uvicorn: $UVICORN_BIN"
elif command -v uvicorn &> /dev/null; then
    UVICORN_BIN=$(which uvicorn)
    echo "Using system uvicorn: $UVICORN_BIN"
else
    # Try pip install if not found
    echo "uvicorn not found — attempting pip install"
    pip3 install uvicorn --break-system-packages
    UVICORN_BIN=$(which uvicorn)
fi

echo "Uvicorn bin: $UVICORN_BIN"
```

```python3 << 'PYEOF'
import subprocess, os

# Get uvicorn path
result = subprocess.run(['which', 'uvicorn'], capture_output=True, text=True)
uvicorn_bin = result.stdout.strip()

# Check for venv
venv_uvicorn = '/opt/is1v4_0/.venv/bin/uvicorn'
if os.path.exists(venv_uvicorn):
    uvicorn_bin = venv_uvicorn

print(f"Using uvicorn at: {uvicorn_bin}")

service_content = f"""[Unit]
Description=IS1 v4.0 FastAPI Application
Documentation=https://github.com/marcoevans693-eng/is1v4-0
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/is1v4_0
ExecStart={uvicorn_bin} backend.main:app --host 127.0.0.1 --port 8001 --workers 1 --log-level info
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/is1v4_0/logs/uvicorn.log
StandardError=append:/opt/is1v4_0/logs/uvicorn.log

[Install]
WantedBy=multi-user.target
"""

with open('/etc/systemd/system/is1v4.service', 'w') as f:
    f.write(service_content)

print("Service file written to /etc/systemd/system/is1v4.service")
print(service_content)
PYEOF
```

```bash
# Reload systemd and enable v4 service
systemctl daemon-reload
systemctl enable is1v4

echo "is1v4 service enabled. Starting..."
systemctl start is1v4
sleep 5

systemctl status is1v4 --no-pager

echo "=== Systemd service complete ==="
```

**Proof gate 1.14:**
```bash
systemctl is-active is1v4 && echo "PASS: is1v4 service is active" || echo "FAIL: is1v4 service not running — check: journalctl -u is1v4 -n 50"
# Verify port 8001 is listening
ss -tlnp | grep 8001 && echo "PASS: port 8001 listening" || echo "FAIL: port 8001 not open"
# Verify v3 still running on 8000
ss -tlnp | grep 8000 && echo "PASS: v3 still on port 8000" || echo "WARN: v3 port 8000 not detected"
```

---

## Step 1.15 — Nginx: Provision v4.matriixai.com

**Purpose:** Create Nginx server block for v4.matriixai.com proxying to port 8001, obtain Let's Encrypt SSL cert.  
**Files in scope:** `/etc/nginx/sites-available/v4.matriixai.com`

> ⚠️ **PREREQUISITE:** DNS A record for `v4.matriixai.com → 77.37.63.4` must be live before certbot runs.  
> Verify: `dig v4.matriixai.com +short` should return `77.37.63.4`

```bash
echo "=== Step 1.15: Nginx v4.matriixai.com ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_15_$(date +%Y%m%d_%H%M%S).log

# Verify DNS resolves before proceeding
dig v4.matriixai.com +short
DNS_IP=$(dig v4.matriixai.com +short | tail -1)
if [ "$DNS_IP" = "77.37.63.4" ]; then
    echo "PASS: DNS resolves correctly to 77.37.63.4"
else
    echo "FAIL: DNS not resolving correctly — got: $DNS_IP"
    echo "Expected: 77.37.63.4"
    echo "STOP: Wait for DNS propagation before continuing Step 1.15"
    exit 1
fi
```

```python3 << 'PYEOF'
nginx_config = """server {
    listen 80;
    server_name v4.matriixai.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name v4.matriixai.com;

    # SSL — filled in by certbot
    # ssl_certificate and ssl_certificate_key added by certbot

    # Frontend static files
    root /opt/is1v4_0/frontend/dist;
    index index.html;

    # API proxy → v4 FastAPI on port 8001
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # React SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Logs
    access_log /var/log/nginx/v4.matriixai.com.access.log;
    error_log /var/log/nginx/v4.matriixai.com.error.log;
}
"""

with open('/etc/nginx/sites-available/v4.matriixai.com', 'w') as f:
    f.write(nginx_config)
print("Nginx config written to /etc/nginx/sites-available/v4.matriixai.com")
PYEOF
```

```bash
# Enable the site
ln -sf /etc/nginx/sites-available/v4.matriixai.com /etc/nginx/sites-enabled/v4.matriixai.com

# Test nginx config
nginx -t

# Reload nginx (HTTP only for now — certbot adds HTTPS)
systemctl reload nginx

echo "Nginx HTTP config active. Running certbot for SSL..."

# Obtain Let's Encrypt cert
certbot --nginx -d v4.matriixai.com --non-interactive --agree-tos --email admin@matriixai.com --redirect

echo "--- Final nginx config after certbot ---"
cat /etc/nginx/sites-available/v4.matriixai.com

# Final nginx reload
nginx -t && systemctl reload nginx

echo "=== Nginx + SSL complete ==="
```

**Proof gate 1.15:**
```bash
# Nginx config valid
nginx -t && echo "PASS: nginx config valid" || echo "FAIL: nginx config error"

# SSL cert exists
test -f /etc/letsencrypt/live/v4.matriixai.com/fullchain.pem && echo "PASS: SSL cert exists" || echo "FAIL: SSL cert missing"

# Site enabled (symlink)
test -L /etc/nginx/sites-enabled/v4.matriixai.com && echo "PASS: site enabled" || echo "FAIL: site not enabled"

echo "=== Smoke testing via HTTPS ==="
# Health check over HTTPS
sleep 3
curl -s https://v4.matriixai.com/api/health | python3 -m json.tool || echo "WARN: health check failed — check nginx + uvicorn logs"
```

---

## Step 1.16 — Smoke Tests

**Purpose:** Full end-to-end verification of v4 stack before git commit and sign-off.  
**Files in scope:** None (read-only verification)

```bash
echo "=== Step 1.16: Smoke tests ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_16_$(date +%Y%m%d_%H%M%S).log

PASS=0
FAIL=0

run_check() {
    local name="$1"
    local cmd="$2"
    local expect="$3"
    
    result=$(eval "$cmd" 2>&1)
    if echo "$result" | grep -q "$expect"; then
        echo "PASS: $name"
        PASS=$((PASS+1))
    else
        echo "FAIL: $name"
        echo "  Expected: $expect"
        echo "  Got: $result"
        FAIL=$((FAIL+1))
    fi
}

# 1. v4 API health
run_check "v4 API /api/health" \
    "curl -sf https://v4.matriixai.com/api/health" \
    "ok"

# 2. v4 API responds on port 8001 directly
run_check "v4 uvicorn port 8001" \
    "curl -sf http://127.0.0.1:8001/api/health" \
    "ok"

# 3. v3 API still healthy
run_check "v3 API still healthy" \
    "curl -sf https://matriixai.com/api/health" \
    "ok"

# 4. Postgres is1v4_0 accessible
run_check "Postgres is1v4_0" \
    "sudo -u postgres psql -d is1v4_0 -c 'SELECT 1;'" \
    "1 row"

# 5. Postgres tags tables gone
run_check "Tags tables dropped" \
    "sudo -u postgres psql -d is1v4_0 -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('tags','document_tags') AND table_schema='public';\"" \
    " 0"

# 6. Token columns exist
run_check "Token columns in tr_conversations" \
    "sudo -u postgres psql -d is1v4_0 -c \"SELECT column_name FROM information_schema.columns WHERE table_name='tr_conversations' AND column_name='total_tokens_in';\"" \
    "total_tokens_in"

# 7. AGE extension active
run_check "AGE extension" \
    "sudo -u postgres psql -d is1v4_0 -c \"SELECT extname FROM pg_extension WHERE extname='age';\"" \
    "age"

# 8. MapGraph graph exists
run_check "MapGraph graph" \
    "sudo -u postgres psql -d is1v4_0 -c \"LOAD 'age'; SET search_path = ag_catalog, '\$user', public; SELECT name FROM ag_catalog.ag_graph;\"" \
    "is1v4_mapgraph"

# 9. Qdrant v4 collections exist
run_check "Qdrant is1v4_knowledge" \
    "curl -sf http://localhost:6333/collections/is1v4_knowledge" \
    "result"

run_check "Qdrant is1v4_memory" \
    "curl -sf http://localhost:6333/collections/is1v4_memory" \
    "result"

run_check "Qdrant is1v4_events" \
    "curl -sf http://localhost:6333/collections/is1v4_events" \
    "result"

# 10. v3 Qdrant collection untouched
run_check "Qdrant is1v3_knowledge intact" \
    "curl -sf http://localhost:6333/collections/is1v3_knowledge" \
    "result"

# 11. DuckDB v4 file exists
run_check "DuckDB intellisys1_v4.duckdb" \
    "ls /opt/is1v4_0/data/duckdb/intellisys1_v4.duckdb" \
    "intellisys1_v4.duckdb"

# 12. Frontend dist served
run_check "Frontend HTML served" \
    "curl -sf https://v4.matriixai.com/" \
    "<!doctype html>"

# 13. is1v4 service active
run_check "is1v4 systemd service active" \
    "systemctl is-active is1v4" \
    "active"

# 14. Build logs directory
run_check "build-logs directory" \
    "ls /opt/is1v4_0/build-logs/" \
    ""

echo ""
echo "=== Smoke Test Results: $PASS PASSED, $FAIL FAILED ==="

if [ $FAIL -gt 0 ]; then
    echo "STOP: $FAIL checks failed. Do not proceed to Step 1.17 until all failures are resolved."
    echo "Check journalctl -u is1v4 -n 50 and /opt/is1v4_0/logs/uvicorn.log for errors"
    exit 1
else
    echo "ALL CHECKS PASSED. Proceeding to git commit."
fi
```

---

## Step 1.17 — Initial Git Commit and Push

**Purpose:** Create clean initial commit of v4 state, push to GitHub.  
**Files in scope:** `/opt/is1v4_0/.git`

```bash
echo "=== Step 1.17: Initial git commit ===" | tee -a /opt/is1v4_0/build-logs/phase_01_step_1_17_$(date +%Y%m%d_%H%M%S).log

cd /opt/is1v4_0

# Configure git identity (use same as v3 if needed)
git config user.email "marco@matriixai.com"
git config user.name "Marco Evans"

# Add all v4 files
git add -A

# Show what's being committed
echo "--- Files staged for initial commit ---"
git status --short | head -50

# Initial commit
git commit -m "Phase 1: IS1 v4.0 migration from v3

- Clone of v3 at v1.4.0 (frozen)
- New project root: /opt/is1v4_0/
- New database: is1v4_0 (migrated from intellisys1_v3)
- Tags schema dropped (tagless enforcement, spec §2.14)
- total_tokens_in/out added to tr_conversations (spec §3.1 OQ-1)
- Apache AGE installed, is1v4_mapgraph graph created
- Qdrant collections: is1v4_knowledge, is1v4_memory, is1v4_events
- DuckDB: intellisys1_v4.duckdb active
- File storage layout per spec §2.12
- Nginx: v4.matriixai.com with Let's Encrypt SSL
- Uvicorn: port 8001 (v3 retains 8000)
- CLAUDE.md and OPS_PROTOCOL.md updated for v4
- v3 untouched at /opt/intellisys1-v3/ (matriixai.com still live)

Spec ref: IS1v4_0_System_Specification_v1.0"

# Push to remote
git push -u origin main

echo "--- Git log ---"
git log --oneline -5

echo "=== Initial git commit complete ==="
```

---

## Final Proof Gates

Run these after Step 1.17 and paste full output in the build log before signing off.

```bash
echo "=============================================="
echo "IS1 v4.0 — Phase 1 Final Proof Gates"
echo "$(date)"
echo "=============================================="

echo ""
echo "--- 1. Git state ---"
cd /opt/is1v4_0
git log --oneline -5
git status

echo ""
echo "--- 2. v4 health endpoint ---"
curl -s https://v4.matriixai.com/api/health | python3 -m json.tool

echo ""
echo "--- 3. v3 health endpoint (must still be ok) ---"
curl -s https://matriixai.com/api/health | python3 -m json.tool

echo ""
echo "--- 4. Postgres tables in is1v4_0 ---"
sudo -u postgres psql -d is1v4_0 -c "\dt"

echo ""
echo "--- 5. Tags tables dropped ---"
sudo -u postgres psql -d is1v4_0 -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('tags','document_tags');"

echo ""
echo "--- 6. Token columns present ---"
sudo -u postgres psql -d is1v4_0 -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='tr_conversations' AND column_name IN ('total_tokens_in','total_tokens_out');"

echo ""
echo "--- 7. AGE + MapGraph ---"
sudo -u postgres psql -d is1v4_0 -c "SELECT extname, extversion FROM pg_extension WHERE extname='age';"
sudo -u postgres psql -d is1v4_0 -c "LOAD 'age'; SET search_path = ag_catalog, \"\$user\", public; SELECT name, namespace FROM ag_catalog.ag_graph;"

echo ""
echo "--- 8. Qdrant collections ---"
curl -s http://localhost:6333/collections | python3 -m json.tool

echo ""
echo "--- 9. Services ---"
systemctl is-active is1v4 && echo "is1v4: ACTIVE" || echo "is1v4: INACTIVE"
systemctl is-active nginx && echo "nginx: ACTIVE" || echo "nginx: INACTIVE"
systemctl is-active postgresql && echo "postgresql: ACTIVE" || echo "postgresql: INACTIVE"
docker ps | grep qdrant

echo ""
echo "--- 10. Disk and memory ---"
df -h /
free -h

echo ""
echo "--- 11. Data directory layout ---"
find /opt/is1v4_0/data -type d | sort

echo ""
echo "--- 12. SSL cert ---"
certbot certificates | grep -A3 "v4.matriixai.com" || echo "Check certbot certificates manually"

echo ""
echo "=============================================="
echo "Phase 1 Proof Gates complete — paste above to Marco"
echo "=============================================="
```

---

## Sign-Off Conditions

Phase 1 is complete and ready for Marco sign-off when **all** of the following are true:

| # | Condition | Verified By |
|---|---|---|
| 1 | `/opt/is1v4_0/` exists with full v4 file structure | `ls /opt/is1v4_0/` |
| 2 | `https://v4.matriixai.com/api/health` returns `"status": "ok"` | curl check |
| 3 | `https://matriixai.com/api/health` still returns `"status": "ok"` | curl check |
| 4 | Postgres `is1v4_0` database exists with all v3 tables migrated | `\dt` output |
| 5 | `tags` and `document_tags` tables absent from `is1v4_0` | `information_schema` check |
| 6 | `total_tokens_in` and `total_tokens_out` present on `tr_conversations` | column check |
| 7 | Apache AGE extension installed and `is1v4_mapgraph` graph created | `ag_catalog.ag_graph` check |
| 8 | Qdrant collections `is1v4_knowledge`, `is1v4_memory`, `is1v4_events` exist | Qdrant collections API |
| 9 | `is1v3_knowledge` collection in Qdrant untouched (4219 points) | Qdrant collections API |
| 10 | `intellisys1_v4.duckdb` exists in `data/duckdb/` | `ls` check |
| 11 | `is1v4` systemd service active on port 8001 | `systemctl is-active is1v4` |
| 12 | Nginx serving v4 at `v4.matriixai.com` with valid SSL | HTTPS curl check |
| 13 | CLAUDE.md and OPS_PROTOCOL.md updated for v4 | `head -5` of each file |
| 14 | Initial git commit pushed to `marcoevans693-eng/is1v4-0` | `git log --oneline -3` |
| 15 | All Phase 1 smoke tests pass (0 failures) | Step 1.16 output |

**Do not advance to Phase 2 until Marco signs off on all 15 conditions.**

---

## Rollback Plan

Phase 1 is fully non-destructive. v3 is untouched throughout.

**If Phase 1 needs to be abandoned:**

```bash
# Stop v4 services
systemctl stop is1v4
systemctl disable is1v4
rm /etc/systemd/system/is1v4.service
systemctl daemon-reload

# Remove Nginx v4 config
rm /etc/nginx/sites-enabled/v4.matriixai.com
rm /etc/nginx/sites-available/v4.matriixai.com
nginx -t && systemctl reload nginx

# Drop v4 database (data from v3 dump, no original data lost)
sudo -u postgres psql -c "DROP DATABASE is1v4_0;"

# Remove v4 Qdrant collections (empty — no corpus data)
curl -X DELETE http://localhost:6333/collections/is1v4_knowledge
curl -X DELETE http://localhost:6333/collections/is1v4_memory
curl -X DELETE http://localhost:6333/collections/is1v4_events

# Remove v4 project directory
rm -rf /opt/is1v4_0

# Verify v3 still healthy
curl -s https://matriixai.com/api/health | python3 -m json.tool
```

v3 at `/opt/intellisys1-v3/` and `matriixai.com` remains fully intact throughout and after rollback.

---

## What Phase 2 Will Do

Phase 2 (Caching Layer) will operate on `/opt/is1v4_0/` and implement:
- Anthropic prompt caching (`cache_control` headers) on system prompts, RAG context, included chats
- OpenAI/Grok automatic caching (free, no config)
- Gemini manual caching setup
- Cache hit/miss tracking wired into DuckDB

Phase 2 Chat opens with VPS snapshot from v4 root:
```bash
cd /opt/is1v4_0 && git log --oneline -8 && git status
curl -s https://v4.matriixai.com/api/health | python3 -m json.tool
sudo -u postgres psql -d is1v4_0 -c "\dt"
docker ps | grep qdrant
df -h /
free -h
```

---

*IS1 v4.0 — Phase 1 Migration Instruction File*  
*Spec ref: IS1v4_0_System_Specification_v1.0*  
*Authored: Chat 04 — April 27, 2026*
