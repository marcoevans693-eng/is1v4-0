"""Observability endpoints: Postgres summary, Qdrant stats, DuckDB audit trail, tags summary."""

from __future__ import annotations

import json
import sys
from typing import Optional

import duckdb
import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException, Query
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

from backend.config import settings

router = APIRouter()


def get_conn():
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


def get_qdrant():
    return QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)


def get_duckdb():
    return duckdb.connect(settings.DUCKDB_PATH)


# ---------------------------------------------------------------------------
# GET /api/observability/postgres
# ---------------------------------------------------------------------------

@router.get("/api/observability/postgres")
def obs_postgres(
    title_search: Optional[str] = Query(None),
    tag_id: Optional[str] = Query(None),
    folder_id: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at", pattern="^(title|created_at|token_count|updated_at)$"),
    sort_dir: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Summary counts
        cur.execute("SELECT COUNT(*) AS dc FROM knowledge_documents")
        document_count = cur.fetchone()["dc"]
        cur.execute("SELECT COUNT(*) AS tc FROM tags")
        tag_count = cur.fetchone()["tc"]
        cur.execute("SELECT COUNT(*) AS fc FROM folders")
        folder_count = cur.fetchone()["fc"]

        # Build filtered document query
        where_clauses = ["1=1"]
        params = []

        if title_search:
            where_clauses.append("kd.title ILIKE %s")
            params.append(f"%{title_search}%")
        if folder_id == "unfiled":
            where_clauses.append("kd.folder_id IS NULL")
        elif folder_id:
            where_clauses.append("kd.folder_id = %s")
            params.append(folder_id)
        if tag_id:
            where_clauses.append(
                "EXISTS (SELECT 1 FROM document_tags dt2 WHERE dt2.document_id = kd.id AND dt2.tag_id = %s)"
            )
            params.append(tag_id)

        where_sql = " AND ".join(where_clauses)

        # Sort mapping (token_count from DuckDB — use created_at as proxy if not available)
        sort_col_map = {
            "title": "kd.title",
            "created_at": "kd.created_at",
            "updated_at": "kd.updated_at",
            "token_count": "kd.created_at",  # fallback; enriched below
        }
        sort_col = sort_col_map.get(sort_by, "kd.created_at")
        sort_dir_sql = "DESC" if sort_dir == "desc" else "ASC"

        doc_params = params + [limit, offset]
        cur.execute(f"""
            SELECT kd.id, kd.title, kd.folder_id, f.name AS folder_name, f.color AS folder_color,
                   kd.content_hash, kd.created_at, kd.updated_at,
                   COALESCE(
                       json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                       FILTER (WHERE t.id IS NOT NULL), '[]'
                   ) AS tags
            FROM knowledge_documents kd
            LEFT JOIN folders f ON f.id = kd.folder_id
            LEFT JOIN document_tags dt ON dt.document_id = kd.id
            LEFT JOIN tags t ON t.id = dt.tag_id
            WHERE {where_sql}
            GROUP BY kd.id, kd.title, kd.folder_id, f.name, f.color, kd.content_hash,
                     kd.created_at, kd.updated_at
            ORDER BY {sort_col} {sort_dir_sql}
            LIMIT %s OFFSET %s
        """, doc_params)
        doc_rows = cur.fetchall()

        # All tags with counts
        cur.execute("""
            SELECT t.id, t.name, t.color, COUNT(dt.document_id) AS document_count
            FROM tags t
            LEFT JOIN document_tags dt ON dt.tag_id = t.id
            GROUP BY t.id, t.name, t.color
            ORDER BY t.name
        """)
        tags = [dict(r) for r in cur.fetchall()]

        # All folders with counts
        cur.execute("""
            SELECT f.id, f.name, f.color, COUNT(kd.id) AS document_count
            FROM folders f
            LEFT JOIN knowledge_documents kd ON kd.folder_id = f.id
            GROUP BY f.id, f.name, f.color
            ORDER BY f.name
        """)
        folders = [dict(r) for r in cur.fetchall()]

        cur.close()
    finally:
        conn.close()

    # Enrich with token_count from DuckDB
    doc_ids = [str(r["id"]) for r in doc_rows]
    token_map = {}
    total_tokens = 0
    if doc_ids:
        try:
            db = get_duckdb()
            placeholders = ",".join(["?"] * len(doc_ids))
            facts = db.execute(f"""
                SELECT document_id, token_count FROM document_facts
                WHERE document_id IN ({placeholders})
                ORDER BY event_at DESC
            """, doc_ids).fetchall()
            db.close()
            for doc_id, tc in facts:
                if doc_id not in token_map and tc is not None:
                    token_map[doc_id] = tc
        except Exception as e:
            print(f"[obs postgres duckdb error] {e}", file=sys.stderr)

    # Also get global total_tokens (latest token_count per document)
    try:
        db2 = get_duckdb()
        tot = db2.execute("""
            WITH ranked AS (
                SELECT document_id, token_count,
                       ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY event_at DESC) AS rn
                FROM document_facts
                WHERE token_count IS NOT NULL AND token_count > 0
            )
            SELECT COALESCE(SUM(token_count), 0) FROM ranked WHERE rn = 1
        """).fetchone()
        db2.close()
        total_tokens = int(tot[0]) if tot and tot[0] else 0
    except Exception as e:
        print(f"[obs total_tokens error] {e}", file=sys.stderr)

    documents = []
    for r in doc_rows:
        did = str(r["id"])
        documents.append({
            "id": did,
            "title": r["title"],
            "folder_id": str(r["folder_id"]) if r["folder_id"] else None,
            "folder_name": r["folder_name"],
            "folder_color": r["folder_color"],
            "tags": r["tags"] if isinstance(r["tags"], list) else [],
            "token_count": token_map.get(did, 0),
            "content_hash": r["content_hash"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })

    return {
        "document_count": document_count,
        "total_tokens": total_tokens,
        "tag_count": tag_count,
        "folder_count": folder_count,
        "documents": documents,
        "tags": tags,
        "folders": folders,
    }


# ---------------------------------------------------------------------------
# GET /api/observability/qdrant
# ---------------------------------------------------------------------------

@router.get("/api/observability/qdrant")
def obs_qdrant():
    try:
        qdrant = get_qdrant()
        info = qdrant.get_collection(settings.QDRANT_COLLECTION)
        total_points = info.points_count or 0
        indexed_vectors = info.indexed_vectors_count or total_points
        status = str(info.status).lower() if info.status else "unknown"
        # Normalize status to green/yellow/red
        if "green" in status or "ok" in status:
            status_str = "green"
        elif "yellow" in status or "partial" in status:
            status_str = "yellow"
        else:
            status_str = status
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Qdrant error: {e}")

    # Scroll all points to group by document_id
    doc_counts: dict = {}
    try:
        offset = None
        while True:
            pts, next_offset = qdrant.scroll(
                collection_name=settings.QDRANT_COLLECTION,
                offset=offset,
                limit=500,
                with_payload=True,
                with_vectors=False,
            )
            for pt in pts:
                did = pt.payload.get("document_id") if pt.payload else None
                if did:
                    doc_counts[did] = doc_counts.get(did, 0) + 1
            if next_offset is None:
                break
            offset = next_offset
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Qdrant scroll error: {e}")

    # Resolve titles from Postgres
    doc_ids = list(doc_counts.keys())
    titles = {}
    if doc_ids:
        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            placeholders = ",".join(["%s"] * len(doc_ids))
            cur.execute(f"SELECT id, title FROM knowledge_documents WHERE id IN ({placeholders})", doc_ids)
            for r in cur.fetchall():
                titles[str(r["id"])] = r["title"]
            cur.close()
        finally:
            conn.close()

    # Sort by point_count desc, limit 100
    sorted_docs = sorted(doc_counts.items(), key=lambda x: x[1], reverse=True)[:100]
    points_per_document = [
        {
            "document_id": did,
            "document_title": titles.get(did),
            "point_count": count,
        }
        for did, count in sorted_docs
    ]

    return {
        "collection_name": settings.QDRANT_COLLECTION,
        "status": status_str,
        "total_points": total_points,
        "indexed_vectors": indexed_vectors,
        "points_per_document": points_per_document,
    }


# ---------------------------------------------------------------------------
# GET /api/observability/duckdb
# ---------------------------------------------------------------------------

@router.get("/api/observability/duckdb")
def obs_duckdb(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    document_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    try:
        db = get_duckdb()
        where = "WHERE 1=1"
        params = []

        if from_date:
            where += " AND CAST(event_at AS DATE) >= ?"
            params.append(from_date)
        if to_date:
            where += " AND CAST(event_at AS DATE) <= ?"
            params.append(to_date)
        if document_id:
            where += " AND document_id = ?"
            params.append(document_id)
        if event_type:
            # Handle legacy 'delete' and current 'deletion' for backward compat
            if event_type == "deletion":
                where += " AND event_type IN ('deletion', 'delete')"
            else:
                where += " AND event_type = ?"
                params.append(event_type)

        count_row = db.execute(f"SELECT COUNT(*) FROM document_facts {where}", params).fetchone()
        total = count_row[0] if count_row else 0

        rows = db.execute(f"""
            SELECT id, document_id, event_type, title, folder, tag_names,
                   token_count, content_hash, event_at
            FROM document_facts
            {where}
            ORDER BY event_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()
        db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DuckDB error: {e}")

    events = []
    for r in rows:
        # tag_names is stored as JSON array string
        try:
            tags_raw = r[5]
            if isinstance(tags_raw, str):
                tag_list = json.loads(tags_raw)
                tags_str = ", ".join(tag_list) if tag_list else ""
            else:
                tags_str = ""
        except Exception:
            tags_str = str(r[5]) if r[5] else ""

        events.append({
            "id": r[0],
            "document_id": r[1],
            "event_type": r[2],
            "title": r[3],
            "folder": r[4],
            "tags": tags_str,
            "token_count": r[6],
            "content_hash": r[7],
            "event_at": r[8].isoformat() if r[8] else None,
        })

    return {"events": events, "total": total}


# ---------------------------------------------------------------------------
# GET /api/observability/tags
# ---------------------------------------------------------------------------

@router.get("/api/observability/tags")
def obs_tags():
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT t.id, t.name, t.color, COUNT(dt.document_id) AS document_count
            FROM tags t
            LEFT JOIN document_tags dt ON dt.tag_id = t.id
            GROUP BY t.id, t.name, t.color
            ORDER BY t.name
        """)
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()
    return {"tags": [dict(r) for r in rows]}
