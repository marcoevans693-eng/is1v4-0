"""Campaign CRUD endpoints — IS1v3.3 Phase 3B
   Mirrors folders.py structure.
   Endpoints:
   - GET    /api/campaigns              — list all campaigns with doc counts
   - POST   /api/campaigns              — create campaign
   - PUT    /api/campaigns/{id}         — update campaign (rename, color, sort_order)
   - DELETE /api/campaigns/{id}         — delete campaign, orphan docs
   - PATCH  /api/campaigns/reorder      — bulk reorder
   - GET    /api/campaigns/{id}/documents — list docs in a campaign
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


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CampaignCreate(BaseModel):
    name: str
    color: Optional[str] = "#e8e8e8"


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class ReorderRequest(BaseModel):
    campaigns: List[ReorderItem]


# ---------------------------------------------------------------------------
# GET /api/campaigns
# ---------------------------------------------------------------------------

@router.get("/api/campaigns")
def list_campaigns():
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT c.id, c.name, c.color, c.created_at, c.updated_at,
                   c.sort_order, c.last_accessed_at,
                   COUNT(kd.id) AS document_count
            FROM campaigns c
            LEFT JOIN knowledge_documents kd ON kd.campaign_id = c.id
            GROUP BY c.id, c.name, c.color, c.created_at, c.updated_at,
                     c.sort_order, c.last_accessed_at
            ORDER BY c.sort_order ASC, c.created_at ASC
        """)
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /api/campaigns
# ---------------------------------------------------------------------------

@router.post("/api/campaigns", status_code=201)
def create_campaign(body: CampaignCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Campaign name cannot be blank")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Campaign name max 100 characters")
    color = body.color or "#e8e8e8"

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM campaigns WHERE LOWER(name) = LOWER(%s)", (name,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail=f"Campaign '{name}' already exists")
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM campaigns")
        next_order = cur.fetchone()["next_order"]
        cur.execute(
            """INSERT INTO campaigns (name, color, sort_order)
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


# ---------------------------------------------------------------------------
# PUT /api/campaigns/{id}
# ---------------------------------------------------------------------------

@router.put("/api/campaigns/{campaign_id}")
def update_campaign(campaign_id: str, body: CampaignUpdate):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, name, color, sort_order FROM campaigns WHERE id = %s",
            (campaign_id,),
        )
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")

        new_name = body.name.strip() if body.name is not None else existing["name"]
        new_color = body.color if body.color is not None else existing["color"]
        new_sort_order = body.sort_order if body.sort_order is not None else existing["sort_order"]

        if not new_name:
            raise HTTPException(status_code=400, detail="Campaign name cannot be blank")
        if len(new_name) > 100:
            raise HTTPException(status_code=400, detail="Campaign name max 100 characters")

        cur.execute(
            "SELECT id FROM campaigns WHERE LOWER(name) = LOWER(%s) AND id != %s",
            (new_name, campaign_id),
        )
        if cur.fetchone():
            raise HTTPException(status_code=400, detail=f"Campaign '{new_name}' already exists")

        cur.execute(
            """UPDATE campaigns SET name = %s, color = %s, sort_order = %s, updated_at = NOW()
               WHERE id = %s
               RETURNING id, name, color, sort_order, last_accessed_at, created_at, updated_at""",
            (new_name, new_color, new_sort_order, campaign_id),
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


# ---------------------------------------------------------------------------
# PATCH /api/campaigns/reorder
# ---------------------------------------------------------------------------

@router.patch("/api/campaigns/reorder")
def reorder_campaigns(body: ReorderRequest):
    """Bulk update sort_order for multiple campaigns in a single transaction."""
    if not body.campaigns:
        raise HTTPException(status_code=400, detail="No campaigns provided")

    conn = get_conn()
    try:
        cur = conn.cursor()
        for item in body.campaigns:
            cur.execute(
                "UPDATE campaigns SET sort_order = %s WHERE id = %s",
                (item.sort_order, item.id),
            )
        conn.commit()
        cur.close()
        return {"status": "ok", "updated": len(body.campaigns)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# DELETE /api/campaigns/{id}
# ---------------------------------------------------------------------------

@router.delete("/api/campaigns/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM campaigns WHERE id = %s", (campaign_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Campaign not found")
        # Orphan documents (SET NULL)
        cur.execute(
            "UPDATE knowledge_documents SET campaign_id = NULL WHERE campaign_id = %s",
            (campaign_id,),
        )
        cur.execute("DELETE FROM campaigns WHERE id = %s", (campaign_id,))
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


# ---------------------------------------------------------------------------
# GET /api/campaigns/{id}/documents
# ---------------------------------------------------------------------------

@router.get("/api/campaigns/{campaign_id}/documents")
def get_campaign_documents(campaign_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM campaigns WHERE id = %s", (campaign_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Campaign not found")
        cur.execute("""
            SELECT kd.id, kd.title, kd.created_at,
                   COALESCE(
                       json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                       FILTER (WHERE t.id IS NOT NULL), '[]'
                   ) AS tags
            FROM knowledge_documents kd
            LEFT JOIN document_tags dt ON dt.document_id = kd.id
            LEFT JOIN tags t ON t.id = dt.tag_id
            WHERE kd.campaign_id = %s
            GROUP BY kd.id, kd.title, kd.created_at
            ORDER BY kd.created_at DESC
        """, (campaign_id,))
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]
    finally:
        conn.close()
