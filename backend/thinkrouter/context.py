"""
context.py — Provider message format normalizers for IS1-TR.

Each provider expects a different message structure:
  Anthropic: list of {"role": ..., "content": ...}
  OpenAI:    list of {"role": ..., "content": ...}  (same wire shape, different SDK)
  Google:    list of {"role": "user"|"model", "parts": [{"text": ...}]}

Only the current (non-superseded) turns are passed in.
System context (RAG chunks, included chats, attached files) is prepended
by dispatch.py before calling these normalizers.
"""
from typing import List, Dict


def to_anthropic_messages(turns: List[Dict]) -> List[Dict]:
    """Convert IS1-TR turns to Anthropic messages format."""
    return [
        {"role": t["role"], "content": t["content"]}
        for t in turns
    ]


def to_openai_messages(turns: List[Dict], system_prompt: str = None) -> List[Dict]:
    """Convert IS1-TR turns to OpenAI chat messages format."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for t in turns:
        messages.append({"role": t["role"], "content": t["content"]})
    return messages


def to_google_contents(turns: List[Dict]) -> List[Dict]:
    """Convert IS1-TR turns to Google Generative AI contents format."""
    google_role_map = {"user": "user", "assistant": "model"}
    return [
        {
            "role": google_role_map.get(t["role"], t["role"]),
            "parts": [{"text": t["content"]}]
        }
        for t in turns
    ]


def build_system_context(
    rag_chunks: List[Dict] = None,
    included_chats: List[Dict] = None,
    attached_files: List[Dict] = None,
) -> str:
    """
    Assemble the system context block prepended to the conversation.
    Injection order: RAG chunks -> included chats -> attached files.
    Returns empty string if nothing to inject.
    """
    parts = []

    if rag_chunks:
        chunk_text = "\n\n".join(
            f"[Source: {c.get('title', 'Document')}]\n{c['content']}"
            for c in rag_chunks
        )
        parts.append(
            f"The following documents are retrieved from the IS1 knowledge base "
            f"and are relevant to the user's query. Answer using these sources.\n\n"
            f"{chunk_text}"
        )

    if included_chats:
        for ic in included_chats:
            parts.append(
                f"[Included past conversation: {ic.get('title', 'Prior Chat')}]\n"
                f"{ic['payload']}"
            )

    if attached_files:
        for af in attached_files:
            parts.append(
                f"[Attached file: {af['filename']}]\n{af['content']}\n[End of file]"
            )

    return "\n\n---\n\n".join(parts)
