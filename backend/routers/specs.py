"""Spec/Doc system endpoints — append-only. No UPDATE or DELETE permitted."""

from __future__ import annotations

from typing import Optional
import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.config import settings

router = APIRouter()


# ---------------------------------------------------------------------------
# DB helper
# ---------------------------------------------------------------------------

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

class SpecCreate(BaseModel):
    version: str
    type: str          # spec | patch | adr | phase_plan | handoff
    title: str
    content_md: str
    parent_id: Optional[str] = None
    supersedes_id: Optional[str] = None


# ---------------------------------------------------------------------------
# POST /api/specs  — insert only, no update/delete
# ---------------------------------------------------------------------------

@router.post("/api/specs", status_code=201)
def create_spec(body: SpecCreate):
    version = (body.version or "").strip()
    title = (body.title or "").strip()
    content_md = (body.content_md or "").strip()
    spec_type = (body.type or "").strip()

    if not version:
        raise HTTPException(status_code=400, detail="version cannot be blank")
    if spec_type not in ("spec", "patch", "adr", "phase_plan", "handoff"):
        raise HTTPException(status_code=400, detail="type must be: spec | patch | adr | phase_plan | handoff")
    if not title:
        raise HTTPException(status_code=400, detail="title cannot be blank")
    if not content_md:
        raise HTTPException(status_code=400, detail="content_md cannot be blank")

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Validate parent_id if provided
        if body.parent_id:
            cur.execute("SELECT id FROM v4_spec_records WHERE id = %s", (body.parent_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=400, detail="parent_id not found")

        # Validate supersedes_id if provided
        if body.supersedes_id:
            cur.execute("SELECT id FROM v4_spec_records WHERE id = %s", (body.supersedes_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=400, detail="supersedes_id not found")

        cur.execute(
            """
            INSERT INTO v4_spec_records (version, type, title, content_md, parent_id, supersedes_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, version, type, title, parent_id, supersedes_id, created_at, immutable
            """,
            (version, spec_type, title, content_md, body.parent_id, body.supersedes_id),
        )
        row = dict(cur.fetchone())
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

    row["id"] = str(row["id"])
    row["parent_id"] = str(row["parent_id"]) if row["parent_id"] else None
    row["supersedes_id"] = str(row["supersedes_id"]) if row["supersedes_id"] else None
    row["created_at"] = row["created_at"].isoformat()
    return row


# ---------------------------------------------------------------------------
# GET /api/specs — list/browse with optional type filter and search
# ---------------------------------------------------------------------------

@router.get("/api/specs")
def list_specs(
    type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        where_clauses = []
        params = []

        if type:
            where_clauses.append("type = %s")
            params.append(type)
        if q:
            where_clauses.append("(title ILIKE %s OR content_md ILIKE %s)")
            params.extend([f"%{q}%", f"%{q}%"])

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        count_params = params.copy()
        cur.execute(f"SELECT COUNT(*) AS total FROM v4_spec_records {where_sql}", count_params)
        total = cur.fetchone()["total"]

        params.extend([limit, offset])
        cur.execute(
            f"""
            SELECT id, version, type, title, parent_id, supersedes_id, created_at, immutable
            FROM v4_spec_records
            {where_sql}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            params,
        )
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()

    records = []
    for row in rows:
        r = dict(row)
        r["id"] = str(r["id"])
        r["parent_id"] = str(r["parent_id"]) if r["parent_id"] else None
        r["supersedes_id"] = str(r["supersedes_id"]) if r["supersedes_id"] else None
        r["created_at"] = r["created_at"].isoformat()
        records.append(r)

    return {"records": records, "total": total}


# ---------------------------------------------------------------------------
# GET /api/specs/{id} — full record including content_md
# ---------------------------------------------------------------------------

@router.get("/api/specs/{spec_id}")
def get_spec(spec_id: str):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, version, type, title, content_md, parent_id, supersedes_id, created_at, immutable "
            "FROM v4_spec_records WHERE id = %s",
            (spec_id,),
        )
        row = cur.fetchone()
        cur.close()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Spec record not found")

    r = dict(row)
    r["id"] = str(r["id"])
    r["parent_id"] = str(r["parent_id"]) if r["parent_id"] else None
    r["supersedes_id"] = str(r["supersedes_id"]) if r["supersedes_id"] else None
    r["created_at"] = r["created_at"].isoformat()
    return r


# ---------------------------------------------------------------------------
# GET /api/specs/{id}/lineage — record + anything it supersedes (chain)
# ---------------------------------------------------------------------------

@router.get("/api/specs/{spec_id}/lineage")
def get_spec_lineage(spec_id: str):
    """Walk the supersedes_id chain and return the full lineage oldest-first."""
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        chain = []
        current_id = spec_id
        seen = set()

        while current_id and current_id not in seen:
            seen.add(current_id)
            cur.execute(
                "SELECT id, version, type, title, parent_id, supersedes_id, created_at "
                "FROM v4_spec_records WHERE id = %s",
                (current_id,),
            )
            row = cur.fetchone()
            if not row:
                break
            r = dict(row)
            r["id"] = str(r["id"])
            r["parent_id"] = str(r["parent_id"]) if r["parent_id"] else None
            r["supersedes_id"] = str(r["supersedes_id"]) if r["supersedes_id"] else None
            r["created_at"] = r["created_at"].isoformat()
            chain.append(r)
            current_id = r["supersedes_id"]

        cur.close()
    finally:
        conn.close()

    return {"lineage": list(reversed(chain))}
