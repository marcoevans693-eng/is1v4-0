"""Health check endpoint — confirms connectivity to all three stores."""

from fastapi import APIRouter
import psycopg2
import duckdb
from qdrant_client import QdrantClient
from backend.config import settings

router = APIRouter()


@router.get("/api/health")
def health_check():
    status = {
        "status": "ok",
        "stores": {
            "postgres": {"connected": False, "database": settings.POSTGRES_DB},
            "qdrant": {"connected": False, "collection": settings.QDRANT_COLLECTION},
            "duckdb": {"connected": False, "path": settings.DUCKDB_PATH},
        },
    }

    # Postgres check
    try:
        conn = psycopg2.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            dbname=settings.POSTGRES_DB,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
        )
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM knowledge_documents")
        doc_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM folders")
        folder_count = cur.fetchone()[0]
        status["stores"]["postgres"]["connected"] = True
        status["stores"]["postgres"]["document_count"] = doc_count
        status["stores"]["postgres"]["folder_count"] = folder_count
        cur.close()
        conn.close()
    except Exception as e:
        status["stores"]["postgres"]["error"] = str(e)

    # Qdrant check
    try:
        client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        collection_info = client.get_collection(settings.QDRANT_COLLECTION)
        status["stores"]["qdrant"]["connected"] = True
        status["stores"]["qdrant"]["points_count"] = collection_info.points_count
    except Exception as e:
        status["stores"]["qdrant"]["error"] = str(e)

    # DuckDB check
    try:
        db = duckdb.connect(settings.DUCKDB_PATH, read_only=True)
        tables = db.execute("SHOW TABLES").fetchall()
        status["stores"]["duckdb"]["connected"] = True
        status["stores"]["duckdb"]["tables"] = [t[0] for t in tables]
        db.close()
    except Exception as e:
        status["stores"]["duckdb"]["error"] = str(e)

    # Overall status
    all_connected = all(
        s["connected"] for s in status["stores"].values()
    )
    status["status"] = "ok" if all_connected else "degraded"

    return status
