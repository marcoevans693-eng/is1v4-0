"""
embedding.py — Embed IS1-TR turns and upsert to Qdrant is1v4_knowledge collection.

Uses OpenAI text-embedding-3-small (1536-dim, cosine) — same model as IS1v3.
One Qdrant point per assistant turn. User turns are not embedded.
Failures are non-fatal: logged to stderr, never block turn persistence.
"""
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

COLLECTION = "is1v4_knowledge"
EMBEDDING_MODEL = "text-embedding-3-small"


def _get_clients(settings):
    openai = OpenAI(api_key=settings.OPENAI_API_KEY)
    qdrant = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return openai, qdrant


def embed_and_upsert(
    turn_id: str,
    conversation_id: str,
    seq: int,
    role: str,
    content: str,
    model_sku: str,
    conv_title: str,
    created_at: datetime,
    settings,
) -> bool:
    """
    Embed a single turn and upsert to Qdrant.
    Only embeds assistant turns (role == 'assistant').
    Returns True on success, False on any failure.
    """
    if role != "assistant":
        return True  # skip user turns — not embedded per spec

    try:
        openai_client, qdrant_client = _get_clients(settings)

        response = openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=content[:8000],  # guard against oversized turns
        )
        vector = response.data[0].embedding

        # Deterministic UUID5 point ID from turn_id (consistent with IS1v3 pattern)
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"is1tr:{turn_id}"))

        qdrant_client.upsert(
            collection_name=COLLECTION,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "turn_id": turn_id,
                        "conversation_id": conversation_id,
                        "seq": seq,
                        "role": role,
                        "model_sku": model_sku,
                        "conv_title": conv_title,
                        "created_at": created_at.isoformat()
                        if isinstance(created_at, datetime)
                        else str(created_at),
                    },
                )
            ],
        )
        return True

    except Exception as e:
        print(f"[embedding] non-fatal error on turn {turn_id}: {e}", file=sys.stderr)
        return False
