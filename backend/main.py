"""IS1v3 FastAPI application factory."""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.api.health import router as health_router
from backend.routers.tags import router as tags_router
from backend.routers.folders import router as folders_router
from backend.routers.campaigns import router as campaigns_router
from backend.routers.knowledge import router as knowledge_router
from backend.routers.specs import router as specs_router
from backend.routers.queries import router as queries_router
from backend.routers.chat import router as chat_router
from backend.routers.observability import router as observability_router
from backend.thinkrouter.thinkrouter import router as thinkrouter_router
from backend.thinkrouter.thinkrouter_search import router as thinkrouter_search_router
from backend.thinkrouter.thinkrouter_usage import router as thinkrouter_usage_router
import os

app = FastAPI(title="IntelliSys1 v3", version="0.1.0")

# API routes (must be before SPA catch-all)
app.include_router(health_router)
app.include_router(tags_router)
app.include_router(folders_router)
app.include_router(campaigns_router)
app.include_router(knowledge_router)
app.include_router(specs_router)
app.include_router(queries_router)
app.include_router(chat_router)
app.include_router(observability_router)

# IS1-TR routers (search first so /conversations/all resolves before /conversations/{id})
app.include_router(thinkrouter_search_router)
app.include_router(thinkrouter_router)
app.include_router(thinkrouter_usage_router)

# Serve frontend static files (after API routes so /api/* takes priority)
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        return FileResponse(os.path.join(frontend_dist, "index.html"))
