"""
summarize.py — One-shot conversation summarization for Include Chat (summarize mode).

Fetches all non-superseded turns of a target conversation and produces a
<=500 token summary using claude-sonnet-4-6.

Cost: ~$0.02 per call (one-time, cached in tr_chat_links.summary_text).
"""
import sys
from typing import Optional

import anthropic
import psycopg2
import psycopg2.extras

from backend.config import settings

SUMMARY_MODEL = "claude-sonnet-4-6"
SUMMARY_PROMPT = (
    "Summarize this conversation in 500 tokens or fewer. "
    "Preserve all key decisions, conclusions, technical details, and specific facts. "
    "Be dense and precise — this summary will be injected as context into a future conversation."
)


def _get_conn():
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


def summarize_conversation(conversation_id: str) -> dict:
    """
    Fetch all non-superseded turns of `conversation_id`, build a transcript,
    and produce a summary via claude-sonnet-4-6.

    Returns:
        {
            "summary_text": str,
            "summary_model": str,
            "summary_tokens": int,
            "summary_cost_usd": float,
        }

    Raises:
        ValueError: if conversation not found or has no turns
        Exception: on provider failure
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT title FROM tr_conversations WHERE id = %s::uuid",
                (conversation_id,),
            )
            conv = cur.fetchone()
            if not conv:
                raise ValueError(f"Conversation not found: {conversation_id}")

            cur.execute(
                """
                SELECT role, content FROM tr_turns
                WHERE conversation_id = %s::uuid
                  AND superseded_by IS NULL
                ORDER BY seq ASC
                """,
                (conversation_id,),
            )
            turns = cur.fetchall()
    finally:
        conn.close()

    if not turns:
        raise ValueError(f"Conversation has no turns: {conversation_id}")

    # Build transcript
    lines = []
    for t in turns:
        role_label = "User" if t["role"] == "user" else "Assistant"
        lines.append(f"[{role_label}]: {t['content']}")
    transcript = "\n\n".join(lines)

    # Truncate transcript to ~100k chars to stay within context window
    if len(transcript) > 100_000:
        transcript = transcript[:100_000] + "\n\n[transcript truncated]"

    # Call Anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=SUMMARY_MODEL,
        max_tokens=600,
        system=SUMMARY_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Conversation title: {conv['title']}\n\n{transcript}",
            }
        ],
    )

    summary_text = response.content[0].text
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens

    # Cost: claude-sonnet-4-6 at $3/$15 per MTok
    cost_in = (tokens_in / 1_000_000) * 3.00
    cost_out = (tokens_out / 1_000_000) * 15.00
    cost_total = round(cost_in + cost_out, 6)

    return {
        "summary_text": summary_text,
        "summary_model": SUMMARY_MODEL,
        "summary_tokens": tokens_in + tokens_out,
        "summary_cost_usd": cost_total,
    }
