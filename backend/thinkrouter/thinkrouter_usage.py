from fastapi import APIRouter

router = APIRouter(prefix="/api/thinkrouter", tags=["thinkrouter-usage"])


@router.get("/usage")
async def get_usage():
    return {"stub": True, "phase": 1, "note": "Implemented Phase 7"}


@router.get("/conversations/all")
async def get_all_conversations():
    return {"stub": True, "phase": 1, "note": "Implemented Phase 6"}
