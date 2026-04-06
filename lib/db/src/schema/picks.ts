import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pickersTable } from "./pickers";

export const picksTable = pgTable("picks", {
  id: serial("id").primaryKey(),
  pickerId: integer("picker_id").notNull().references(() => pickersTable.id, { onDelete: "cascade" }),
  itemSku: text("item_sku").notNull(),
  quantity: integer("quantity").notNull().default(1),
  zone: text("zone"),
  pickedAt: timestamp("picked_at", { withTimezone: true }).notNull(),
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPickSchema = createInsertSchema(picksTable).omit({ id: true, createdAt: true });
export type InsertPick = z.infer<typeof insertPickSchema>;
export type Pick = typeof picksTable.$inferSelect;
