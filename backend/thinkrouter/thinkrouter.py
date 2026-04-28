"""
thinkrouter.py — IS1-TR conversation and turn endpoints.

Endpoints:
  GET  /api/thinkrouter/health
  GET  /api/thinkrouter/models
  GET  /api/thinkrouter/is1-folders
  POST /api/thinkrouter/conversations
  GET  /api/thinkrouter/conversations
  GET  /api/thinkrouter/conversations/{id}
  PATCH /api/thinkrouter/conversations/{id}
  DELETE /api/thinkrouter/conversations/{id}
  POST /api/thinkrouter/conversations/{id}/turns
  GET  /api/thinkrouter/conversations/{id}/turns/{turn_id}/receipt

Step-6 correction applied: system uses synchronous psycopg2 (no asyncpg, no get_db Depends).
config.py exports settings singleton (no get_settings function).
All endpoints use def (sync), psycopg2 connections opened/closed per request.
"""
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

import psycopg2
import psycopg2.extras
import yaml
import duckdb
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from backend.config import settings
from backend.thinkrouter.dispatch import dispatch_turn
from backend.thinkrouter.embedding import embed_and_upsert
from backend.thinkrouter.summarize import summarize_conversation

router = APIRouter(prefix="/api/thinkrouter", tags=["thinkrouter"])

DUCKDB_PATH = Path(__file__).parent.parent.parent / "data" / "duckdb" / "intellisys1_v4.duckdb"
JSONL_PATH = Path(__file__).parent.parent.parent / "data" / "jsonl" / "governance.jsonl"

TR_UPLOADS_DIR = "/opt/is1v4_0/data/tr_uploads"
ATTACHMENT_MAX_BYTES = 1 * 1024 * 1024  # 1 MB
ATTACHMENT_MAX_FILES = 5
ATTACHMENT_ALLOWED_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json", ".jsonl", ".yaml", ".yml",
    ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".xml",
    ".sql", ".log", ".sh", ".env", ".toml", ".ini", ".cfg"
}


# ---------------------------------------------------------------------------
# DB connection helper
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
# Upload endpoint
# ---------------------------------------------------------------------------

@router.post("/upload")
def upload_attachments(files: List[UploadFile] = File(...)):
    if len(files) > ATTACHMENT_MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {ATTACHMENT_MAX_FILES} files per upload."
        )

    results = []
    conn = get_conn()
    try:
        for upload in files:
            raw = upload.file.read()

            if len(raw) > ATTACHMENT_MAX_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail=f"{upload.filename} exceeds 1 MB limit."
                )

            ext = os.path.splitext(upload.filename or "")[1].lower()
            mime = upload.content_type or ""
            if not mime.startswith("text/") and ext not in ATTACHMENT_ALLOWED_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"{upload.filename} is not a supported text file type."
                )

            try:
                content_text = raw.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail=f"{upload.filename} could not be decoded as UTF-8 text."
                )

            file_id = str(uuid.uuid4())
            safe_name = os.path.basename(upload.filename or "file")
            storage_filename = f"{file_id}_{safe_name}"
            storage_path = os.path.join(TR_UPLOADS_DIR, storage_filename)
            with open(storage_path, "w", encoding="utf-8") as f:
                f.write(content_text)

            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO tr_attachments
                        (id, filename, file_size, mime_type, storage_path, content_text)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        file_id,
                        upload.filename,
                        len(raw),
                        mime or "text/plain",
                        storage_path,
                        content_text,
                    )
                )
            conn.commit()

            results.append({
                "id": file_id,
                "filename": upload.filename,
                "file_size": len(raw),
            })

    finally:
        conn.close()

    return {"attachments": results}


# ---------------------------------------------------------------------------
# RAG retrieval helper (IS1v3 folder-scoped)
# ---------------------------------------------------------------------------

