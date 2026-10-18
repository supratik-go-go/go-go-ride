"""Response envelope helpers: { success, message, data } (+ meta on lists)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from typing import Annotated

from fastapi import Depends, Query
from fastapi.responses import JSONResponse

from app.core.enums import SortOrder


def ok(data: Any = None, message: str = "Success", status_code: int = 200) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"success": True, "message": message, "data": data})


def created(data: Any = None, message: str = "Created") -> JSONResponse:
    return ok(data, message, status_code=201)


def paginated(items: list[Any], total: int, page: "Page", message: str = "Success", **extra_meta: Any) -> JSONResponse:
    meta = {
        "page": page.page,
        "limit": page.limit,
        "total": total,
        "totalPages": max(1, math.ceil(total / page.limit)),
        **extra_meta,
    }
    return JSONResponse(
        status_code=200, content={"success": True, "message": message, "data": items, "meta": meta}
    )


@dataclass
class Page:
    page: int = 1
    limit: int = 20
    search: str | None = None
    sort: str | None = None
    order: SortOrder = SortOrder.desc

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.limit


def pagination(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    sort: str | None = Query(None),
    order: SortOrder = Query(SortOrder.desc),
) -> Page:
    """Shared query parameters for every list endpoint."""
    return Page(page=page, limit=limit, search=search.strip() if search else None, sort=sort, order=order)


PageDep = Annotated[Page, Depends(pagination)]


def meta(total: int, page: Page, **extra: Any) -> dict:
    """The `meta` block carried by every list response."""
    return {
        "page": page.page,
        "limit": page.limit,
        "total": total,
        "totalPages": max(1, math.ceil(total / page.limit)),
        **extra,
    }
