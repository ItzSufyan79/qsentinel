"""
Error surface (REPORT §10.3): every error is {code, message, detail?} on the
wire, with the status codes today's client.ts maps (400/404/412/500).
"""
from __future__ import annotations

from typing import Optional


class ApiHttpError(Exception):
    def __init__(self, status: int, code: str, message: str,
                 detail: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.detail = detail

    def body(self) -> dict:
        b = {"code": self.code, "message": self.message}
        if self.detail is not None:
            b["detail"] = self.detail
        return b


def invalid_params(message: str, detail: Optional[str] = None) -> ApiHttpError:
    return ApiHttpError(400, "INVALID_PARAMS", message, detail)


def run_not_found(session_id: str) -> ApiHttpError:
    return ApiHttpError(404, "RUN_NOT_FOUND", f"no run with session id '{session_id}'")


def invalid_state(message: str, detail: Optional[str] = None) -> ApiHttpError:
    return ApiHttpError(412, "INVALID_STATE", message, detail)


def backend_error(message: str, detail: Optional[str] = None) -> ApiHttpError:
    return ApiHttpError(500, "BACKEND_ERROR", message, detail)