def retrieve_rag_chunks(query_text: str, folder_id: str, top_k: int = 5) -> list[dict]:
    """
    Embed query_text and retrieve top-k chunks from is1v4_knowledge filtered to folder_id.
    Qdrant payload has no folder_id field — folder filter applied in Postgres after Qdrant search.
    Returns list of dicts with 'text' and 'source' keys.
    Returns empty list on any error — RAG failure must never block dispatch.
    """
    try:
        from openai import OpenAI
        from qdrant_client import QdrantClient

        openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        embed_resp = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=query_text[:8000],
        )
        query_vector = embed_resp.data[0].embedding

        qdrant = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        results = qdrant.query_points(
            collection_name="is1v4_knowledge",
            query=query_vector,
            limit=top_k * 4,
            with_payload=True,
        )

        doc_ids = []
        for point in results.points:
            doc_id = point.payload.get("document_id") if point.payload else None
            if doc_id and doc_id not in doc_ids:
                doc_ids.append(doc_id)

        if not doc_ids:
            return []

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                SELECT title, content
                FROM knowledge_documents
                WHERE id::text = ANY(%s::text[])
                  AND folder_id = %s::uuid
                LIMIT %s
                """,
                (doc_ids, folder_id, top_k),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            conn.close()

        return [
            {"text": r["content"][:2000], "source": r["title"]}
            for r in rows
        ]

    except Exception:
        return []


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CreateConversationRequest(BaseModel):
    title: str = "New Chat"


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None


class AppendTurnRequest(BaseModel):
    content: str
    model_sku: str
    corpus: str = "none"
    is1_folder_id: Optional[str] = None
    include_chat_ids: Optional[List[str]] = []
    attached_files: Optional[List[dict]] = []
    attachment_ids: list[str] = []


class IncludeRequest(BaseModel):
    target_conv_id: str
    include_mode: str  # 'summarize' | 'full' | 'reference'


class EditTurnRequest(BaseModel):
    content: str
    model_sku: str


class RegenerateRequest(BaseModel):
    model_sku: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _duckdb_write_receipt(turn_id: str, conversation_id: str, seq: int, result: dict):
    """Write receipt row to DuckDB. Non-fatal."""
    try:
        db = duckdb.connect(str(DUCKDB_PATH))
        db.execute("""
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
        ])
        db.close()
    except Exception as e:
        print(f"[duckdb receipt] non-fatal error: {e}", file=sys.stderr)


def _jsonl_append(event: dict):
    """Append governance event to JSONL. Non-fatal."""
    try:
        with open(JSONL_PATH, "a") as f:
            f.write(json.dumps(event) + "\n")
    except Exception as e:
        print(f"[jsonl] non-fatal error: {e}", file=sys.stderr)


def _load_model_list():
    config_path = Path(__file__).parent.parent.parent / "config" / "thinkrouter_models.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)["models"]


# ---------------------------------------------------------------------------
# Health + Models + IS1 Folders
# ---------------------------------------------------------------------------

@router.get("/health")
def thinkrouter_health():
    return {"status": "ok", "module": "IS1ThinkRouter", "version": "1.4.0"}


@router.get("/models")
def list_models():
    return _load_model_list()


