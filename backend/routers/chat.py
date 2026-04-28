"""Chat endpoint: RAG retrieval + inference ladder."""

from __future__ import annotations

import json
import sys
import time
import uuid
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import settings

router = APIRouter()

SYSTEM_PROMPT = (
    "You are an expert research assistant with access to a curated personal knowledge base.\n"
    "Answer the user's question using ONLY the documents provided in the context below.\n"
    "If the answer is not found in the documents, say so clearly — do not invent information.\n"
    "Cite which documents you drew from in your response.\n"
    "Be precise, thorough, and professional."
)

CONTEXT_TOKEN_BUDGET = 30_000


class ChatRequest(BaseModel):
    message: str
    folder_id: Optional[str] = None
    tag_id: Optional[str] = None


def get_conn():
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


def get_qdrant():
    from qdrant_client import QdrantClient
    return QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)


def _embed(text: str):
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.embeddings.create(model="text-embedding-3-small", input=[text])
    return resp.data[0].embedding


def _count_tokens(text: str) -> int:
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


def _duckdb_access_log(doc_id: str, query_text: str, score: float):
    try:
        db = get_duckdb()
        db.execute("""
            INSERT INTO document_access_log (id, document_id, query_text, relevance_score, accessed_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (str(uuid.uuid4()), doc_id, query_text, score))
        db.close()
    except Exception as e:
        print(f"[DuckDB access_log error] {e}", file=sys.stderr)


def _duckdb_query_log(message: str, doc_ids: list, count: int,
                      latency_ms: int, tokens_consumed: Optional[int]):
    try:
        db = get_duckdb()
        db.execute("""
            INSERT INTO query_log (id, query_text, query_mode, documents_hit, result_count, latency_ms, tokens_consumed, executed_at)
            VALUES (?, ?, 'chat', ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (str(uuid.uuid4()), message, json.dumps(doc_ids), count, latency_ms, tokens_consumed))
        db.close()
    except Exception as e:
        print(f"[DuckDB query_log error] {e}", file=sys.stderr)


def _run_chat(message: str, folder_id: Optional[str], tag_id: Optional[str]) -> dict:
    """Core chat logic. Shared with rerun endpoint."""
    t0 = time.monotonic()

    # [1] Embed
    try:
        vector = _embed(message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Embedding error: {e}")

    # [2] Qdrant top-20
    qdrant = get_qdrant()
    try:
        resp = qdrant.query_points(
            collection_name=settings.QDRANT_COLLECTION,
            query=vector,
            limit=20,
            with_payload=True,
        )
        hits = resp.points
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Qdrant search error: {e}")

    # [3] Deduplicate doc IDs preserving score order
    seen: dict = {}
    for hit in hits:
        did = hit.payload.get("document_id")
        if did and did not in seen:
            seen[did] = hit.score

    ordered_ids = list(seen.keys())

    # [4] Filter by folder_id / tag_id if provided
    if (folder_id or tag_id) and ordered_ids:
        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            filtered = []
            for did in ordered_ids:
                cur.execute("SELECT folder_id FROM knowledge_documents WHERE id = %s", (did,))
                row = cur.fetchone()
                if not row:
                    continue
                if folder_id and str(row["folder_id"] or "") != folder_id:
                    continue
                if tag_id:
                    cur.execute(
                        "SELECT 1 FROM document_tags WHERE document_id = %s AND tag_id = %s",
                        (did, tag_id),
                    )
                    if not cur.fetchone():
                        continue
                filtered.append(did)
            cur.close()
        finally:
            conn.close()
        ordered_ids = filtered

    # [5] Fetch full documents from Postgres in score order
    doc_rows = {}
    if ordered_ids:
        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            placeholders = ",".join(["%s"] * len(ordered_ids))
            cur.execute(f"""
                SELECT kd.id, kd.title, kd.content, kd.folder_id, f.name AS folder_name,
                       kd.token_count
                FROM knowledge_documents kd
                LEFT JOIN folders f ON f.id = kd.folder_id
                WHERE kd.id IN ({placeholders})
            """, ordered_ids)
            for r in cur.fetchall():
                doc_rows[str(r["id"])] = r

            # Fetch tags for these docs
            placeholders2 = ",".join(["%s"] * len(ordered_ids))
            cur.execute(f"""
                SELECT dt.document_id, t.id AS tag_id, t.name, t.color
                FROM document_tags dt
                JOIN tags t ON t.id = dt.tag_id
                WHERE dt.document_id IN ({placeholders2})
            """, ordered_ids)
            tag_map: dict = {}
            for r in cur.fetchall():
                did = str(r["document_id"])
                tag_map.setdefault(did, []).append({
                    "id": str(r["tag_id"]),
                    "name": r["name"],
                    "color": r["color"],
                })
            cur.close()
        finally:
            conn.close()
    else:
        tag_map = {}

    # [6] Assemble context within 30k token budget
    context_parts = []
    context_doc_ids = []
    tokens_used = 0
    for i, did in enumerate(ordered_ids, 1):
        if did not in doc_rows:
            continue
        r = doc_rows[did]
        content = r["content"] or ""
        doc_tokens = _count_tokens(content)
        if tokens_used + doc_tokens > CONTEXT_TOKEN_BUDGET:
            break
        context_parts.append(f"[Document {i}: {r['title']}]\n{content}")
        context_doc_ids.append(did)
        tokens_used += doc_tokens

    # [7] Log access log entries (non-fatal)
    for did in context_doc_ids:
        _duckdb_access_log(did, message, seen.get(did, 0.0))

    context_text = "\n\n".join(context_parts)
    full_prompt = f"{context_text}\n\nUser question: {message}" if context_text else message

    # Inference ladder
    provider = None
    model_name = None
    response_text = None
    tokens_consumed = None

    # Primary: Anthropic
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": full_prompt}],
        )
        response_text = resp.content[0].text
        tokens_consumed = resp.usage.input_tokens + resp.usage.output_tokens
        provider = "anthropic"
        model_name = "claude-sonnet-4-6"
    except Exception as e:
        print(f"[Anthropic error] {e}", file=sys.stderr)

    # Failover 1: OpenAI
    if response_text is None:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            resp = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": full_prompt},
                ],
            )
            response_text = resp.choices[0].message.content
            tokens_consumed = resp.usage.total_tokens if resp.usage else None
            provider = "openai"
            model_name = "gpt-4o"
        except Exception as e:
            print(f"[OpenAI error] {e}", file=sys.stderr)

    # Failover 2: Google
    if response_text is None:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            model = genai.GenerativeModel("gemini-2.5-pro")
            resp = model.generate_content(f"{SYSTEM_PROMPT}\n\n{full_prompt}")
            response_text = resp.text
            tokens_consumed = None  # Gemini usage not always exposed simply
            provider = "google"
            model_name = "gemini-2.5-pro"
        except Exception as e:
            print(f"[Google error] {e}", file=sys.stderr)

    if response_text is None:
        raise HTTPException(status_code=503, detail="All inference providers unavailable")

    latency_ms = int((time.monotonic() - t0) * 1000)

    # Log to DuckDB (non-fatal)
    _duckdb_query_log(message, context_doc_ids, len(context_doc_ids), latency_ms, tokens_consumed)

    sources = []
    for did in context_doc_ids:
        r = doc_rows[did]
        sources.append({
            "id": did,
            "title": r["title"],
            "relevance_score": seen.get(did, 0.0),
            "folder_name": r["folder_name"],
            "tags": tag_map.get(did, []),
        })

    return {
        "response": response_text,
        "provider": provider,
        "model": model_name,
        "sources": sources,
        "tokens_consumed": tokens_consumed,
        "latency_ms": latency_ms,
    }


@router.post("/api/chat")
def chat(body: ChatRequest):
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be blank")
    if len(message) > 4000:
        raise HTTPException(status_code=400, detail="Message max 4000 characters")
    return _run_chat(message=message, folder_id=body.folder_id, tag_id=body.tag_id)
