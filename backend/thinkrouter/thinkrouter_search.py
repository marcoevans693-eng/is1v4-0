"""
thinkrouter_search.py — IS1-TR conversation search and All Chats endpoints.

Endpoints:
  POST /api/thinkrouter/search        — semantic search across is1v4_knowledge
  GET  /api/thinkrouter/conversations/all — paginated list of all conversations
"""
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from qdrant_client import QdrantClient

from backend.config import settings

router = APIRouter(prefix="/api/thinkrouter", tags=["thinkrouter-search"])

COLLECTION = "is1v4_knowledge"
EMBEDDING_MODEL = "text-embedding-3-small"


# ---------------------------------------------------------------------------
# DB helper (same pattern as thinkrouter.py)
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    query: str
    limit: int = 20
    model_sku: Optional[str] = None
    date_after: Optional[str] = None   # ISO date string e.g. "2026-01-01"
    date_before: Optional[str] = None  # ISO date string e.g. "2026-04-30"


# ---------------------------------------------------------------------------
# POST /api/thinkrouter/search
# ---------------------------------------------------------------------------

@router.post("/search")
def search_conversations(req: SearchRequest):
    """
    Semantic search across is1v4_knowledge Qdrant collection.
    Steps:
      1. Embed query via OpenAI text-embedding-3-small
      2. Qdrant search — top 60 points (over-fetch for post-filter grouping)
      3. Postgres join to get conversation title, updated_at, filter by model/date
      4. Group by conversation_id, keep best-scoring turn per conversation
      5. Return up to req.limit conversations
    """
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query must not be empty")

    # Step 1 — embed query
    try:
        openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=query[:8000],
        )
        query_vector = response.data[0].embedding
    except Exception as e:
        print(f"[search] embedding error: {e}", file=sys.stderr)
        raise HTTPException(status_code=502, detail="Embedding service error")

    # Step 2 — Qdrant search (over-fetch to allow for post-filter grouping)
    try:
        qdrant_client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        result = qdrant_client.query_points(
            collection_name=COLLECTION,
            query=query_vector,
            limit=min(req.limit * 6, 60),
            with_payload=True,
        )
        hits = result.points
    except Exception as e:
        print(f"[search] Qdrant error: {e}", file=sys.stderr)
        raise HTTPException(status_code=502, detail="Search service error")

    if not hits:
        return {"results": []}

    # Extract unique conversation_ids from hits, preserving best score per conv
    # Map: conversation_id -> (best_score, best_hit_payload)
    best_by_conv: dict = {}
    for hit in hits:
        p = hit.payload or {}
        cid = p.get("conversation_id")
        if not cid:
            continue
        if cid not in best_by_conv or hit.score > best_by_conv[cid]["score"]:
            best_by_conv[cid] = {
                "score": hit.score,
                "turn_id": p.get("turn_id"),
                "seq": p.get("seq"),
                "model_sku": p.get("model_sku"),
                "content_preview": None,  # filled from Postgres below
            }

    if not best_by_conv:
        return {"results": []}

    # Step 3 — Postgres join for title, content excerpt, updated_at, date/model filter
    conv_ids = list(best_by_conv.keys())
    turn_ids = [v["turn_id"] for v in best_by_conv.values() if v["turn_id"]]

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Fetch conversations
            cur.execute(
                """
                SELECT id::text, title, updated_at, archived
                FROM tr_conversations
                WHERE id::text = ANY(%s) AND archived = FALSE
                """,
                (conv_ids,),
            )
            conv_rows = {r["id"]: r for r in cur.fetchall()}

            # Fetch turn content for excerpts
            if turn_ids:
                cur.execute(
                    """
                    SELECT id::text, conversation_id::text, seq, content, model_sku
                    FROM tr_turns
                    WHERE id::text = ANY(%s)
                    """,
                    (turn_ids,),
                )
                turn_rows = {r["id"]: r for r in cur.fetchall()}
            else:
                turn_rows = {}
    finally:
        conn.close()

    # Step 4 — assemble results, apply model/date filters, sort by score
    results = []
    for cid, best in best_by_conv.items():
        conv = conv_rows.get(cid)
        if not conv:
            continue  # archived or deleted

        updated_at = conv["updated_at"]

        # Date filter
        if req.date_after:
            try:
                cutoff = datetime.fromisoformat(req.date_after).replace(tzinfo=timezone.utc)
                if updated_at.replace(tzinfo=timezone.utc) < cutoff:
                    continue
            except ValueError:
                pass

        if req.date_before:
            try:
                cutoff = datetime.fromisoformat(req.date_before).replace(tzinfo=timezone.utc)
                if updated_at.replace(tzinfo=timezone.utc) > cutoff:
                    continue
            except ValueError:
                pass

        # Model filter — check against best-match turn's model_sku
        if req.model_sku and best.get("model_sku") != req.model_sku:
            continue

        # Build excerpt from turn content
        turn = turn_rows.get(best["turn_id"]) if best["turn_id"] else None
        if turn:
            raw = turn["content"] or ""
            excerpt = raw[:200] + ("…" if len(raw) > 200 else "")
        else:
            excerpt = ""

        results.append({
            "conversation_id": cid,
            "title": conv["title"],
            "matched_turn_id": best["turn_id"],
            "matched_turn_seq": best["seq"],
            "matched_turn_excerpt": excerpt,
            "relevance": round(best["score"], 4),
            "model_sku": best["model_sku"],
            "updated_at": updated_at.isoformat() if updated_at else None,
        })

    # Sort by relevance score descending, cap at limit
    results.sort(key=lambda r: r["relevance"], reverse=True)
    return {"results": results[: req.limit]}


# ---------------------------------------------------------------------------
# GET /api/thinkrouter/conversations/all
# ---------------------------------------------------------------------------

@router.get("/conversations/all")
def list_all_conversations(
    sort: str = "updated_at",        # updated_at | created_at | total_cost_usd | turn_count
    order: str = "desc",             # asc | desc
    include_archived: bool = False,
):
    """
    Returns all conversations for the All Chats page.
    Sorted by `sort` field, `order` direction.
    Archived conversations excluded unless include_archived=True.
    """
    allowed_sort = {"updated_at", "created_at", "total_cost_usd", "turn_count"}
    if sort not in allowed_sort:
        sort = "updated_at"
    direction = "DESC" if order.lower() != "asc" else "ASC"

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            where = "" if include_archived else "WHERE archived = FALSE"
            cur.execute(
                f"""
                SELECT
                    id::text,
                    title,
                    pinned,
                    archived,
                    turn_count,
                    total_cost_usd,
                    created_at,
                    updated_at
                FROM tr_conversations
                {where}
                ORDER BY {sort} {direction}
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    return {
        "conversations": [
            {
                "id": r["id"],
                "title": r["title"],
                "pinned": r["pinned"],
                "archived": r["archived"],
                "turn_count": r["turn_count"],
                "total_cost_usd": float(r["total_cost_usd"]) if r["total_cost_usd"] else 0.0,
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            for r in rows
        ]
    }
