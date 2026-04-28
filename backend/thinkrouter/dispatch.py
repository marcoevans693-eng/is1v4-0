"""
dispatch.py — Core turn dispatch for IS1-TR.

Responsibilities:
  1. Load model config from thinkrouter_models.yaml
  2. Retrieve IS1 RAG chunks if corpus='is1' (folder-scoped)
  3. Build system context (RAG + included chats + attached files)
  4. Normalize conversation history for target provider
  5. Call provider API with user-selected model
  6. Return structured InferenceResult with token counts and cost

This is NOT a failover ladder. The user selects the exact model per turn.
If the selected provider fails, the error is returned to the client — no
automatic fallback.

Step-6 correction applied: system uses synchronous psycopg2, not asyncpg.
All DB access uses psycopg2 connections; all functions are synchronous.
"""
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional

import psycopg2
import psycopg2.extras
import yaml
from openai import OpenAI
import anthropic
import google.generativeai as genai

from backend.config import settings as _settings
from backend.services.caching import (
    build_anthropic_system_with_cache,
    extract_anthropic_cache_metrics,
    extract_openai_cache_metrics,
    extract_gemini_cache_metrics,
)
from backend.thinkrouter.context import (
    to_anthropic_messages,
    to_openai_messages,
    to_google_contents,
    build_system_context,
)


# ---------------------------------------------------------------------------
# Model config loader
# ---------------------------------------------------------------------------

_MODEL_CONFIG_CACHE: Optional[Dict] = None


def _load_model_config() -> Dict:
    global _MODEL_CONFIG_CACHE
    if _MODEL_CONFIG_CACHE is None:
        config_path = (
            Path(__file__).parent.parent.parent / "config" / "thinkrouter_models.yaml"
        )
        with open(config_path) as f:
            raw = yaml.safe_load(f)
        _MODEL_CONFIG_CACHE = {m["sku"]: m for m in raw["models"]}
    return _MODEL_CONFIG_CACHE


def get_model_config(sku: str) -> Optional[Dict]:
    return _load_model_config().get(sku)


# ---------------------------------------------------------------------------
# IS1 RAG retrieval (folder-scoped) — synchronous psycopg2
# ---------------------------------------------------------------------------

