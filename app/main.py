"""
QSentinel backend (SIH PS 26141). FastAPI app: startup creates the schema,
seeds the attack catalog and runs the ten pinned fixtures; every error leaves
as {code, message, detail?} with the status codes client.ts maps.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.errors import ApiHttpError
from app.api.routes import router

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger("qsentinel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db import db as kit
    from app.fixtures import seed_fixtures
    kit.init_db()  # tables + catalog upsert
    with kit.transaction() as s:
        n = seed_fixtures(s)
    log.info("startup complete: %d fixture run(s) created", n)
    yield


app = FastAPI(title="QSentinel backend", lifespan=lifespan)

_origins = [o.strip() for o in
            os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
            if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ApiHttpError)
async def api_error(_req: Request, exc: ApiHttpError):
    return JSONResponse(status_code=exc.status, content=exc.body())


@app.exception_handler(RequestValidationError)
async def pydantic_error(_req: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return JSONResponse(status_code=400, content={
        "code": "INVALID_PARAMS",
        "message": f"invalid request: {loc}: {first.get('msg', 'validation failed')}",
        "detail": str(exc.errors()[:3]),
    })


@app.exception_handler(Exception)
async def unhandled(_req: Request, exc: Exception):
    log.exception("unhandled error")
    return JSONResponse(status_code=500, content={
        "code": "BACKEND_ERROR",
        "message": "unexpected backend failure",
        "detail": f"{type(exc).__name__}: {exc}",
    })


app.include_router(router)
