import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { dashboardStatsTable, dashboardUploadsTable } from "@workspace/db/schema";
import { desc, gte, lte, and, eq, type SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

const GapFlagSchema = z.object({
  pickerName: z.string(),
  dateStr: z.string(),
  fromMinutes: z.number(),
  toMinutes: z.number(),
  gapMinutes: z.number(),
  severity: z.enum(["Low", "Med", "High"]),
});

const router: IRouter = Router();

function checkPassword(req: Request, res: Response): boolean {
  const expected = process.env.DASHBOARD_UPLOAD_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: "Server upload password not configured" });
    return false;
  }
  const provided = req.headers["x-upload-password"];
  if (!provided || Array.isArray(provided)) {
    res.status(401).json({ error: "Invalid upload password" });
    return false;
  }
  const provBuf = Buffer.from(provided);
  const expBuf = Buffer.from(expected);
  if (provBuf.length !== expBuf.length || !crypto.timingSafeEqual(provBuf, expBuf)) {
    res.status(401).json({ error: "Invalid upload password" });
    return false;
  }
  return true;
}

router.post("/dashboard/upload", async (req: Request, res: Response): Promise<void> => {
  if (!checkPassword(req, res)) return;

  const { fileName, dateRangeStart, dateRangeEnd, stats } = req.body as {
    fileName: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    stats: Array<{
      pickerName: string;
      dateStr: string;
      totalLines: number;
      totalOrders: number;
      linesPerHour: number | null;
      ordersPerHour: number | null;
      avgLinesPerOrder: number;
      activeWindowMinutes: number | null;
      gapFlags: unknown[];
      performanceRating?: string;
      firstTimeMins?: number | null;
      lastTimeMins?: number | null;
      lfOrders?: number | null;
      lfLines?: number | null;
      lfMinutes?: number | null;
      rpOrders?: number | null;
      rpLines?: number | null;
      soOrders?: number | null;
      soLines?: number | null;
    }>;
  };

  if (!Array.isArray(stats) || stats.length === 0) {
    res.status(400).json({ error: "stats array is required and must not be empty" });
    return;
  }
  if (!fileName || !dateRangeStart || !dateRangeEnd) {
    res.status(400).json({ error: "fileName, dateRangeStart, dateRangeEnd are required" });
    return;
  }

  const rows = stats.map((s) => ({
    pickerName: s.pickerName,
    dateStr: s.dateStr,
    totalLines: s.totalLines ?? 0,
    totalOrders: s.totalOrders ?? 0,
    linesPerHour: s.linesPerHour ?? null,
    ordersPerHour: s.ordersPerHour ?? null,
    avgLinesPerOrder: s.avgLinesPerOrder ?? null,
    activeWindowMinutes: s.activeWindowMinutes ?? null,
    gapFlags: z.array(GapFlagSchema).default([]).parse(s.gapFlags ?? []),
    performanceRating: s.performanceRating ?? null,
    firstTimeMins: s.firstTimeMins ?? null,
    lastTimeMins: s.lastTimeMins ?? null,
    lfOrders: s.lfOrders ?? null,
    lfLines: s.lfLines ?? null,
    lfMinutes: s.lfMinutes ?? null,
    rpOrders: s.rpOrders ?? null,
    rpLines: s.rpLines ?? null,
    soOrders: s.soOrders ?? null,
    soLines: s.soLines ?? null,
    source: "upload",
  }));

  const inserted = await db
    .insert(dashboardStatsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [dashboardStatsTable.pickerName, dashboardStatsTable.dateStr],
      setWhere: eq(dashboardStatsTable.source, "live"),
      set: {
        totalLines: sql`excluded.total_lines`,
        totalOrders: sql`excluded.total_orders`,
        linesPerHour: sql`excluded.lines_per_hour`,
        ordersPerHour: sql`excluded.orders_per_hour`,
        avgLinesPerOrder: sql`excluded.avg_lines_per_order`,
        activeWindowMinutes: sql`excluded.active_window_minutes`,
        gapFlags: sql`excluded.gap_flags`,
        performanceRating: sql`excluded.performance_rating`,
        firstTimeMins: sql`excluded.first_time_mins`,
        lastTimeMins: sql`excluded.last_time_mins`,
        lfOrders: sql`excluded.lf_orders`,
        lfLines: sql`excluded.lf_lines`,
        lfMinutes: sql`excluded.lf_minutes`,
        rpOrders: sql`excluded.rp_orders`,
        rpLines: sql`excluded.rp_lines`,
        soOrders: sql`excluded.so_orders`,
        soLines: sql`excluded.so_lines`,
        source: sql`excluded.source`,
      },
    })
    .returning({ id: dashboardStatsTable.id });

  const rowsInserted = inserted.length;
  const rowsSkipped = rows.length - rowsInserted;

  await db.insert(dashboardUploadsTable).values({
    fileName,
    dateRangeStart,
    dateRangeEnd,
    rowsInserted,
    rowsSkipped,
  });

  res.json({ rowsInserted, rowsSkipped });
});

