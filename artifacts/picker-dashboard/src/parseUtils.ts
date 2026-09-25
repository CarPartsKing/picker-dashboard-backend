// ─── SHARED PARSING UTILITIES ─────────────────────────────────────────────────
// Used by both App.tsx and parseWorker.ts (Web Worker).
// No React or browser-only APIs here.

import * as XLSX from 'xlsx';

export interface Order {
  orderNumber: string;
  linesPicked: number;
  timeMinutes: number | null;
  isLookFor?: boolean;
  isRP?: boolean; // "RP" designator in the time cell (repack / replenishment)
  isSO?: boolean; // "SO" designator in the time cell (special order)
}

export interface PickerDayRaw {
  pickerName: string;
  dateStr: string;
  dateISO: string;
  orders: Order[];
}

export const SKIP_RE = /^(pullers|team[\s_]?goals?|notes?|total|goals?|goal|#)/i;

// Misspellings the sheet produces for the same person, keyed by the cleaned,
// title-cased form. Only add a pair after confirming the two never appear on
// the same date — two names on one day means two people (e.g. Anthony and
// Anthonya). Mirrored in api-server/src/routes/dashboard.ts.
export const PICKER_NAME_ALIASES: Record<string, string> = {
  'Jreremy': 'Jeremy',
  'Jaypitt': 'Jay Pitt',
  'Anthony A': 'Anthonya',
  'Nas': 'Nasir',
  'Ken': 'Kenneth',
  'Taureen': 'Taurean',
  'Armanip': 'Armani',
  'Phil': 'Phillip',
};

// Normalise a picker name so casing and typing variants (ANTHONY / anthony,
// 0ssie / Ossie, Andy! / Andy) all resolve to the same canonical display form.
// Rules:
//   • Drop stray punctuation ("Andy!" → "Andy")
//   • A zero touching letters is a typed O ("0ssie" → "Ossie")
//   • Drop number-only words such as IDs ("Eric  356025562" → "Eric")
//   • Each word: first letter upper, rest lower
//   • Exception: all-caps words of ≤ 3 alpha chars are kept as-is (e.g. MJ, AJ)
//   • Then apply PICKER_NAME_ALIASES
export function normalizeName(raw: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s'.-]/gu, '')
    .replace(/0(?=\p{L})|(?<=\p{L})0/gu, 'o')
    .split(/\s+/)
    .filter(word => word && !/^\d+$/.test(word));
  const words = cleaned.length ? cleaned : raw.trim().split(/\s+/);
  const titled = words.map(word => {
    if (!word) return word;
    if (word.length <= 3 && /^[A-Z]+$/.test(word)) return word;
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
  return PICKER_NAME_ALIASES[titled] ?? titled;
}

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
    if (Number.isInteger(val) && val >= 1 && val <= 23) return val * 60;
    if (val >= 1 && val < 24 && !Number.isInteger(val)) {
      const h = Math.floor(val);
      const m = Math.round((val - h) * 100);
      if (m < 60) return h * 60 + m;
    }
    const v = Math.round(Math.abs(val));
    if (v >= 0 && v <= 2359) {
      const h = Math.floor(v / 100), m = v % 100;
      if (h <= 23 && m <= 59) return h * 60 + m;
    }
    const digits = String(v);
    if (digits.length === 4 && digits.endsWith('0')) {
      const corrected = parseInt(digits.slice(0, -1), 10);
      const h = Math.floor(corrected / 100), m = corrected % 100;
      if (h <= 23 && m <= 59) return h * 60 + m;
    }
    return null;
  }
  const str = String(val)
    .trim()
    .replace(/^[`\\]+/, '')
    .replace(/[',]/g, '')
    .replace(/[.,]+$/, '');
  if (!str) return null;
  const isPm = /pm/i.test(str);
  const isAm = /am/i.test(str);
  const hourOnly = str.match(/^(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (hourOnly) {
    let h = Number(hourOnly[1]);
    const suffix = hourOnly[2] ?? '';
    if (h < 0 || h > (suffix ? 12 : 23)) return null;
    if (/p/i.test(suffix) && h !== 12) h += 12;
    if (/a/i.test(suffix) && h === 12) h = 0;
    return h * 60;
  }
  const sep = str.includes(';') ? ';' : str.includes(':') ? ':' : str.includes('.') ? '.' : null;
  if (sep) {
    const [hs, ms] = str.split(sep);
    let h = parseInt(hs, 10);
    const m = parseInt(ms, 10);
    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 12 && m >= 0 && m <= 59 && (isPm || isAm)) {
      if (isPm && h !== 12) h += 12;  // 12 PM stays 12; 1–11 PM add 12
      if (isAm && h === 12) h = 0;    // 12 AM → midnight
      return h * 60 + m;
    }
    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
  }
  const n = parseInt(str, 10);
  if (!isNaN(n) && n >= 0 && n <= 2359) {
    const h = Math.floor(n / 100), m = n % 100;
    if (h <= 23 && m <= 59) return h * 60 + m;
  }
  return null;
}

// Pickers write 12-hour times without AM/PM ("1:07" means 1:07 PM). The shift
// runs from 6:00 AM to about 8 PM (Tony, 2026-09-25), and a picker's column is
// in time order down the sheet, so each time is read in row order:
//   • before 6:00        → PM (nobody starts before 6 AM)
//   • 6:00–8:30          → PM once the day has reached noon, otherwise AM
//   • 8:31–11:59, 12:00+ → as written
// Mirrored in fixes/CPW_Picker_Export.gs (resolveTimeEntries_). Keep in sync.
const SHIFT_START_MINS = 6 * 60;
const LATEST_FINISH_MINS = 20 * 60 + 30;

export function resolveShiftTimes(times: (number | null)[]): (number | null)[] {
  let afternoon = false;
  return times.map(t => {
    if (t === null) return null;
    let resolved = t;
    if (t < SHIFT_START_MINS) resolved = t + 720;
    else if (afternoon && t < 720 && t + 720 <= LATEST_FINISH_MINS) resolved = t + 720;
    if (resolved >= 720) afternoon = true;
    return resolved;
  });
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
      const timeText = typeof timeCell === 'string' ? timeCell.trim() : '';
      const isLookFor = /^(?:L\.?F\.?|look\s+for)/i.test(timeText);
      const isRP = !isLookFor && /^R\.?P\.?/i.test(timeText);
      const isSO = !isLookFor && !isRP && /^S\.?O\.?/i.test(timeText);
      const activityTime = isLookFor || isRP || isSO
        ? timeText.replace(/^(?:L\.?F\.?|R\.?P\.?|S\.?O\.?|look\s+for)\s*/i, '')
        : timeCell;
      const timeMinutes = parseTime(activityTime);
      const lines = typeof linesCell === 'number'
        ? Math.round(linesCell)
        : parseInt(String(linesCell ?? '0'), 10) || 0;
      if (lines <= 0) continue;
      orders.push({
        orderNumber: String(orderCell).trim(),
        linesPicked: lines,
        timeMinutes,
        ...(isLookFor ? { isLookFor: true } : {}),
        ...(isRP ? { isRP: true } : {}),
        ...(isSO ? { isSO: true } : {}),
      });
    }
    if (orders.length > 0) {
      const resolved = resolveShiftTimes(orders.map(o => o.timeMinutes));
      orders.forEach((o, i) => { o.timeMinutes = resolved[i]; });
      const normalName = normalizeName(name);
      result[`${normalName}|${dateStr}`] = { pickerName: normalName, dateStr, dateISO, orders };
    }
  }
  return result;
}
