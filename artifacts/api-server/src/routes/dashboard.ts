import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { dashboardStatsTable, dashboardUploadsTable } from "@workspace/db/schema";
import { desc, gte, lte, and, type SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function checkPassword(req: Request, res: Response): boolean {
  const expected = process.env.DASHBOARD_UPLOAD_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: "Server upload password not configured" });
    return false;
  }
  const provided = req.headers["x-upload-password"];
  if (!provided || provided !== expected) {
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
    gapFlags: (s.gapFlags ?? []) as any,
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

export default router;
