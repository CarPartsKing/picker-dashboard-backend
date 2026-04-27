import { pgTable, text, serial, timestamp, real, integer, json, unique } from "drizzle-orm/pg-core";

export type GapFlagRecord = {
  pickerName: string;
  dateStr: string;
  fromMinutes: number;
  toMinutes: number;
  gapMinutes: number;
  severity: 'Low' | 'Med' | 'High';
};

export function isGapFlagRecord(v: unknown): v is GapFlagRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.pickerName === 'string' &&
    typeof r.dateStr === 'string' &&
    typeof r.fromMinutes === 'number' &&
    typeof r.toMinutes === 'number' &&
    typeof r.gapMinutes === 'number' &&
    (r.severity === 'Low' || r.severity === 'Med' || r.severity === 'High')
  );
}

export const dashboardStatsTable = pgTable('dashboard_stats', {
  id: serial('id').primaryKey(),
  pickerName: text('picker_name').notNull(),
  dateStr: text('date_str').notNull(),
  totalLines: integer('total_lines').notNull().default(0),
  totalOrders: integer('total_orders').notNull().default(0),
  linesPerHour: real('lines_per_hour'),
  ordersPerHour: real('orders_per_hour'),
  avgLinesPerOrder: real('avg_lines_per_order'),
  activeWindowMinutes: real('active_window_minutes'),
  gapFlags: json('gap_flags').$type<GapFlagRecord[]>().notNull().default([]),
  performanceRating: text('performance_rating'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('unique_picker_date').on(t.pickerName, t.dateStr),
]);

export const dashboardUploadsTable = pgTable('dashboard_uploads', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull(),
  dateRangeStart: text('date_range_start').notNull(),
  dateRangeEnd: text('date_range_end').notNull(),
  rowsInserted: integer('rows_inserted').notNull().default(0),
  rowsSkipped: integer('rows_skipped').notNull().default(0),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DashboardStat = typeof dashboardStatsTable.$inferSelect;
export type DashboardUpload = typeof dashboardUploadsTable.$inferSelect;
