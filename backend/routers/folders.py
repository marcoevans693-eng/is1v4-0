"""Folder CRUD endpoints — IS1v3.1 Phase 5
   Changes:
   - GET /api/folders: ORDER BY sort_order ASC, created_at ASC (gate 13)
   - PUT /api/folders/{id}: accepts sort_order in payload
   - PATCH /api/folders/reorder: bulk update sort_order (gate 14)
   - All SELECT queries now return sort_order + last_accessed_at
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
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


class FolderCreate(BaseModel):
    name: str
    color: Optional[str] = "#e8e8e8"


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class ReorderRequest(BaseModel):
    folders: List[ReorderItem]


@router.get("/api/folders")
def list_folders():
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT f.id, f.name, f.color, f.created_at, f.updated_at,
                   f.sort_order, f.last_accessed_at,
                   COUNT(kd.id) AS document_count
            FROM folders f
            LEFT JOIN knowledge_documents kd ON kd.folder_id = f.id
            GROUP BY f.id, f.name, f.color, f.created_at, f.updated_at,
                     f.sort_order, f.last_accessed_at
            ORDER BY f.sort_order ASC, f.created_at ASC
        """)
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("/api/folders", status_code=201)
def create_folder(body: FolderCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be blank")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Folder name max 100 characters")
    color = body.color or "#e8e8e8"

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM folders WHERE LOWER(name) = LOWER(%s)", (name,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail=f"Folder '{name}' already exists")
        # Set sort_order to max + 1 so new folders appear at the end
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM folders")
        next_order = cur.fetchone()["next_order"]
        cur.execute(
            """INSERT INTO folders (name, color, sort_order)
               VALUES (%s, %s, %s)
               RETURNING id, name, color, sort_order, last_accessed_at, created_at, updated_at""",
            (name, color, next_order),
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


@router.put("/api/folders/{folder_id}")
def update_folder(folder_id: str, body: FolderUpdate):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, name, color, sort_order FROM folders WHERE id = %s",
            (folder_id,),
        )
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Folder not found")

        new_name = body.name.strip() if body.name is not None else existing["name"]
        new_color = body.color if body.color is not None else existing["color"]
        new_sort_order = body.sort_order if body.sort_order is not None else existing["sort_order"]

        if not new_name:
            raise HTTPException(status_code=400, detail="Folder name cannot be blank")
        if len(new_name) > 100:
            raise HTTPException(status_code=400, detail="Folder name max 100 characters")

        cur.execute(
            "SELECT id FROM folders WHERE LOWER(name) = LOWER(%s) AND id != %s",
            (new_name, folder_id),
        )
        if cur.fetchone():
            raise HTTPException(status_code=400, detail=f"Folder '{new_name}' already exists")

        cur.execute(
            """UPDATE folders SET name = %s, color = %s, sort_order = %s
               WHERE id = %s
               RETURNING id, name, color, sort_order, last_accessed_at, created_at, updated_at""",
            (new_name, new_color, new_sort_order, folder_id),
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


@router.patch("/api/folders/reorder")
def reorder_folders(body: ReorderRequest):
    """Bulk update sort_order for multiple folders in a single transaction."""
    if not body.folders:
        raise HTTPException(status_code=400, detail="No folders provided")

    conn = get_conn()
    try:
        cur = conn.cursor()
        for item in body.folders:
            cur.execute(
                "UPDATE folders SET sort_order = %s WHERE id = %s",
                (item.sort_order, item.id),
            )
        conn.commit()
        cur.close()
        return {"status": "ok", "updated": len(body.folders)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/api/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM folders WHERE id = %s", (folder_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Folder not found")
        # Orphan documents (SET NULL)
        cur.execute(
            "UPDATE knowledge_documents SET folder_id = NULL WHERE folder_id = %s",
            (folder_id,),
        )
        cur.execute("DELETE FROM folders WHERE id = %s", (folder_id,))
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


@router.get("/api/folders/{folder_id}/documents")
def get_folder_documents(folder_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM folders WHERE id = %s", (folder_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Folder not found")
        cur.execute("""
            SELECT kd.id, kd.title, kd.created_at,
                   COALESCE(
                       json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                       FILTER (WHERE t.id IS NOT NULL), '[]'
                   ) AS tags
            FROM knowledge_documents kd
            LEFT JOIN document_tags dt ON dt.document_id = kd.id
            LEFT JOIN tags t ON t.id = dt.tag_id
            WHERE kd.folder_id = %s
            GROUP BY kd.id, kd.title, kd.created_at
            ORDER BY kd.created_at DESC
        """, (folder_id,))
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]
    finally:
        conn.close()