@router.get("/is1-folders")
def list_is1_folders():
    """IS1v3 folder list for IS1FolderSelector. Excludes campaigns."""
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id::text, name, color, sort_order FROM folders ORDER BY sort_order ASC"
        )
        rows = cur.fetchall()
        cur.close()
        return [{"id": r["id"], "name": r["name"], "color": r["color"]} for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Conversations CRUD
# ---------------------------------------------------------------------------

@router.post("/conversations")
def create_conversation(body: CreateConversationRequest):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO tr_conversations (title)
            VALUES (%s)
            RETURNING id::text, title, pinned, archived, turn_count,
                      total_cost_usd, last_model_sku, created_at, updated_at
            """,
            (body.title,),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/conversations")
def list_conversations(
    archived: bool = False,
    limit: int = 100,
    offset: int = 0,
):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id::text, title, pinned, archived, turn_count,
                   total_cost_usd, last_model_sku, created_at, updated_at
            FROM tr_conversations
            WHERE archived = %s
            ORDER BY pinned DESC, updated_at DESC
            LIMIT %s OFFSET %s
            """,
            (archived, limit, offset),
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id::text, title, pinned, archived, turn_count,
                   total_cost_usd, last_model_sku, created_at, updated_at
            FROM tr_conversations WHERE id = %s::uuid
            """,
            (conversation_id,),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        cur.execute(
            """
            SELECT id::text, conversation_id::text, seq, role, content,
                   parent_turn_id::text, relation, superseded_by::text,
                   provider, model_sku, tokens_in, tokens_out, tokens_cached,
                   cost_usd, latency_ms, corpus, is1_folder_id::text,
                   attached_files, created_at
            FROM tr_turns
            WHERE conversation_id = %s::uuid
            ORDER BY seq ASC
            """,
            (conversation_id,),
        )
        turns = cur.fetchall()
        cur.close()
        return {**dict(conv), "turns": [dict(t) for t in turns]}
    except HTTPException:
        raise
    finally:
        conn.close()


@router.patch("/conversations/{conversation_id}")
def update_conversation(conversation_id: str, body: UpdateConversationRequest):
    conn = get_conn()
    try:
        cur = conn.cursor()
        if body.title is not None:
            cur.execute(
                "UPDATE tr_conversations SET title=%s, updated_at=NOW() WHERE id=%s::uuid",
                (body.title, conversation_id),
            )
        if body.pinned is not None:
            cur.execute(
                "UPDATE tr_conversations SET pinned=%s, updated_at=NOW() WHERE id=%s::uuid",
                (body.pinned, conversation_id),
            )
        conn.commit()
        cur.close()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM tr_conversations WHERE id=%s::uuid", (conversation_id,)
        )
        conn.commit()
        cur.close()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Include Chat endpoints
# ---------------------------------------------------------------------------

@router.post("/conversations/{conversation_id}/include")
def include_conversation(conversation_id: str, body: IncludeRequest):
    """
    Create or update a chat link between source_conv (conversation_id)
    and target_conv (body.target_conv_id).

    For 'summarize' mode: calls summarize_conversation() to produce a
    summary if one doesn't already exist for this link.

    Returns: link metadata + target conversation title.
    """
    if body.include_mode not in ("summarize", "full", "reference"):
        raise HTTPException(status_code=400, detail="include_mode must be summarize, full, or reference")

    if body.target_conv_id == conversation_id:
        raise HTTPException(status_code=400, detail="Cannot include a conversation in itself")

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id FROM tr_conversations WHERE id = %s::uuid",
                (conversation_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Source conversation not found")

            cur.execute(
                "SELECT id::text, title FROM tr_conversations WHERE id = %s::uuid",
                (body.target_conv_id,),
            )
            target = cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="Target conversation not found")

            target_title = target["title"]

            cur.execute(
                """
                SELECT id::text, include_mode, summary_text
                FROM tr_chat_links
                WHERE source_conv_id = %s::uuid
                  AND target_conv_id = %s::uuid
                  AND include_mode = %s
                """,
                (conversation_id, body.target_conv_id, body.include_mode),
            )
            existing = cur.fetchone()

            if existing:
                return {
                    "link_id": existing["id"],
                    "target_conv_id": body.target_conv_id,
                    "target_title": target_title,
                    "include_mode": existing["include_mode"],
                    "summary_text": existing["summary_text"],
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    # Create new link
    summary_text = None
    summary_model = None
    summary_tokens = None
    summary_cost_usd = None

    if body.include_mode == "summarize":
        try:
            result = summarize_conversation(body.target_conv_id)
            summary_text = result["summary_text"]
            summary_model = result["summary_model"]
            summary_tokens = result["summary_tokens"]
            summary_cost_usd = result["summary_cost_usd"]
        except Exception as e:
            print(f"[include] summarization failed: {e}", file=sys.stderr)
            raise HTTPException(status_code=502, detail=f"Summarization failed: {str(e)}")

    link_id = str(uuid.uuid4())

    conn2 = get_conn()
    try:
        with conn2.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tr_chat_links (
                    id, source_conv_id, target_conv_id,
                    include_mode, summary_text, summary_model,
                    summary_tokens, summary_cost_usd
                ) VALUES (
                    %s::uuid, %s::uuid, %s::uuid,
                    %s, %s, %s, %s, %s
                )
                """,
                (
                    link_id, conversation_id, body.target_conv_id,
                    body.include_mode, summary_text, summary_model,
                    summary_tokens, summary_cost_usd,
                ),
            )
            conn2.commit()
    except Exception as e:
        conn2.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn2.close()

    return {
        "link_id": link_id,
        "target_conv_id": body.target_conv_id,
        "target_title": target_title,
        "include_mode": body.include_mode,
        "summary_text": summary_text,
    }


@router.delete("/conversations/{conversation_id}/links/{target_conv_id}")
def remove_chat_link(conversation_id: str, target_conv_id: str):
    """
    Delete all tr_chat_links rows between source and target.
    Called when the user removes an included-chat pill.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM tr_chat_links
                WHERE source_conv_id = %s::uuid
                  AND target_conv_id = %s::uuid
                """,
                (conversation_id, target_conv_id),
            )
            conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    return {"ok": True}


# ---------------------------------------------------------------------------
# List Turns (non-superseded)
# ---------------------------------------------------------------------------

