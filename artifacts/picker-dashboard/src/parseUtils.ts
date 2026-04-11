// ─── SHARED PARSING UTILITIES ─────────────────────────────────────────────────
// Used by both App.tsx and parseWorker.ts (Web Worker).
// No React or browser-only APIs here.

import * as XLSX from 'xlsx';

export interface Order {
  orderNumber: string;
  linesPicked: number;
  timeMinutes: number | null;
  isLookFor?: boolean;
}

export interface PickerDayRaw {
  pickerName: string;
  dateStr: string;
  dateISO: string;
  orders: Order[];
}

export const SKIP_RE = /^(pullers|team[\s_]?goals?|notes?|total|goals?|goal|#)/i;

export function parseTabDate(tabName: string): Date | null {
  const digits = tabName.replace(/\D/g, '');
  if (digits.length < 5) return null;
  const year = parseInt(digits.slice(-4), 10);
  if (year < 2000 || year > 2100) return null;
  const md = digits.slice(0, -4);
  let month: number, day: number;
  if (md.length === 2) {
    month = parseInt(md[0], 10);
    day   = parseInt(md[1], 10);
  } else if (md.length === 3) {
    const twoM = parseInt(md.slice(0, 2), 10);
    const oneD = parseInt(md[2], 10);
    if (twoM >= 10 && twoM <= 12 && oneD >= 1 && oneD <= 9) {
      month = twoM; day = oneD;
    } else {
      month = parseInt(md[0], 10);
      day   = parseInt(md.slice(1), 10);
    }
  } else if (md.length === 4) {
    month = parseInt(md.slice(0, 2), 10);
    day   = parseInt(md.slice(2), 10);
  } else return null;
  if (!month || month < 1 || month > 12 || !day || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseTime(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    if (val > 0 && val < 1) return Math.round(val * 24 * 60);
    const v = Math.floor(Math.abs(val));
    if (v >= 0 && v <= 2359) {
      const h = Math.floor(v / 100), m = v % 100;
      if (h <= 23 && m <= 59) return h * 60 + m;
    }
    return null;
  }
  const str = String(val).trim();
  if (!str) return null;
  const sep = str.includes(';') ? ';' : str.includes(':') ? ':' : null;
  if (sep) {
    const [hs, ms] = str.split(sep);
    const h = parseInt(hs, 10), m = parseInt(ms, 10);
    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
  }
  const n = parseInt(str, 10);
  if (!isNaN(n) && n >= 0 && n <= 2359) {
    const h = Math.floor(n / 100), m = n % 100;
    if (h <= 23 && m <= 59) return h * 60 + m;
  }
  return null;
}

export function parseSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): Record<string, PickerDayRaw> {
  const date = parseTabDate(sheetName);
  if (!date) return {};
  const dateStr = toDateStr(date);
  const dateISO = date.toISOString();
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
  if (!raw || raw.length < 2) return {};
  const headerRow = (raw[0] as unknown[]) || [];
  const COL_HEADER_RE = /^(lines?|times?|orders?|qty|quantity|picks?|date|total|#)$/i;
  const pickers: { name: string; col: number }[] = [];
  for (let col = 0; col < headerRow.length; col++) {
    const cell = headerRow[col];
    if (typeof cell !== 'string') continue;
    const name = cell.trim();
    if (!name) continue;
    if (COL_HEADER_RE.test(name)) continue;
    if (SKIP_RE.test(name)) continue;
    pickers.push({ name, col });
  }
  const seenCols = new Set<number>();
  const dedupedPickers = pickers.filter(p => {
    if (seenCols.has(p.col)) return false;
    seenCols.add(p.col);
    return true;
  });
  const rowMeta = (sheet['!rows'] as Array<{ hidden?: boolean } | undefined> | undefined) ?? [];
  const result: Record<string, PickerDayRaw> = {};
  for (const { name, col } of dedupedPickers) {
    const orders: Order[] = [];
    for (let row = 1; row < raw.length; row++) {
      if (rowMeta[row]?.hidden) continue;
      const r = (raw[row] as unknown[]) || [];
      const orderCell = r[col];
      const linesCell = r[col + 1];
      const timeCell  = r[col + 2];
      if (orderCell === null || orderCell === undefined) continue;
      if (typeof orderCell === 'string') {
        const t = orderCell.trim();
        if (!t || SKIP_RE.test(t)) continue;
      }
      if (typeof orderCell === 'number' && orderCell <= 0) continue;
      const isLookFor = typeof timeCell === 'string' && /^\s*(L\.?F\.?\s*\d*|look\s+for)\s*$/i.test(timeCell);
      const timeMinutes = isLookFor ? null : parseTime(timeCell);
      const lines = typeof linesCell === 'number'
        ? Math.round(linesCell)
        : parseInt(String(linesCell ?? '0'), 10) || 0;
      if (lines <= 0) continue;
      orders.push({ orderNumber: String(orderCell).trim(), linesPicked: lines, timeMinutes, ...(isLookFor ? { isLookFor: true } : {}) });
    }
    if (orders.length > 0) {
      result[`${name}|${dateStr}`] = { pickerName: name, dateStr, dateISO, orders };
    }
  }
  return result;
}
