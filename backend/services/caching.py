"""
backend/services/caching.py
IS1 v4.0 — Cache Service
Spec ref: IS1v4_0_System_Specification_v1.0 §2.8

Handles cache_control injection for Anthropic prompt caching.
Captures cache metrics from all provider responses.
CapaProxy (Phase 6) will wrap and extend this module.

Provider caching status:
  Anthropic: ACTIVE — ephemeral cache_control on system prompt block
  OpenAI/Grok: AUTO — provider handles it, we capture metrics only
  Gemini: STUBBED — full implementation deferred to Phase 6
  OpenRouter: NOT WIRED — replays/tests only, deferred
"""

import os
import logging

logger = logging.getLogger(__name__)

# Minimum chars before caching is worthwhile (~1024 tokens at 4 chars/token)
CACHE_MIN_CHARS = 4096

# Anthropic ephemeral cache_control block (5-min TTL, standard tier)
ANTHROPIC_CACHE_CONTROL = {"type": "ephemeral"}


def is_caching_enabled() -> bool:
    """Check CACHING_ENABLED env var. Defaults to true."""
    return os.getenv("CACHING_ENABLED", "true").lower() in ("true", "1", "yes")


# ---------------------------------------------------------------------------
# Anthropic cache_control injection
# ---------------------------------------------------------------------------

def build_anthropic_system_with_cache(system_text: str) -> list:
    """
    Convert a plain system prompt string into a content block list
    with cache_control attached when eligible.

    Anthropic accepts system as either a string or a list of content blocks.
    We use the block form to attach cache_control.

    The system block contains the full context: base prompt + RAG + included
    chats (all assembled by build_system_context before this is called).

    Returns:
        list of content blocks — pass directly as system= to Anthropic client.
    """
    if not system_text:
        return [{"type": "text", "text": ""}]

    block = {"type": "text", "text": system_text}

    if is_caching_enabled() and len(system_text) >= CACHE_MIN_CHARS:
        block["cache_control"] = ANTHROPIC_CACHE_CONTROL
        logger.debug(f"[cache] Anthropic system cache_control applied ({len(system_text)} chars)")
    else:
        logger.debug(f"[cache] Anthropic system cache_control skipped ({len(system_text)} chars)")

    return [block]


# ---------------------------------------------------------------------------
# Cache metrics extraction — one function per provider
# ---------------------------------------------------------------------------

def extract_anthropic_cache_metrics(usage_obj) -> dict:
    """
    Extract cache token counts from Anthropic response usage object.

    Anthropic SDK usage attributes (when caching active):
      usage.cache_creation_input_tokens  — tokens written to cache this call
      usage.cache_read_input_tokens      — tokens read from cache this call

    Args:
        usage_obj: response.usage object from Anthropic client

    Returns:
        dict with cache_creation_tokens, cache_read_tokens, provider_cache_type
    """
    if usage_obj is None:
        return _empty_cache_metrics("none")

    creation = getattr(usage_obj, "cache_creation_input_tokens", 0) or 0
    read = getattr(usage_obj, "cache_read_input_tokens", 0) or 0

    return {
        "cache_creation_tokens": creation,
        "cache_read_tokens": read,
        "provider_cache_type": "anthropic_ephemeral" if (creation or read) else "none",
    }


def extract_openai_cache_metrics(usage_obj) -> dict:
    """
    Extract cache token counts from OpenAI response usage object.

    OpenAI SDK usage attributes:
      usage.prompt_tokens_details.cached_tokens — tokens served from cache

    OpenAI caching is automatic (no config). Applied to prompts >1024 tokens
    seen within the same session. No cache_control needed.

    Args:
        usage_obj: response.usage object from OpenAI client

    Returns:
        dict with cache_creation_tokens, cache_read_tokens, provider_cache_type
    """
    if usage_obj is None:
        return _empty_cache_metrics("none")

    details = getattr(usage_obj, "prompt_tokens_details", None)
    cached = (getattr(details, "cached_tokens", 0) if details else 0) or 0

    return {
        "cache_creation_tokens": 0,
        "cache_read_tokens": cached,
        "provider_cache_type": "openai_auto" if cached else "none",
    }


def extract_gemini_cache_metrics(usage_obj) -> dict:
    """
    Gemini cache metrics stub.
    Full implementation deferred to Phase 6 (CapaProxy).
    """
    return _empty_cache_metrics("none")


def _empty_cache_metrics(cache_type: str = "none") -> dict:
    """Return zero-value cache metrics."""
    return {
        "cache_creation_tokens": 0,
        "cache_read_tokens": 0,
        "provider_cache_type": cache_type,
    }
