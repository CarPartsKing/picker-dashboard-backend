import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Picker Data Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
TABLE = os.environ.get("SUPABASE_TABLE", "picker_data")
API_KEY = os.environ.get("API_KEY", "")


def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


# ── Pydantic models ──────────────────────────────────────────────────────────
# Field names match the camelCase keys sent by Apps Script.

class Gap(BaseModel):
    fromMins: float
    toMins: float
    gapMins: float
    severity: str | None = None


class PickerRecord(BaseModel):
    date: str
    picker: str
    orders: int
    totalLines: int
    avgLinesPerOrder: float
    activeHrs: float | None = None
    linesPerHr: float | None = None
    ordersPerHr: float | None = None
    firstTimeMins: float | None = None
    lastTimeMins: float | None = None
    hasGaps: bool = False
    gaps: list[Gap] = []
    orderDetail: list[Any] = []
    lfOrders: int = 0
    lfLines: int = 0
    lfMinutes: float = 0
    lfAvgMinsPerOrder: float | None = None
    lfPctOfShift: float | None = None
    rpOrders: int = 0
    rpLines: int = 0
    soOrders: int = 0
    soLines: int = 0


class ExportPayload(BaseModel):
    data: list[PickerRecord]
    exportedAt: str | None = None
    recordCount: int | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _to_row(r: PickerRecord, exported_at: str) -> dict[str, Any]:
    """Map camelCase PickerRecord fields to snake_case Supabase columns."""
    return {
        "date":                  r.date,
        "picker":                r.picker,
        "orders":                r.orders,
        "total_lines":           r.totalLines,
        "avg_lines_per_order":   r.avgLinesPerOrder,
        "active_hrs":            r.activeHrs,
        "lines_per_hr":          r.linesPerHr,
        "orders_per_hr":         r.ordersPerHr,
        "first_time_mins":       r.firstTimeMins,
        "last_time_mins":        r.lastTimeMins,
        "has_gaps":              r.hasGaps,
        "gaps":                  [g.model_dump() for g in r.gaps],
        "order_detail":          r.orderDetail,
        "lf_orders":             r.lfOrders,
        "lf_lines":              r.lfLines,
        "lf_minutes":            r.lfMinutes,
        "lf_avg_mins_per_order": r.lfAvgMinsPerOrder,
        "lf_pct_of_shift":       r.lfPctOfShift,
        "rp_orders":             r.rpOrders,
        "rp_lines":              r.rpLines,
        "so_orders":             r.soOrders,
        "so_lines":              r.soLines,
        "exported_at":           exported_at,
    }


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/picker-data")
async def receive_picker_data(
    payload: ExportPayload,
    x_api_key: str | None = Header(None),
) -> dict[str, Any]:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if not payload.data:
        raise HTTPException(status_code=400, detail="data must not be empty")

    exported_at = payload.exportedAt or datetime.now(timezone.utc).isoformat()
    rows = [_to_row(r, exported_at) for r in payload.data]

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            headers={
                **_supabase_headers(),
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            params={"on_conflict": "date,picker"},
            json=rows,
        )

    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Supabase error {res.status_code}: {res.text}")

    return {"inserted": len(rows), "exported_at": exported_at}


@app.get("/api/picker-data")
async def get_picker_data() -> dict[str, Any]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            headers=_supabase_headers(),
            params={"order": "date.desc,picker.asc"},
        )

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error {res.status_code}: {res.text}")

    rows: list[dict] = res.json()
    exported_at = rows[0]["exported_at"] if rows else datetime.now(timezone.utc).isoformat()

    return {
        "exportedAt": exported_at,
        "recordCount": len(rows),
        "data": rows,
    }
