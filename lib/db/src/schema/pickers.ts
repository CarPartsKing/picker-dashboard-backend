import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pickersTable = pgTable("pickers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  employeeId: text("employee_id").notNull().unique(),
  zone: text("zone"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPickerSchema = createInsertSchema(pickersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPicker = z.infer<typeof insertPickerSchema>;
export type Picker = typeof pickersTable.$inferSelect;