@router.get("/conversations/{conversation_id}/turns")
def list_turns(conversation_id: str):
    """Return all turns for a conversation ordered by seq."""
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id::text, conversation_id::text, seq, role, content,
                       superseded_by::text, provider, model_sku,
                       tokens_in, tokens_out, cost_usd, latency_ms, created_at::text
                FROM tr_turns
                WHERE conversation_id = %s::uuid
                ORDER BY seq ASC
                """,
                (conversation_id,),
            )
            rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"turns": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Edit Turn
# ---------------------------------------------------------------------------

@router.put("/conversations/{conversation_id}/turns/{turn_id}/edit")
def edit_turn(conversation_id: str, turn_id: str, body: EditTurnRequest):
    """
    Edit a user turn (append-only supersede).

    1. Validate turn exists, belongs to conversation, is a user turn, not superseded.
    2. Insert new user turn (seq = MAX(ALL seqs) + 1).
    3. Supersede the target turn and all subsequent non-superseded turns
       (set superseded_by = new user turn id).
    4. Build dispatch history from current non-superseded turns (includes new user turn).
    5. Dispatch to model.
    6. Insert new assistant turn (seq = MAX(ALL seqs) + 1).
    7. Return new user turn + new assistant turn.
    """
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Validate turn
            cur.execute(
                """
                SELECT id::text, seq, role, superseded_by
                FROM tr_turns
                WHERE id = %s::uuid AND conversation_id = %s::uuid
                """,
                (turn_id, conversation_id),
            )
            turn = cur.fetchone()
            if not turn:
                raise HTTPException(status_code=404, detail="Turn not found")
            if turn["role"] != "user":
                raise HTTPException(status_code=400, detail="Can only edit user turns")
            if turn["superseded_by"] is not None:
                raise HTTPException(status_code=400, detail="Turn already superseded")

            edit_seq = turn["seq"]

            # New user turn id and seq
            new_user_id = str(uuid.uuid4())
            cur.execute(
                "SELECT COALESCE(MAX(seq), 0) FROM tr_turns WHERE conversation_id = %s::uuid",
                (conversation_id,),
            )
            new_user_seq = cur.fetchone()["coalesce"] + 1

            # Insert new user turn
            cur.execute(
                """
                INSERT INTO tr_turns (id, conversation_id, seq, role, content, model_sku)
                VALUES (%s::uuid, %s::uuid, %s, 'user', %s, NULL)
                """,
                (new_user_id, conversation_id, new_user_seq, body.content),
            )

            # Supersede target turn and all subsequent non-superseded turns
            cur.execute(
                """
                UPDATE tr_turns
                SET superseded_by = %s::uuid
                WHERE conversation_id = %s::uuid
                  AND seq >= %s
                  AND superseded_by IS NULL
                  AND id != %s::uuid
                """,
                (new_user_id, conversation_id, edit_seq, new_user_id),
            )

            conn.commit()

            # Build history: all non-superseded turns including new user turn
            cur.execute(
                """
                SELECT role, content FROM tr_turns
                WHERE conversation_id = %s::uuid
                  AND superseded_by IS NULL
                ORDER BY seq ASC
                """,
                (conversation_id,),
            )
            history_rows = cur.fetchall()

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    turns_for_dispatch = [{"role": r["role"], "content": r["content"]} for r in history_rows]

    # Dispatch
    try:
        result = dispatch_turn(
            model_sku=body.model_sku,
            turns=turns_for_dispatch,
            corpus="none",
            is1_folder_id=None,
            included_chats=None,
            attached_files=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Insert new assistant turn
    new_asst_id = str(uuid.uuid4())
    conn2 = get_conn()
    try:
        with conn2.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT COALESCE(MAX(seq), 0) FROM tr_turns WHERE conversation_id = %s::uuid",
                (conversation_id,),
            )
            new_asst_seq = cur.fetchone()["coalesce"] + 1

            cur.execute(
                """
                INSERT INTO tr_turns (
                    id, conversation_id, seq, role, content, model_sku,
                    tokens_in, tokens_out, cost_usd, latency_ms
                ) VALUES (%s::uuid, %s::uuid, %s, 'assistant', %s, %s, %s, %s, %s, %s)
                RETURNING id::text, seq, role, content, model_sku,
                          tokens_in, tokens_out, cost_usd, latency_ms, created_at::text
                """,
                (
                    new_asst_id, conversation_id, new_asst_seq,
                    result["content"], body.model_sku,
                    result.get("tokens_in"), result.get("tokens_out"),
                    result.get("cost_total_usd"), result.get("latency_ms"),
                ),
            )
            asst_row = dict(cur.fetchone())
            conn2.commit()
    except Exception as e:
        conn2.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn2.close()

    return {
        "user_turn": {
            "id": new_user_id,
            "seq": new_user_seq,
            "role": "user",
            "content": body.content,
        },
        "assistant_turn": asst_row,
    }


# ---------------------------------------------------------------------------
# Regenerate Turn
# ---------------------------------------------------------------------------

@router.post("/conversations/{conversation_id}/turns/{turn_id}/regenerate")
def regenerate_turn(conversation_id: str, turn_id: str, body: RegenerateRequest):
    """
    Regenerate an assistant turn (append-only supersede).

    1. Validate turn exists, belongs to conversation, is an assistant turn, not superseded.
    2. Build dispatch history from non-superseded turns with seq < target turn's seq
       (the conversation up to but not including the old assistant response).
    3. Dispatch to model.
    4. Insert new assistant turn (seq = MAX(ALL seqs) + 1).
    5. Supersede old assistant turn and all subsequent non-superseded turns
       (set superseded_by = new assistant turn id).
    6. Return new assistant turn.
    """
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Validate turn
            cur.execute(
                """
                SELECT id::text, seq, role, superseded_by
                FROM tr_turns
                WHERE id = %s::uuid AND conversation_id = %s::uuid
                """,
                (turn_id, conversation_id),
            )
            turn = cur.fetchone()
            if not turn:
                raise HTTPException(status_code=404, detail="Turn not found")
            if turn["role"] != "assistant":
                raise HTTPException(status_code=400, detail="Can only regenerate assistant turns")
            if turn["superseded_by"] is not None:
                raise HTTPException(status_code=400, detail="Turn already superseded")

            regen_seq = turn["seq"]

            # History: non-superseded turns strictly before the old assistant turn
            cur.execute(
                """
                SELECT role, content FROM tr_turns
                WHERE conversation_id = %s::uuid
                  AND superseded_by IS NULL
                  AND seq < %s
                ORDER BY seq ASC
                """,
                (conversation_id, regen_seq),
            )
            history_rows = cur.fetchall()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    if not history_rows:
        raise HTTPException(status_code=400, detail="No history to regenerate from")

    turns_for_dispatch = [{"role": r["role"], "content": r["content"]} for r in history_rows]

    # Dispatch
    try:
        result = dispatch_turn(
            model_sku=body.model_sku,
            turns=turns_for_dispatch,
            corpus="none",
            is1_folder_id=None,
            included_chats=None,
            attached_files=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Insert new assistant turn and supersede old
    new_asst_id = str(uuid.uuid4())
    conn2 = get_conn()
    try:
        with conn2.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT COALESCE(MAX(seq), 0) FROM tr_turns WHERE conversation_id = %s::uuid",
                (conversation_id,),
            )
            new_asst_seq = cur.fetchone()["coalesce"] + 1

            cur.execute(
                """
                INSERT INTO tr_turns (
                    id, conversation_id, seq, role, content, model_sku,
                    tokens_in, tokens_out, cost_usd, latency_ms
                ) VALUES (%s::uuid, %s::uuid, %s, 'assistant', %s, %s, %s, %s, %s, %s)
                RETURNING id::text, seq, role, content, model_sku,
                          tokens_in, tokens_out, cost_usd, latency_ms, created_at::text
                """,
                (
                    new_asst_id, conversation_id, new_asst_seq,
                    result["content"], body.model_sku,
                    result.get("tokens_in"), result.get("tokens_out"),
                    result.get("cost_total_usd"), result.get("latency_ms"),
                ),
            )
            asst_row = dict(cur.fetchone())

            # Supersede old assistant turn and all subsequent non-superseded turns
            cur.execute(
                """
                UPDATE tr_turns
                SET superseded_by = %s::uuid
                WHERE conversation_id = %s::uuid
                  AND seq >= %s
                  AND superseded_by IS NULL
                  AND id != %s::uuid
                """,
                (new_asst_id, conversation_id, regen_seq, new_asst_id),
            )

            conn2.commit()
    except Exception as e:
        conn2.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn2.close()

    return {"assistant_turn": asst_row}


# ---------------------------------------------------------------------------
# Turn Append — Main Dispatch Flow
# ---------------------------------------------------------------------------

@router.post("/conversations/{conversation_id}/turns")
def append_turn(
    conversation_id: str,
    body: AppendTurnRequest,
):
    # --- Validate conversation exists ---
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id::text, turn_count FROM tr_conversations WHERE id=%s::uuid",
            (conversation_id,),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        # --- Validate corpus/folder combination ---
        if body.corpus == "is1" and not body.is1_folder_id:
            raise HTTPException(
                status_code=400,
                detail="is1_folder_id is required when corpus='is1'"
            )

        if body.corpus == "is1" and body.is1_folder_id:
            cur.execute(
                "SELECT id FROM folders WHERE id=%s::uuid", (body.is1_folder_id,)
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="IS1 folder not found")

        # --- Resolve attachment content ---
        user_content = body.content
        if body.attachment_ids:
            conn_att = get_conn()
            try:
                with conn_att.cursor() as cur_att:
                    placeholders = ",".join(["%s"] * len(body.attachment_ids))
                    cur_att.execute(
                        f"SELECT filename, content_text FROM tr_attachments WHERE id IN ({placeholders})",
                        body.attachment_ids
                    )
                    att_rows = cur_att.fetchall()
            finally:
                conn_att.close()

            if att_rows:
                att_blocks = "\n\n".join(
                    f"[Attached file: {r[0]}]\n{r[1]}"
                    for r in att_rows
                )
                user_content = f"{user_content}\n\n---\n{att_blocks}"

        # --- Persist user turn ---
        cur.execute(
            "SELECT COALESCE(MAX(seq), 0) AS max_seq FROM tr_turns WHERE conversation_id = %s::uuid",
            (conversation_id,),
        )
        max_seq_row = cur.fetchone()
        current_seq = max_seq_row["max_seq"]
        user_seq = current_seq + 1
        user_turn_id = str(uuid.uuid4())

        cur.execute(
            """
            INSERT INTO tr_turns (
                id, conversation_id, seq, role, content,
                corpus, is1_folder_id, attached_files
            ) VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::uuid, %s)
            """,
            (
                user_turn_id, conversation_id, user_seq, "user", user_content,
                body.corpus,
                body.is1_folder_id if body.corpus == "is1" else None,
                json.dumps(body.attached_files) if body.attached_files else None,
            ),
        )
        conn.commit()
        cur.close()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    # JSONL user turn event
    _jsonl_append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": "tr_turn",
        "turn_id": user_turn_id,
        "conversation_id": conversation_id,
        "seq": user_seq,
        "role": "user",
        "corpus": body.corpus,
        "is1_folder_id": body.is1_folder_id,
    })

    # --- Load full conversation history (non-superseded turns only) ---
    conn2 = get_conn()
    try:
        cur2 = conn2.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur2.execute(
            """
            SELECT role, content FROM tr_turns
            WHERE conversation_id=%s::uuid
              AND superseded_by IS NULL
            ORDER BY seq ASC
            """,
            (conversation_id,),
        )
        history_rows = cur2.fetchall()
        cur2.close()
    finally:
        conn2.close()

    turns_for_dispatch = [{"role": r["role"], "content": r["content"]} for r in history_rows]

    # --- Resolve included chats ---
    included_chats_context = []
    if body.include_chat_ids:
        conn_inc = get_conn()
        try:
            with conn_inc.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur_inc:
                for target_id in body.include_chat_ids:
                    cur_inc.execute(
                        """
                        SELECT include_mode, summary_text
                        FROM tr_chat_links
                        WHERE source_conv_id = %s::uuid
                          AND target_conv_id = %s::uuid
                        ORDER BY created_at DESC LIMIT 1
                        """,
                        (conversation_id, target_id),
                    )
                    link = cur_inc.fetchone()
                    if not link:
                        continue

                    cur_inc.execute(
                        "SELECT title FROM tr_conversations WHERE id = %s::uuid",
                        (target_id,),
                    )
                    target_conv = cur_inc.fetchone()
                    title = target_conv["title"] if target_conv else "Prior Chat"

                    if link["include_mode"] == "summarize" and link["summary_text"]:
                        included_chats_context.append({
                            "title": title,
                            "payload": link["summary_text"],
                        })
                    elif link["include_mode"] == "full":
                        cur_inc.execute(
                            """
                            SELECT role, content FROM tr_turns
                            WHERE conversation_id = %s::uuid
                              AND superseded_by IS NULL
                            ORDER BY seq ASC
                            """,
                            (target_id,),
                        )
                        target_turns = cur_inc.fetchall()
                        lines = [
                            f"[{'User' if t['role'] == 'user' else 'Assistant'}]: {t['content']}"
                            for t in target_turns
                        ]
                        included_chats_context.append({
                            "title": title,
                            "payload": "\n\n".join(lines),
                        })
                    # reference mode: no content injection
        except Exception as e:
            print(f"[append_turn] include resolution error (non-fatal): {e}", file=sys.stderr)
        finally:
            conn_inc.close()

    # --- Dispatch to model ---
    try:
        result = dispatch_turn(
            model_sku=body.model_sku,
            turns=turns_for_dispatch,
            corpus=body.corpus,
            is1_folder_id=body.is1_folder_id,
            included_chats=included_chats_context if included_chats_context else None,
            attached_files=body.attached_files if body.attached_files else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Provider error: {str(e)}")

    # --- Persist assistant turn ---
    assistant_seq = user_seq + 1
    assistant_turn_id = str(uuid.uuid4())

    conn3 = get_conn()
    try:
        cur3 = conn3.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur3.execute(
            """
            INSERT INTO tr_turns (
                id, conversation_id, seq, role, content,
                provider, model_sku, tokens_in, tokens_out, tokens_cached,
                cost_usd, latency_ms, corpus, is1_folder_id
            ) VALUES (
                %s::uuid, %s::uuid, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s::uuid
            )
            """,
            (
                assistant_turn_id, conversation_id, assistant_seq,
                "assistant", result["content"],
                result["provider"], result["model_sku"],
                result["tokens_in"], result["tokens_out"], result["tokens_cached"],
                result["cost_total_usd"], result["latency_ms"],
                body.corpus,
                body.is1_folder_id if body.corpus == "is1" else None,
            ),
        )

        # Update conversation counters
        cur3.execute(
            """
            UPDATE tr_conversations
            SET turn_count = %s,
                total_cost_usd = total_cost_usd + %s,
                last_model_sku = %s,
                updated_at = NOW()
            WHERE id = %s::uuid
            """,
            (assistant_seq, result["cost_total_usd"], result["model_sku"], conversation_id),
        )

        # Get conversation title for embedding payload
        cur3.execute(
            "SELECT title FROM tr_conversations WHERE id=%s::uuid", (conversation_id,)
        )
        conv_title_row = cur3.fetchone()
        conn3.commit()
        cur3.close()
    except Exception as e:
        conn3.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to persist assistant turn: {str(e)}")
    finally:
        conn3.close()

    # --- DuckDB receipt (non-fatal) ---
    _duckdb_write_receipt(
        turn_id=assistant_turn_id,
        conversation_id=conversation_id,
        seq=assistant_seq,
        result={
            **result,
            "corpus": body.corpus,
            "is1_folder_id": body.is1_folder_id,
            "attached_files_count": len(body.attached_files) if body.attached_files else 0,
            "included_chats_count": len(included_chats_context),
        },
    )

    # --- JSONL assistant turn event (non-fatal) ---
    _jsonl_append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": "tr_turn",
        "turn_id": assistant_turn_id,
        "conversation_id": conversation_id,
        "seq": assistant_seq,
        "role": "assistant",
        "provider": result["provider"],
        "model_sku": result["model_sku"],
        "tokens_in": result["tokens_in"],
        "tokens_out": result["tokens_out"],
        "cost_usd": result["cost_total_usd"],
        "corpus": body.corpus,
        "is1_folder_id": body.is1_folder_id,
        "rag_chunk_count": result.get("rag_chunk_count", 0),
        "latency_ms": result["latency_ms"],
    })

    # --- Qdrant embedding (non-fatal) ---
    embed_and_upsert(
        turn_id=assistant_turn_id,
        conversation_id=conversation_id,
        seq=assistant_seq,
        role="assistant",
        content=result["content"],
        model_sku=result["model_sku"],
        conv_title=conv_title_row["title"] if conv_title_row else "",
        created_at=datetime.now(timezone.utc),
        settings=settings,
    )

    # --- Return both turns ---
    return {
        "user_turn": {
            "id": user_turn_id,
            "seq": user_seq,
            "role": "user",
            "content": user_content,
        },
        "assistant_turn": {
            "id": assistant_turn_id,
            "seq": assistant_seq,
            "role": "assistant",
            "content": result["content"],
            "provider": result["provider"],
            "model_sku": result["model_sku"],
            "tokens_in": result["tokens_in"],
            "tokens_out": result["tokens_out"],
            "cost_total_usd": result["cost_total_usd"],
            "latency_ms": result["latency_ms"],
            "rag_chunk_count": result.get("rag_chunk_count", 0),
            "is1_folder_name": result.get("is1_folder_name"),
        },
    }


# ---------------------------------------------------------------------------
# Receipt detail
# ---------------------------------------------------------------------------

@router.get("/conversations/{conversation_id}/turns/{turn_id}/receipt")
def get_receipt(conversation_id: str, turn_id: str):
    """Fetch full receipt from DuckDB by turn_id."""
    try:
        db = duckdb.connect(str(DUCKDB_PATH))
        row = db.execute(
            "SELECT * FROM tr_receipts WHERE turn_id = ?", [turn_id]
        ).fetchone()
        db.close()
        if not row:
            raise HTTPException(status_code=404, detail="Receipt not found")
        cols = [
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
        ]
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Usage Dashboard endpoints
# ---------------------------------------------------------------------------

@router.get("/usage/summary")
def usage_summary():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  COALESCE(SUM(cost_usd), 0)      AS total_cost_usd,
                  COALESCE(SUM(tokens_in), 0)     AS total_tokens_in,
                  COALESCE(SUM(tokens_out), 0)    AS total_tokens_out,
                  COUNT(*)                         AS total_turns
                FROM tr_turns
                WHERE role = 'assistant' AND superseded_by IS NULL
                """
            )
            row = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM tr_conversations")
            conv_count = cur.fetchone()[0]
    finally:
        conn.close()
    return {
        "total_cost_usd": float(row[0]),
        "total_tokens_in": int(row[1]),
        "total_tokens_out": int(row[2]),
        "total_turns": int(row[3]),
        "total_conversations": int(conv_count),
    }


