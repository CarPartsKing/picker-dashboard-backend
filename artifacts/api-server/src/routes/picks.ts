import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, picksTable, pickersTable } from "@workspace/db";
import {
  CreatePickBody,
  GetPickParams,
  DeletePickParams,
  ListPicksQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/picks", async (req, res): Promise<void> => {
  const query = ListPicksQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { pickerId, startDate, endDate } = query.data;

  const conditions = [];
  if (pickerId != null) {
    conditions.push(eq(picksTable.pickerId, pickerId));
  }
  if (startDate) {
    conditions.push(gte(picksTable.pickedAt, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(picksTable.pickedAt, new Date(endDate)));
  }

  const picks = await db
    .select({
      id: picksTable.id,
      pickerId: picksTable.pickerId,
      pickerName: pickersTable.name,
      itemSku: picksTable.itemSku,
      quantity: picksTable.quantity,
      pickedAt: picksTable.pickedAt,
      durationSeconds: picksTable.durationSeconds,
      notes: picksTable.notes,
      createdAt: picksTable.createdAt,
    })
    .from(picksTable)
    .leftJoin(pickersTable, eq(picksTable.pickerId, pickersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${picksTable.pickedAt} DESC`);

  res.json(picks);
});

router.post("/picks", async (req, res): Promise<void> => {
  const parsed = CreatePickBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { pickedAt, ...rest } = parsed.data;
  const [pick] = await db
    .insert(picksTable)
    .values({ ...rest, pickedAt: new Date(pickedAt) })
    .returning();

  const [pickWithName] = await db
    .select({
      id: picksTable.id,
      pickerId: picksTable.pickerId,
      pickerName: pickersTable.name,
      itemSku: picksTable.itemSku,
      quantity: picksTable.quantity,
      pickedAt: picksTable.pickedAt,
      durationSeconds: picksTable.durationSeconds,
      notes: picksTable.notes,
      createdAt: picksTable.createdAt,
    })
    .from(picksTable)
    .leftJoin(pickersTable, eq(picksTable.pickerId, pickersTable.id))
    .where(eq(picksTable.id, pick.id));

  res.status(201).json(pickWithName);
});

router.get("/picks/:id", async (req, res): Promise<void> => {
  const params = GetPickParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pick] = await db
    .select({
      id: picksTable.id,
      pickerId: picksTable.pickerId,
      pickerName: pickersTable.name,
      itemSku: picksTable.itemSku,
      quantity: picksTable.quantity,
      pickedAt: picksTable.pickedAt,
      durationSeconds: picksTable.durationSeconds,
      notes: picksTable.notes,
      createdAt: picksTable.createdAt,
    })
    .from(picksTable)
    .leftJoin(pickersTable, eq(picksTable.pickerId, pickersTable.id))
    .where(eq(picksTable.id, params.data.id));

  if (!pick) {
    res.status(404).json({ error: "Pick not found" });
    return;
  }

  res.json(pick);
});

router.delete("/picks/:id", async (req, res): Promise<void> => {
  const params = DeletePickParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pick] = await db
    .delete(picksTable)
    .where(eq(picksTable.id, params.data.id))
    .returning();

  if (!pick) {
    res.status(404).json({ error: "Pick not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
