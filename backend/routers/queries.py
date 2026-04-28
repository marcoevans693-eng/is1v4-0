"""Query history endpoints: log, detail, rerun, stats."""

from __future__ import annotations

import json
import sys
import time
import uuid
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException, Query

from backend.config import settings

router = APIRouter()


def get_conn():
    import psycopg2
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


def get_duckdb():
    import duckdb
    return duckdb.connect(settings.DUCKDB_PATH)


def _resolve_titles(doc_ids: list) -> dict:
    """Resolve document IDs to titles via Postgres. Returns {id: title|None}."""
    if not doc_ids:
        return {}
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        placeholders = ",".join(["%s"] * len(doc_ids))
        cur.execute(f"SELECT id, title FROM knowledge_documents WHERE id IN ({placeholders})", doc_ids)
        result = {str(r["id"]): r["title"] for r in cur.fetchall()}
        cur.close()
        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/queries
# ---------------------------------------------------------------------------

@router.get("/api/queries")
def list_queries(
    mode: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
):
    try:
        db = get_duckdb()
        where = "WHERE 1=1"
        params = []
        if mode:
            where += " AND query_mode = ?"
            params.append(mode)
        if q:
            where += " AND query_text ILIKE ?"
            params.append(f"%{q}%")
        if from_date:
            where += " AND CAST(executed_at AS DATE) >= ?"
            params.append(from_date)
        if to_date:
            where += " AND CAST(executed_at AS DATE) <= ?"
            params.append(to_date)

        count_row = db.execute(f"SELECT COUNT(*) FROM query_log {where}", params).fetchone()
        total = count_row[0] if count_row else 0

        rows = db.execute(f"""
            SELECT id, query_text, query_mode, result_count, latency_ms, tokens_consumed, executed_at
            FROM query_log
            {where}
            ORDER BY executed_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()
        db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DuckDB error: {e}")

    entries = []
    for r in rows:
        entries.append({
            "id": r[0],
            "query_text": r[1],
            "query_mode": r[2],
            "result_count": r[3],
            "latency_ms": r[4],
            "tokens_consumed": r[5],
            "executed_at": r[6].isoformat() if r[6] else None,
        })

    return {"entries": entries, "total": total}


# ---------------------------------------------------------------------------
# GET /api/queries/stats  (must come BEFORE /:id route)
# ---------------------------------------------------------------------------

@router.get("/api/queries/stats")
def query_stats():
    try:
        db = get_duckdb()
        total_row = db.execute("SELECT COUNT(*) FROM query_log").fetchone()
        total = total_row[0] if total_row else 0

        mode_rows = db.execute(
            "SELECT query_mode, COUNT(*) FROM query_log GROUP BY query_mode"
        ).fetchall()

        zero_row = db.execute(
            "SELECT COUNT(*) FROM query_log WHERE result_count = 0"
        ).fetchone()
        zero_result = zero_row[0] if zero_row else 0

        freq_rows = db.execute("""
            SELECT query_text, COUNT(*) AS cnt
            FROM query_log
            GROUP BY query_text
            ORDER BY cnt DESC
            LIMIT 10
        """).fetchall()

        avg_row = db.execute("SELECT AVG(latency_ms) FROM query_log").fetchone()
        avg_latency = round(avg_row[0], 2) if avg_row and avg_row[0] is not None else 0
        db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DuckDB error: {e}")

    by_mode = {"chat": 0, "keyword": 0, "wildcard": 0, "semantic": 0}
    for mode, count in mode_rows:
        if mode in by_mode:
            by_mode[mode] = count

    return {
        "total_queries": total,
        "by_mode": by_mode,
        "zero_result_queries": zero_result,
        "most_frequent": [{"query_text": r[0], "count": r[1]} for r in freq_rows],
        "avg_latency_ms": avg_latency,
    }


# ---------------------------------------------------------------------------
# GET /api/queries/:id
# ---------------------------------------------------------------------------

@router.get("/api/queries/{query_id}")
def get_query(query_id: str):
    try:
        db = get_duckdb()
        row = db.execute("""
            SELECT id, query_text, query_mode, result_count, latency_ms, tokens_consumed,
                   documents_hit, executed_at
            FROM query_log WHERE id = ?
        """, [query_id]).fetchone()
        db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DuckDB error: {e}")

    if not row:
        raise HTTPException(status_code=404, detail="Query not found")

    try:
        doc_ids = json.loads(row[6]) if row[6] else []
    except Exception:
        doc_ids = []

    titles = _resolve_titles(doc_ids)

    return {
        "id": row[0],
        "query_text": row[1],
        "query_mode": row[2],
        "result_count": row[3],
        "latency_ms": row[4],
        "tokens_consumed": row[5],
        "executed_at": row[7].isoformat() if row[7] else None,
        "documents_hit": [{"id": did, "title": titles.get(did)} for did in doc_ids],
    }


# ---------------------------------------------------------------------------
# POST /api/queries/:id/rerun
# ---------------------------------------------------------------------------

@router.post("/api/queries/{query_id}/rerun")
def rerun_query(query_id: str):
    try:
        db = get_duckdb()
        row = db.execute("""
            SELECT id, query_text, query_mode FROM query_log WHERE id = ?
        """, [query_id]).fetchone()
        db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DuckDB error: {e}")

    if not row:
        raise HTTPException(status_code=404, detail="Query not found")

    original_id = row[0]
    query_text = row[1]
    query_mode = row[2]

    if query_mode == "chat":
        from backend.routers.chat import _run_chat
        result = _run_chat(message=query_text, folder_id=None, tag_id=None)
        result["rerun_of"] = original_id
        return result
    else:
        # search modes
        from backend.routers.knowledge import search_documents
        result = search_documents(
            q=query_text,
            mode=query_mode,
            folder_id=None,
            tag_id=None,
            limit=20,
            offset=0,
        )
        result["rerun_of"] = original_id
        return result