def retrieve_is1_chunks(
    query: str,
    folder_id: str,
    top_k: int = 20,
    token_budget: int = 30000,
) -> List[Dict]:
    """
    Folder-scoped semantic retrieval from IS1v3 knowledge base.
    Mirrors the retrieval flow in backend/routers/chat.py.
    Returns list of {"title": ..., "content": ...} dicts.
    """
    from qdrant_client import QdrantClient

    openai_client = OpenAI(api_key=_settings.OPENAI_API_KEY)
    qdrant_client = QdrantClient(host=_settings.QDRANT_HOST, port=_settings.QDRANT_PORT)

    # Embed query
    embed_resp = openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=query[:8000],
    )
    query_vector = embed_resp.data[0].embedding

    # Qdrant search against IS1v3 collection
    query_result = qdrant_client.query_points(
        collection_name="is1v4_knowledge",
        query=query_vector,
        limit=top_k,
        with_payload=True,
    )
    search_results = query_result.points

    if not search_results:
        return []

    # Extract unique document IDs in score order
    seen_doc_ids = []
    for hit in search_results:
        doc_id = (hit.payload or {}).get("document_id")
        if doc_id and doc_id not in seen_doc_ids:
            seen_doc_ids.append(doc_id)

    if not seen_doc_ids:
        return []

    # Fetch documents from Postgres with folder filter applied
    conn = psycopg2.connect(
        host=_settings.POSTGRES_HOST,
        port=_settings.POSTGRES_PORT,
        dbname=_settings.POSTGRES_DB,
        user=_settings.POSTGRES_USER,
        password=_settings.POSTGRES_PASSWORD,
    )
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT id::text, title, content
            FROM knowledge_documents
            WHERE id::text = ANY(%s::text[])
              AND folder_id = %s::uuid
            """,
            (seen_doc_ids, folder_id),
        )
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()

    if not rows:
        return []

    # Reorder by original score ranking
    row_map = {r["id"]: r for r in rows}
    ordered = [row_map[doc_id] for doc_id in seen_doc_ids if doc_id in row_map]

    # Assemble within token budget (rough 4 chars/token estimate)
    chunks = []
    total_chars = 0
    char_budget = token_budget * 4

    for row in ordered:
        if total_chars >= char_budget:
            break
        content = row["content"]
        if total_chars + len(content) > char_budget:
            content = content[: char_budget - total_chars]
        chunks.append({"title": row["title"], "content": content})
        total_chars += len(content)

    return chunks


# ---------------------------------------------------------------------------
# Cost calculation
# ---------------------------------------------------------------------------

def calculate_cost(model_config: Dict, tokens_in: int, tokens_out: int) -> Dict:
    cost_in = (tokens_in / 1000) * model_config.get("cost_per_1k_in", 0)
    cost_out = (tokens_out / 1000) * model_config.get("cost_per_1k_out", 0)
    return {
        "cost_in_usd": round(cost_in, 6),
        "cost_out_usd": round(cost_out, 6),
        "cost_total_usd": round(cost_in + cost_out, 6),
    }


# ---------------------------------------------------------------------------
# Provider dispatch — synchronous
# ---------------------------------------------------------------------------

def dispatch_anthropic(
    model_sku: str,
    model_config: Dict,
    turns: List[Dict],
    system_context: str,
) -> Dict:
    """Dispatch to Anthropic Claude."""
    client = anthropic.Anthropic(api_key=_settings.ANTHROPIC_API_KEY)
    messages = to_anthropic_messages(turns)

    kwargs = {
        "model": model_sku,
        "max_tokens": model_config.get("default_max_tokens", 4096),
        "messages": messages,
    }
    if system_context:
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
    }


def dispatch_openai(
    model_sku: str,
    model_config: Dict,
    turns: List[Dict],
    system_context: str,
) -> Dict:
    """Dispatch to OpenAI."""
    client = OpenAI(api_key=_settings.OPENAI_API_KEY)
    messages = to_openai_messages(turns, system_prompt=system_context or None)

    response = client.chat.completions.create(
        model=model_sku,
        max_tokens=model_config.get("default_max_tokens", 4096),
        messages=messages,
    )

    content = response.choices[0].message.content
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
    }


def dispatch_google(
    model_sku: str,
    model_config: Dict,
    turns: List[Dict],
    system_context: str,
) -> Dict:
    """Dispatch to Google Generative AI."""
    genai.configure(api_key=_settings.GOOGLE_API_KEY)
    model = genai.GenerativeModel(
        model_name=model_sku,
        system_instruction=system_context if system_context else None,
    )

    contents = to_google_contents(turns)
    response = model.generate_content(contents)

    content = response.text
    usage = response.usage_metadata
    tokens_in = usage.prompt_token_count
    tokens_out = usage.candidates_token_count

    # [PHASE2_CACHE] Gemini cache metrics stub (Phase 6)
    cache_metrics = extract_gemini_cache_metrics(None)

    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_cached": 0,
        **cache_metrics,
        **calculate_cost(model_config, tokens_in, tokens_out),
    }


# ---------------------------------------------------------------------------
# Main dispatch entry point — synchronous
# ---------------------------------------------------------------------------

_PROVIDER_DISPATCH = {
    "anthropic": dispatch_anthropic,
    "openai": dispatch_openai,
    "google": dispatch_google,
}

SYSTEM_PROMPT_BASE = (
    "You are a direct inference assistant. Answer the user's question thoughtfully "
    "and precisely. When IS1 knowledge base documents are provided as context, "
    "prioritize them in your response and cite them where relevant."
)


def dispatch_turn(
    model_sku: str,
    turns: List[Dict],
    corpus: str,
    is1_folder_id: Optional[str],
    included_chats: Optional[List[Dict]],
    attached_files: Optional[List[Dict]],
) -> Dict:
    """
    Main entry point. Called by the turns endpoint after the user turn is persisted.

    Returns:
        {
            content, provider, model_sku,
            tokens_in, tokens_out, tokens_cached,
            cost_in_usd, cost_out_usd, cost_total_usd,
            rag_chunk_count, system_prompt_hash,
            is1_folder_name,
            request_at, response_at, latency_ms
        }
    """
    model_config = get_model_config(model_sku)
    if not model_config:
        raise ValueError(f"Unknown model SKU: {model_sku}")

    provider = model_config["provider"]
    dispatch_fn = _PROVIDER_DISPATCH.get(provider)
    if not dispatch_fn:
        raise ValueError(f"No dispatch function for provider: {provider}")

    # Retrieve RAG chunks if corpus='is1'
    rag_chunks = []
    is1_folder_name = None
    if corpus == "is1" and is1_folder_id:
        # Get folder name for receipt snapshot
        conn = psycopg2.connect(
            host=_settings.POSTGRES_HOST,
            port=_settings.POSTGRES_PORT,
            dbname=_settings.POSTGRES_DB,
            user=_settings.POSTGRES_USER,
            password=_settings.POSTGRES_PASSWORD,
        )
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT name FROM folders WHERE id = %s::uuid", (is1_folder_id,))
            folder_row = cur.fetchone()
            if folder_row:
                is1_folder_name = folder_row["name"]
            cur.close()
        finally:
            conn.close()

        # Use the last user turn content as the retrieval query
        user_turns = [t for t in turns if t["role"] == "user"]
        query = user_turns[-1]["content"] if user_turns else ""

        rag_chunks = retrieve_is1_chunks(
            query=query,
            folder_id=is1_folder_id,
        )

    # Build system context
    system_context = build_system_context(
        rag_chunks=rag_chunks if rag_chunks else None,
        included_chats=included_chats,
        attached_files=attached_files,
    )

    # Prepend base system prompt
    full_system = SYSTEM_PROMPT_BASE
    if system_context:
        full_system = f"{SYSTEM_PROMPT_BASE}\n\n{system_context}"

    # System prompt hash for provenance
    system_prompt_hash = hashlib.sha256(full_system.encode()).hexdigest()

    # Dispatch
    request_at = datetime.now(timezone.utc)
    result = dispatch_fn(model_sku, model_config, turns, full_system)
    response_at = datetime.now(timezone.utc)
    latency_ms = int((response_at - request_at).total_seconds() * 1000)

    return {
        **result,
        "provider": provider,
        "model_sku": model_sku,
        "rag_chunk_count": len(rag_chunks),
        "is1_folder_name": is1_folder_name,
        "system_prompt_hash": system_prompt_hash[:64],
        "request_at": request_at,
        "response_at": response_at,
        "latency_ms": latency_ms,
    }
