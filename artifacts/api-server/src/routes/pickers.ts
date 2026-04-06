import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pickersTable } from "@workspace/db";
import {
  CreatePickerBody,
  UpdatePickerBody,
  GetPickerParams,
  UpdatePickerParams,
  DeletePickerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/pickers", async (req, res): Promise<void> => {
  const pickers = await db.select().from(pickersTable).orderBy(pickersTable.name);
  res.json(pickers);
});

router.post("/pickers", async (req, res): Promise<void> => {
  const parsed = CreatePickerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [picker] = await db.insert(pickersTable).values(parsed.data).returning();
  res.status(201).json(picker);
});

router.get("/pickers/:id", async (req, res): Promise<void> => {
  const params = GetPickerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [picker] = await db.select().from(pickersTable).where(eq(pickersTable.id, params.data.id));
  if (!picker) {
    res.status(404).json({ error: "Picker not found" });
    return;
  }

  res.json(picker);
});

router.patch("/pickers/:id", async (req, res): Promise<void> => {
  const params = UpdatePickerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePickerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [picker] = await db
    .update(pickersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(pickersTable.id, params.data.id))
    .returning();

  if (!picker) {
    res.status(404).json({ error: "Picker not found" });
    return;
  }

  res.json(picker);
});

router.delete("/pickers/:id", async (req, res): Promise<void> => {
  const params = DeletePickerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [picker] = await db
    .delete(pickersTable)
    .where(eq(pickersTable.id, params.data.id))
    .returning();

  if (!picker) {
    res.status(404).json({ error: "Picker not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
