"""Tag CRUD endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import psycopg2
import psycopg2.extras
from backend.config import settings

router = APIRouter()


def get_conn():
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#a8c5da"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


@router.get("/api/tags")
def list_tags():
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT t.id, t.name, t.color, t.created_at,
                   COUNT(dt.document_id) AS document_count
            FROM tags t
            LEFT JOIN document_tags dt ON dt.tag_id = t.id
            GROUP BY t.id, t.name, t.color, t.created_at
            ORDER BY t.name
        """)
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("/api/tags", status_code=201)
def create_tag(body: TagCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name cannot be blank")
    if len(name) > 50:
        raise HTTPException(status_code=400, detail="Tag name max 50 characters")
    color = body.color or "#a8c5da"

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Check duplicate (case-insensitive)
        cur.execute("SELECT id FROM tags WHERE LOWER(name) = LOWER(%s)", (name,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail=f"Tag '{name}' already exists")
        cur.execute(
            "INSERT INTO tags (name, color) VALUES (%s, %s) RETURNING id, name, color, created_at",
            (name, color),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return dict(row)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/api/tags/{tag_id}")
def update_tag(tag_id: str, body: TagUpdate):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name, color FROM tags WHERE id = %s", (tag_id,))
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found")

        new_name = body.name.strip() if body.name is not None else existing["name"]
        new_color = body.color if body.color is not None else existing["color"]

        if not new_name:
            raise HTTPException(status_code=400, detail="Tag name cannot be blank")
        if len(new_name) > 50:
            raise HTTPException(status_code=400, detail="Tag name max 50 characters")

        # Check duplicate (exclude self)
        cur.execute(
            "SELECT id FROM tags WHERE LOWER(name) = LOWER(%s) AND id != %s",
            (new_name, tag_id),
        )
        if cur.fetchone():
            raise HTTPException(status_code=400, detail=f"Tag '{new_name}' already exists")

        cur.execute(
            "UPDATE tags SET name = %s, color = %s WHERE id = %s RETURNING id, name, color, created_at",
            (new_name, new_color, tag_id),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return dict(row)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/api/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM tags WHERE id = %s", (tag_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Tag not found")
        # Cascade via FK in document_tags, but delete explicitly for clarity
        cur.execute("DELETE FROM document_tags WHERE tag_id = %s", (tag_id,))
        cur.execute("DELETE FROM tags WHERE id = %s", (tag_id,))
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