router.get("/dashboard/stats", async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query as { from?: string; to?: string };

  const conditions: SQL[] = [];
  if (from) conditions.push(gte(dashboardStatsTable.dateStr, from));
  if (to) conditions.push(lte(dashboardStatsTable.dateStr, to));

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(dashboardStatsTable)
          .where(and(...conditions))
          .orderBy(desc(dashboardStatsTable.dateStr))
      : await db
          .select()
          .from(dashboardStatsTable)
          .orderBy(desc(dashboardStatsTable.dateStr));

  res.json(rows);
});

router.get("/dashboard/uploads", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(dashboardUploadsTable)
    .orderBy(desc(dashboardUploadsTable.uploadedAt))
    .limit(50);

  res.json(rows);
});

router.delete("/dashboard/stats", async (req: Request, res: Response): Promise<void> => {
  if (!checkPassword(req, res)) return;

  await db.delete(dashboardStatsTable);
  await db.delete(dashboardUploadsTable);

  res.json({ cleared: true });
});

const EXTERNAL_API = process.env.EXTERNAL_API_URL ?? "https://picker-dashboard-backend.onrender.com/api/picker-data";

// ── Live-feed auto-archive ──────────────────────────────────────────────────
// The Render backend caps its export at ~1000 records (rolling window), so
// older days silently fall off the feed. Every time we proxy the live feed we
// also upsert the records into dashboard_stats so history is preserved.

const LiveGapSchema = z.object({
  fromMins: z.number(),
  toMins: z.number(),
  gapMins: z.number(),
});

const LiveRecordSchema = z.object({
  date: z.string(),
  picker: z.string(),
  orders: z.number().nullish(),
  total_lines: z.number().nullish(),
  avg_lines_per_order: z.number().nullish(),
  active_hrs: z.number().nullish(),
  lines_per_hr: z.number().nullish(),
  orders_per_hr: z.number().nullish(),
  first_time_mins: z.number().nullish(),
  last_time_mins: z.number().nullish(),
  gaps: z.array(LiveGapSchema).nullish(),
  lf_orders: z.number().nullish(),
  lf_lines: z.number().nullish(),
  lf_minutes: z.number().nullish(),
  lf_avg_mins_per_order: z.number().nullish(),
  lf_pct_of_shift: z.number().nullish(),
  is_lf_specialist: z.boolean().nullish(),
  rp_orders: z.number().nullish(),
  rp_lines: z.number().nullish(),
  so_orders: z.number().nullish(),
  so_lines: z.number().nullish(),
});

const LiveResponseSchema = z.object({
  data: z.array(LiveRecordSchema),
});

