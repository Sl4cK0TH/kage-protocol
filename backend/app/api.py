from fastapi import APIRouter
from app.routes import admin, auth, public

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(public.router, tags=["public"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
