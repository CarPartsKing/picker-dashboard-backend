import os
from collections import defaultdict
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


def _dedup(records: list[PickerRecord]) -> list[PickerRecord]:
    """Collapse duplicate picker+date rows within a single batch.

    Postgres raises "ON CONFLICT DO UPDATE command cannot affect row a second
    time" when the same conflict key appears more than once in one upsert
    statement. Merge duplicates here before they reach Supabase.
    """
    merged: dict[tuple[str, str], PickerRecord] = {}
    for r in records:
        key = (r.date, r.picker)
        if key not in merged:
            merged[key] = r.model_copy(deep=True)
            continue
        b = merged[key]
        # additive counters
        b.orders   += r.orders
        b.totalLines += r.totalLines
        b.lfOrders += r.lfOrders
        b.lfLines  += r.lfLines
        b.lfMinutes += r.lfMinutes
        b.rpOrders += r.rpOrders
        b.rpLines  += r.rpLines
        b.soOrders += r.soOrders
        b.soLines  += r.soLines
        # time window: earliest start, latest end; recalculate derived rates
        if r.firstTimeMins is not None:
            b.firstTimeMins = r.firstTimeMins if b.firstTimeMins is None else min(b.firstTimeMins, r.firstTimeMins)
        if r.lastTimeMins is not None:
            b.lastTimeMins = r.lastTimeMins if b.lastTimeMins is None else max(b.lastTimeMins, r.lastTimeMins)
        if b.firstTimeMins is not None and b.lastTimeMins is not None:
            b.activeHrs = (b.lastTimeMins - b.firstTimeMins) / 60
        if b.activeHrs:
            b.linesPerHr  = b.totalLines / b.activeHrs
            b.ordersPerHr = b.orders / b.activeHrs
        # union list/flag fields
        b.hasGaps     = b.hasGaps or r.hasGaps
        b.gaps        = b.gaps + r.gaps
        b.orderDetail = b.orderDetail + r.orderDetail
    return list(merged.values())


async def _update_lf_specialist(client: httpx.AsyncClient, pickers: list[str]) -> None:
    """Recalculate is_lf_specialist for each picker and patch all their rows.

    A picker qualifies when, across all tracked days:
      - average lf_orders >= 10
      - average lf_pct_of_shift >= 30
      - days with lf_orders > 0 >= 15
    """
    if not pickers or not SUPABASE_URL:
        return

    picker_filter = "(" + ",".join(pickers) + ")"
    res = await client.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_supabase_headers(),
        params={
            "picker": f"in.{picker_filter}",
            "select": "picker,lf_orders,lf_pct_of_shift",
        },
    )
    if res.status_code != 200:
        return  # best-effort; don't fail the upsert

    by_picker: dict[str, list[dict]] = defaultdict(list)
    for row in res.json():
        by_picker[row["picker"]].append(row)

    for picker, rows in by_picker.items():
        n = len(rows)
        avg_lf_orders = sum((r.get("lf_orders") or 0) for r in rows) / n
        pct_vals = [r["lf_pct_of_shift"] for r in rows if r.get("lf_pct_of_shift") is not None]
        avg_lf_pct = sum(pct_vals) / len(pct_vals) if pct_vals else 0.0
        days_with_lf = sum(1 for r in rows if (r.get("lf_orders") or 0) > 0)

        is_specialist = avg_lf_orders >= 10 and avg_lf_pct >= 30 and days_with_lf >= 15

        await client.patch(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            headers={**_supabase_headers(), "Prefer": "return=minimal"},
            params={"picker": f"eq.{picker}"},
            json={"is_lf_specialist": is_specialist},
        )


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
    records = _dedup(payload.data)
    rows = [_to_row(r, exported_at) for r in records]

    async with httpx.AsyncClient(timeout=30) as client:
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

        pickers = list({r.picker for r in records})
        await _update_lf_specialist(client, pickers)

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