// Mirrors the dashboard frontend's normalizeName so archived rows merge
// cleanly with live rows on the picker_name|date_str key.
function normalizeName(raw: string): string {
  return raw.trim().split(/\s+/).map((word) => {
    if (!word) return word;
    if (word.length <= 3 && /^[A-Z]+$/.test(word)) return word;
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
}

const ARCHIVE_MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastArchiveAt = 0;
let archiveInFlight = false;

type RequestLogger = Request["log"];

async function archiveLiveData(body: unknown, log: RequestLogger): Promise<void> {
  const parsed = LiveResponseSchema.safeParse(body);
  if (!parsed.success) {
    log.error({ issues: parsed.error.issues.slice(0, 3) }, "live-data archive: unexpected upstream shape, skipping");
    return;
  }

  // Dedupe on normalized picker|date (feed may contain raw-name variants).
  const byKey = new Map<string, (typeof parsed.data.data)[number]>();
  for (const r of parsed.data.data) {
    if (!r.date || !r.picker) continue;
    byKey.set(`${normalizeName(r.picker)}|${r.date}`, r);
  }

  const rows = [...byKey.values()].map((r) => {
    const pickerName = normalizeName(r.picker);
    // Canonical rate formula (matches the dashboard's XLSX parser):
    // rate = count / max((last - first) - lfMinutes, 1) * 60.
    // The upstream feed does NOT subtract Look-For time, so we recompute
    // here instead of trusting its lines_per_hr / orders_per_hr.
    const first = r.first_time_mins != null ? Math.round(r.first_time_mins) : null;
    const last = r.last_time_mins != null ? Math.round(r.last_time_mins) : null;
    // Timing present but invalid (last <= first) → null rates, matching the
    // XLSX parser which produces null when there's no usable window. Only
    // fall back to upstream rates when timing is entirely absent.
    const timingMissing = first == null || last == null;
    const windowMins = !timingMissing && last > first ? last - first : null;
    const effectiveMins = windowMins != null ? Math.max(windowMins - (r.lf_minutes ?? 0), 1) : null;
    const linesPerHour =
      effectiveMins != null
        ? r.total_lines != null
          ? (r.total_lines / effectiveMins) * 60
          : null
        : timingMissing
          ? (r.lines_per_hr ?? null)
          : null;
    const ordersPerHour =
      effectiveMins != null
        ? r.orders != null
          ? (r.orders / effectiveMins) * 60
          : null
        : timingMissing
          ? (r.orders_per_hr ?? null)
          : null;
    const gapFlags = (r.gaps ?? [])
      .filter((g) => g.gapMins >= 90)
      .map((g) => ({
        pickerName,
        dateStr: r.date,
        fromMinutes: g.fromMins,
        toMinutes: g.toMins,
        gapMinutes: g.gapMins,
        severity: (g.gapMins >= 180 ? "High" : g.gapMins >= 120 ? "Med" : "Low") as "Low" | "Med" | "High",
      }));
    return {
      pickerName,
      dateStr: r.date,
      totalLines: r.total_lines ?? 0,
      totalOrders: r.orders ?? 0,
      linesPerHour,
      ordersPerHour,
      avgLinesPerOrder: r.avg_lines_per_order ?? null,
      activeWindowMinutes: windowMins ?? (r.active_hrs != null ? r.active_hrs * 60 : null),
      gapFlags,
      firstTimeMins: first,
      lastTimeMins: last,
      lfOrders: r.lf_orders ?? null,
      lfLines: r.lf_lines ?? null,
      lfMinutes: r.lf_minutes ?? null,
      lfAvgMinsPerOrder: r.lf_avg_mins_per_order ?? null,
      lfPctOfShift: r.lf_pct_of_shift ?? null,
      isLfSpecialist: r.is_lf_specialist ?? null,
      rpOrders: r.rp_orders ?? null,
      rpLines: r.rp_lines ?? null,
      soOrders: r.so_orders ?? null,
      soLines: r.so_lines ?? null,
      source: "live",
    };
  });

  if (rows.length === 0) return;

  const CHUNK = 250;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db
      .insert(dashboardStatsTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: [dashboardStatsTable.pickerName, dashboardStatsTable.dateStr],
        setWhere: eq(dashboardStatsTable.source, "live"),
        set: {
          totalLines: sql`excluded.total_lines`,
          totalOrders: sql`excluded.total_orders`,
          linesPerHour: sql`excluded.lines_per_hour`,
          ordersPerHour: sql`excluded.orders_per_hour`,
          avgLinesPerOrder: sql`excluded.avg_lines_per_order`,
          activeWindowMinutes: sql`excluded.active_window_minutes`,
          gapFlags: sql`excluded.gap_flags`,
          firstTimeMins: sql`excluded.first_time_mins`,
          lastTimeMins: sql`excluded.last_time_mins`,
          lfOrders: sql`excluded.lf_orders`,
          lfLines: sql`excluded.lf_lines`,
          lfMinutes: sql`excluded.lf_minutes`,
          lfAvgMinsPerOrder: sql`excluded.lf_avg_mins_per_order`,
          lfPctOfShift: sql`excluded.lf_pct_of_shift`,
          isLfSpecialist: sql`excluded.is_lf_specialist`,
          rpOrders: sql`excluded.rp_orders`,
          rpLines: sql`excluded.rp_lines`,
          soOrders: sql`excluded.so_orders`,
          soLines: sql`excluded.so_lines`,
        },
      });
  }

  log.info({ archivedRows: rows.length }, "live-data archive: upserted feed snapshot");
}

router.get("/dashboard/live-data", async (req: Request, res: Response): Promise<void> => {
  try {
    const upstream = await fetch(EXTERNAL_API, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }
    const body = await upstream.json() as unknown;
    res.json(body);

    const now = Date.now();
    if (!archiveInFlight && now - lastArchiveAt >= ARCHIVE_MIN_INTERVAL_MS) {
      archiveInFlight = true;
      lastArchiveAt = now;
      const log = req.log;
      void archiveLiveData(body, log)
        .catch((err: unknown) => {
          log.error({ err }, "live-data archive failed");
        })
        .finally(() => {
          archiveInFlight = false;
        });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to reach upstream: ${msg}` });
  }
});

export default router;
