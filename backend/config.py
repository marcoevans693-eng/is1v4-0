"""IS1v3 configuration loader."""

import os
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()


def _parse_dsn(dsn: str):
    """Parse postgresql://user:pass@host:port/dbname into components."""
    p = urlparse(dsn)
    return {
        "host": p.hostname or "127.0.0.1",
        "port": p.port or 5432,
        "dbname": (p.path or "/postgres").lstrip("/"),
        "user": p.username or "postgres",
        "password": p.password or "",
    }


class Settings:
    # Postgres — prefer individual env vars, fall back to parsing POSTGRES_DSN
    _dsn = os.getenv("POSTGRES_DSN", "")
    _parsed = _parse_dsn(_dsn) if _dsn else {}

    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", _parsed.get("host", "127.0.0.1"))
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", str(_parsed.get("port", 5432))))
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", _parsed.get("dbname", "is1v4_0"))
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", _parsed.get("user", "postgres"))
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", _parsed.get("password", ""))

    # Qdrant
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "127.0.0.1")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION", "is1v4_knowledge")

    # DuckDB
    DUCKDB_PATH: str = os.getenv("DUCKDB_PATH", "data/duckdb/is1v4_0.duckdb")

    # API Keys (loaded from .env, never printed)
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")


settings = Settings()
