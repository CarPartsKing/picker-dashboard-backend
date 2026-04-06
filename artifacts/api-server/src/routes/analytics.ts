import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, count, sum, avg } from "drizzle-orm";
import { db, picksTable, pickersTable } from "@workspace/db";
import {
  GetLeaderboardQueryParams,
  GetPickerStatsParams,
  GetPickerStatsQueryParams,
  GetDailyTrendQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function computeEfficiencyScore(totalPicks: number, totalItems: number, avgDuration: number | null): number {
  const itemScore = totalItems;
  const speedBonus = avgDuration && avgDuration > 0 ? Math.max(0, 100 - avgDuration / 10) : 0;
  return Math.round((itemScore * 1.0 + speedBonus * 0.1) * 10) / 10;
}

router.get("/analytics/leaderboard", async (req, res): Promise<void> => {
  const query = GetLeaderboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { startDate, endDate } = query.data;

  const conditions = [];
  if (startDate) conditions.push(gte(picksTable.pickedAt, new Date(startDate)));
  if (endDate) conditions.push(lte(picksTable.pickedAt, new Date(endDate)));

  const stats = await db
    .select({
      pickerId: pickersTable.id,
      pickerName: pickersTable.name,
      employeeId: pickersTable.employeeId,
      totalPicks: count(picksTable.id),
      totalItems: sql<number>`COALESCE(SUM(${picksTable.quantity}), 0)`.mapWith(Number),
      avgDurationSeconds: avg(picksTable.durationSeconds).mapWith(Number),
    })
    .from(pickersTable)
    .leftJoin(
      picksTable,
      and(
        eq(picksTable.pickerId, pickersTable.id),
        ...conditions
      )
    )
    .where(eq(pickersTable.active, true))
    .groupBy(pickersTable.id, pickersTable.name, pickersTable.employeeId)
    .orderBy(sql`SUM(${picksTable.quantity}) DESC NULLS LAST`);

  const leaderboard = stats.map((entry, index) => ({
    ...entry,
    avgDurationSeconds: entry.avgDurationSeconds ?? null,
    efficiencyScore: computeEfficiencyScore(
      entry.totalPicks,
      entry.totalItems,
      entry.avgDurationSeconds
    ),
    rank: index + 1,
  }));

  res.json(leaderboard);
});

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const [totalPickersRow] = await db
    .select({ total: count() })
    .from(pickersTable);

  const [activePickersRow] = await db
    .select({ total: count() })
    .from(pickersTable)
    .where(eq(pickersTable.active, true));

  const [todayRow] = await db
    .select({ total: count() })
    .from(picksTable)
    .where(gte(picksTable.pickedAt, todayStart));

  const [weekRow] = await db
    .select({ total: count() })
    .from(picksTable)
    .where(gte(picksTable.pickedAt, weekStart));

  const [allTimeRow] = await db
    .select({ total: count() })
    .from(picksTable);

  const todayByPicker = await db
    .select({
      pickerName: pickersTable.name,
      total: count(picksTable.id),
    })
    .from(picksTable)
    .leftJoin(pickersTable, eq(picksTable.pickerId, pickersTable.id))
    .where(gte(picksTable.pickedAt, todayStart))
    .groupBy(pickersTable.name)
    .orderBy(sql`count(${picksTable.id}) DESC`)
    .limit(1);

  const activePickers = activePickersRow?.total ?? 0;
  const totalPicksToday = todayRow?.total ?? 0;
  const avgPicksPerPickerToday = activePickers > 0 ? Math.round((totalPicksToday / activePickers) * 10) / 10 : 0;

  res.json({
    totalPickers: totalPickersRow?.total ?? 0,
    activePickers,
    totalPicksToday,
    totalPicksThisWeek: weekRow?.total ?? 0,
    totalPicksAllTime: allTimeRow?.total ?? 0,
    avgPicksPerPickerToday,
    topPickerToday: todayByPicker[0]?.pickerName ?? null,
    topPickerTodayCount: todayByPicker[0]?.total ?? null,
  });
});

router.get("/analytics/picker/:id/stats", async (req, res): Promise<void> => {
  const params = GetPickerStatsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const qp = GetPickerStatsQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const { startDate, endDate } = qp.data;

  const [picker] = await db.select().from(pickersTable).where(eq(pickersTable.id, params.data.id));
  if (!picker) {
    res.status(404).json({ error: "Picker not found" });
    return;
  }

  const pickConditions = [eq(picksTable.pickerId, params.data.id)];
  if (startDate) pickConditions.push(gte(picksTable.pickedAt, new Date(startDate)));
  if (endDate) pickConditions.push(lte(picksTable.pickedAt, new Date(endDate)));

  const [stats] = await db
    .select({
      totalPicks: count(picksTable.id),
      totalItems: sql<number>`COALESCE(SUM(${picksTable.quantity}), 0)`.mapWith(Number),
      avgDurationSeconds: avg(picksTable.durationSeconds).mapWith(Number),
    })
    .from(picksTable)
    .where(and(...pickConditions));

  const recentPicks = await db
    .select({
      id: picksTable.id,
      pickerId: picksTable.pickerId,
      pickerName: pickersTable.name,
      itemSku: picksTable.itemSku,
      quantity: picksTable.quantity,
      zone: picksTable.zone,
      pickedAt: picksTable.pickedAt,
      durationSeconds: picksTable.durationSeconds,
      notes: picksTable.notes,
      createdAt: picksTable.createdAt,
    })
    .from(picksTable)
    .leftJoin(pickersTable, eq(picksTable.pickerId, pickersTable.id))
    .where(and(...pickConditions))
    .orderBy(sql`${picksTable.pickedAt} DESC`)
    .limit(20);

  const totalPicks = stats?.totalPicks ?? 0;
  const totalItems = stats?.totalItems ?? 0;
  const avgDuration = stats?.avgDurationSeconds ?? null;

  const picksPerDay = totalPicks > 0 ? (() => {
    const createdDate = new Date(picker.createdAt);
    const diffDays = Math.max(1, Math.ceil((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));
    return Math.round((totalPicks / diffDays) * 10) / 10;
  })() : 0;

  res.json({
    pickerId: picker.id,
    pickerName: picker.name,
    employeeId: picker.employeeId,
    zone: picker.zone,
    totalPicks,
    totalItems,
    avgDurationSeconds: avgDuration,
    efficiencyScore: computeEfficiencyScore(totalPicks, totalItems, avgDuration),
    picksPerDay,
    recentPicks,
  });
});

router.get("/analytics/daily-trend", async (req, res): Promise<void> => {
  const query = GetDailyTrendQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const days = query.data.days ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select({
      date: sql<string>`DATE(${picksTable.pickedAt})`.mapWith(String),
      totalPicks: count(picksTable.id),
      totalItems: sql<number>`COALESCE(SUM(${picksTable.quantity}), 0)`.mapWith(Number),
      activePickers: sql<number>`COUNT(DISTINCT ${picksTable.pickerId})`.mapWith(Number),
    })
    .from(picksTable)
    .where(gte(picksTable.pickedAt, cutoff))
    .groupBy(sql`DATE(${picksTable.pickedAt})`)
    .orderBy(sql`DATE(${picksTable.pickedAt}) ASC`);

  res.json(rows);
});

export default router;
