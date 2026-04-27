import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { dashboardStatsTable, dashboardUploadsTable } from "@workspace/db/schema";
import { desc, gte, lte, and, type SQL } from "drizzle-orm";
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
  }));

  const inserted = await db
    .insert(dashboardStatsTable)
    .values(rows)
    .onConflictDoNothing()
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

router.get("/dashboard/live-data", async (_req: Request, res: Response): Promise<void> => {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to reach upstream: ${msg}` });
  }
});

export default router;