@router.get("/usage/by-model")
def usage_by_model():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  model_sku,
                  COALESCE(SUM(cost_usd), 0)   AS total_cost_usd,
                  COALESCE(SUM(tokens_in), 0)  AS total_tokens_in,
                  COALESCE(SUM(tokens_out), 0) AS total_tokens_out,
                  COUNT(*)                      AS turn_count
                FROM tr_turns
                WHERE role = 'assistant' AND superseded_by IS NULL
                  AND model_sku IS NOT NULL
                GROUP BY model_sku
                ORDER BY total_cost_usd DESC
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return {
        "models": [
            {
                "model_sku": r[0],
                "total_cost_usd": float(r[1]),
                "total_tokens_in": int(r[2]),
                "total_tokens_out": int(r[3]),
                "turn_count": int(r[4]),
            }
            for r in rows
        ]
    }


@router.get("/usage/by-conversation")
def usage_by_conversation():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  c.id::text                        AS conversation_id,
                  c.title,
                  COALESCE(SUM(t.cost_usd), 0)     AS total_cost_usd,
                  COALESCE(SUM(t.tokens_in), 0)    AS total_tokens_in,
                  COALESCE(SUM(t.tokens_out), 0)   AS total_tokens_out,
                  COUNT(t.id)                       AS turn_count,
                  c.created_at
                FROM tr_conversations c
                LEFT JOIN tr_turns t
                  ON t.conversation_id = c.id
                  AND t.role = 'assistant'
                  AND t.superseded_by IS NULL
                GROUP BY c.id, c.title, c.created_at
                ORDER BY total_cost_usd DESC
                LIMIT 50
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return {
        "conversations": [
            {
                "conversation_id": r[0],
                "title": r[1],
                "total_cost_usd": float(r[2]),
                "total_tokens_in": int(r[3]),
                "total_tokens_out": int(r[4]),
                "turn_count": int(r[5]),
                "created_at": r[6].isoformat() if r[6] else None,
            }
            for r in rows
        ]
    }


@router.get("/usage/daily")
def usage_daily():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  DATE(created_at AT TIME ZONE 'UTC') AS day,
                  COALESCE(SUM(cost_usd), 0)          AS cost_usd,
                  COUNT(*)                             AS turn_count
                FROM tr_turns
                WHERE role = 'assistant'
                  AND superseded_by IS NULL
                  AND created_at >= NOW() - INTERVAL '30 days'
                GROUP BY day
                ORDER BY day ASC
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return {
        "days": [
            {
                "date": str(r[0]),
                "cost_usd": float(r[1]),
                "turn_count": int(r[2]),
            }
            for r in rows
        ]
    }
