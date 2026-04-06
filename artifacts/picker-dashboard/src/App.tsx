import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BG   = '#0E0E0E';
const BG2  = '#161616';
const BG3  = '#202020';
const AMBER = '#F5A623';
const TEXT  = '#EEEEEE';
const DIM   = '#666666';
const BORDER = '#2C2C2C';
const GREEN  = '#22C55E';
const YELLOW = '#EAB308';
const RED    = '#EF4444';

const PICKER_COLORS = [
  '#F5A623','#3B82F6','#22C55E','#A855F7',
  '#EC4899','#06B6D4','#F97316','#84CC16',
  '#8B5CF6','#14B8A6',
];

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Order {
  orderNumber: string;
  linesPicked: number;
  timeMinutes: number | null;
}
interface PickerDayData {
  pickerName: string;
  dateStr: string;
  date: Date;
  orders: Order[];
  loadedAt: Date;
}
interface DayStats {
  pickerName: string;
  dateStr: string;
  date: Date;
  totalOrders: number;
  totalLines: number;
  linesPerHour: number | null;
  ordersPerHour: number | null;
  avgLinesPerOrder: number;
  activeWindowMinutes: number | null;
  firstTime: number | null;
  lastTime: number | null;
  gapFlags: GapFlag[];
  performanceRating?: 'green' | 'yellow' | 'red';
}
interface GapFlag {
  pickerName: string;
  dateStr: string;
  fromMinutes: number;
  toMinutes: number;
  gapMinutes: number;
  severity: 'Low' | 'Med' | 'High';
}
interface FileHistoryEntry {
  fileName: string;
  loadedAt: Date;
  tabsLoaded: number;
  recordsAdded: number;
  recordsReplaced: number;
}

// ─── PARSING UTILITIES ────────────────────────────────────────────────────────

function parseTabDate(tabName: string): Date | null {
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

function parseTime(val: unknown): number | null {
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

const SKIP_RE = /^(pullers|team[\s_]?goals?|notes?|total|goals?|goal|#)/i;

function parseSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  loadedAt: Date
): Record<string, Omit<PickerDayData, 'loadedAt'>> {
  const date = parseTabDate(sheetName);
  if (!date) return {};
  const dateStr = toDateStr(date);
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
  if (!raw || raw.length < 2) return {};
  const headerRow = (raw[0] as unknown[]) || [];
  const pickers: { name: string; col: number }[] = [];
  for (let col = 0; col < headerRow.length; col += 3) {
    const cell = headerRow[col];
    if (typeof cell !== 'string') continue;
    const name = cell.trim();
    if (!name) continue;
    pickers.push({ name, col });
  }
  const result: Record<string, Omit<PickerDayData, 'loadedAt'>> = {};
  for (const { name, col } of pickers) {
    const orders: Order[] = [];
    for (let row = 1; row < raw.length; row++) {
      const r = (raw[row] as unknown[]) || [];
      const orderCell = r[col];
      const linesCell = r[col + 1];
      const timeCell  = r[col + 2];
      if (orderCell === null || orderCell === undefined) continue;
      if (typeof orderCell === 'string') {
        const t = orderCell.trim();
        if (!t || SKIP_RE.test(t)) continue;
      }
      const timeMinutes = parseTime(timeCell);
      const lines = typeof linesCell === 'number'
        ? Math.round(linesCell)
        : parseInt(String(linesCell ?? '0'), 10) || 0;
      // A real pick must have at least 1 line. Rows with 0 lines are totals,
      // blank spacers, or summary cells — including them creates phantom timestamps.
      if (lines <= 0) continue;
      orders.push({ orderNumber: String(orderCell).trim(), linesPicked: lines, timeMinutes });
    }
    if (orders.length > 0) {
      result[`${name}|${dateStr}`] = { pickerName: name, date, dateStr, orders };
    }
  }
  return result;
}

// ─── KPI COMPUTATION ──────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtMin(m: number): string {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
function fmtDate(ds: string): string {
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function weekStart(ds: string): string {
  const d = new Date(ds + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}
function weekLabel(ws: string): string {
  const d = new Date(ws + 'T12:00:00');
  const e = new Date(d); e.setDate(d.getDate() + 6);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function computeDayStats(data: PickerDayData): DayStats {
  const { pickerName, dateStr, date, orders } = data;
  const totalOrders = orders.length;
  const totalLines  = orders.reduce((s, o) => s + o.linesPicked, 0);
  const times = orders.map(o => o.timeMinutes).filter((t): t is number => t !== null).sort((a, b) => a - b);
  let linesPerHour: number | null = null;
  let ordersPerHour: number | null = null;
  let activeWindowMinutes: number | null = null;
  let firstTime: number | null = null;
  let lastTime: number | null = null;
  if (times.length >= 2) {
    firstTime = times[0]; lastTime = times[times.length - 1];
    activeWindowMinutes = lastTime - firstTime;
    if (activeWindowMinutes > 0) {
      linesPerHour  = (totalLines  / activeWindowMinutes) * 60;
      ordersPerHour = (totalOrders / activeWindowMinutes) * 60;
    }
  } else if (times.length === 1) {
    firstTime = lastTime = times[0];
  }
  const avgLinesPerOrder = totalOrders > 0 ? totalLines / totalOrders : 0;
  const gapFlags: GapFlag[] = [];
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap >= 60) {
      gapFlags.push({
        pickerName, dateStr,
        fromMinutes: times[i - 1], toMinutes: times[i], gapMinutes: gap,
        severity: gap >= 120 ? 'High' : gap >= 90 ? 'Med' : 'Low',
      });
    }
  }
  return { pickerName, dateStr, date, totalOrders, totalLines, linesPerHour, ordersPerHour, avgLinesPerOrder, activeWindowMinutes, firstTime, lastTime, gapFlags };
}

function assignRatings(statsByDate: Map<string, DayStats[]>) {
  for (const stats of statsByDate.values()) {
    const lphs = stats.map(s => s.linesPerHour).filter((v): v is number => v !== null);
    if (!lphs.length) continue;
    const avg = lphs.reduce((a, b) => a + b, 0) / lphs.length;
    for (const s of stats) {
      if (s.linesPerHour === null) { s.performanceRating = 'yellow'; continue; }
      const pct = ((s.linesPerHour - avg) / avg) * 100;
      s.performanceRating = pct > 15 ? 'green' : pct < -15 ? 'red' : 'yellow';
    }
  }
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const mono: React.CSSProperties = { fontFamily: "'DM Mono', 'Fira Code', 'Menlo', monospace" };
const card: React.CSSProperties = { background: BG2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18 };
const th: React.CSSProperties = { padding: '9px 12px', fontSize: 10, color: DIM, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, textTransform: 'uppercase', letterSpacing: '0.09em', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12, borderBottom: `1px solid ${BORDER}` };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const section: React.CSSProperties = { marginBottom: 28 };
const secTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, marginBottom: 12 };

function pill(text: string, bg: string, fg: string): React.ReactElement {
  return <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: bg, color: fg, ...mono }}>{text}</span>;
}
function btn(label: string, onClick: () => void, style?: React.CSSProperties): React.ReactElement {
  return <button onClick={onClick} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${BORDER}`, background: BG3, color: TEXT, fontFamily: 'inherit', ...style }}>{label}</button>;
}
function selEl(value: string, onChange: (v: string) => void, options: string[]): React.ReactElement {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ background: BG3, border: `1px solid ${BORDER}`, color: TEXT, padding: '6px 10px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── RECHARTS TOOLTIP ─────────────────────────────────────────────────────────
const DarkTip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: BG3, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '8px 12px', fontSize: 11 }}>
      {label && <div style={{ color: DIM, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, ...mono }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value % 1 === 0 ? p.value : p.value.toFixed(2) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ─── HEADER ───────────────────────────────────────────────────────────────────
function Header({ lastUpdated, onClear, onToggleHistory, hasData, dateRange }: {
  lastUpdated: Date | null; onClear: () => void; onToggleHistory: () => void; hasData: boolean;
  dateRange: { first: string; last: string; days: number } | null;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: `1px solid ${BORDER}`, background: '#0A0A0A' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...mono, color: AMBER, fontWeight: 700, fontSize: 17, letterSpacing: '0.06em' }}>PICKER·TRACK</span>
        <span style={{ background: BG3, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '2px 8px', fontSize: 10, color: DIM, letterSpacing: '0.06em' }}>AUTOMOTIVE AFTERMARKET</span>
        {dateRange && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,166,35,0.08)', border: `1px solid rgba(245,166,35,0.25)`, borderRadius: 4, padding: '3px 10px' }}>
            <span style={{ fontSize: 10, color: DIM, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Data</span>
            <span style={{ ...mono, fontSize: 12, color: AMBER }}>
              {fmtDate(dateRange.first)}
            </span>
            {dateRange.first !== dateRange.last && (
              <>
                <span style={{ color: DIM, fontSize: 10 }}>→</span>
                <span style={{ ...mono, fontSize: 12, color: AMBER }}>{fmtDate(dateRange.last)}</span>
              </>
            )}
            <span style={{ fontSize: 10, color: DIM }}>·</span>
            <span style={{ ...mono, fontSize: 11, color: DIM }}>{dateRange.days}d</span>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {lastUpdated && <span style={{ fontSize: 11, color: DIM, ...mono }}>Updated {lastUpdated.toLocaleString()}</span>}
        {hasData && btn('File History', onToggleHistory)}
        {hasData && btn('Clear Data', onClear, { color: RED, borderColor: RED })}
      </div>
    </div>
  );
}

// ─── FILE HISTORY PANEL ───────────────────────────────────────────────────────
function FileHistoryPanel({ history }: { history: FileHistoryEntry[] }) {
  return (
    <div style={{ background: '#0A0A0A', borderBottom: `1px solid ${BORDER}`, padding: '10px 24px' }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>File History</div>
      {!history.length
        ? <div style={{ color: DIM, fontSize: 12 }}>No files loaded.</div>
        : [...history].reverse().map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: AMBER, ...mono }}>{h.fileName}</span>
            <span style={{ color: DIM }}>{h.loadedAt.toLocaleString()}</span>
            <span style={{ color: DIM }}>{h.tabsLoaded} record{h.tabsLoaded !== 1 ? 's' : ''}</span>
            {h.recordsAdded > 0 && <span style={{ color: GREEN }}>+{h.recordsAdded} added</span>}
            {h.recordsReplaced > 0 && <span style={{ color: YELLOW }}>{h.recordsReplaced} replaced</span>}
          </div>
        ))
      }
    </div>
  );
}

// ─── DROP ZONE ────────────────────────────────────────────────────────────────
function DropZone({ onFiles, isDragging, setIsDragging, compact }: {
  onFiles: (f: FileList) => void; isDragging: boolean; setIsDragging: (v: boolean) => void; compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  }, [onFiles, setIsDragging]);

  if (compact) {
    return (
      <div style={{ borderTop: `1px solid ${BORDER}`, padding: '8px 24px', background: '#0A0A0A', display: 'flex', alignItems: 'center', gap: 12 }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={e => e.target.files && onFiles(e.target.files)} />
        <button onClick={() => inputRef.current?.click()} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: AMBER, color: '#000', fontFamily: 'inherit' }}>+ Load File</button>
        <span style={{ fontSize: 11, color: DIM }}>Drop an xlsx file anywhere to load or update data</span>
        {isDragging && <span style={{ color: AMBER, fontSize: 11 }}>● Drop now</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
      <div
        style={{ border: `2px dashed ${isDragging ? AMBER : BORDER}`, borderRadius: 8, padding: '52px 40px', textAlign: 'center', background: isDragging ? 'rgba(245,166,35,0.04)' : BG2, cursor: 'pointer', transition: 'all 0.2s', maxWidth: 500, width: '100%' }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={e => e.target.files && onFiles(e.target.files)} />
        <div style={{ fontSize: 36, marginBottom: 14 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: isDragging ? AMBER : TEXT }}>Drop your Excel file here</div>
        <div style={{ fontSize: 13, color: DIM, marginBottom: 22, lineHeight: 1.6 }}>
          Date-named tabs (412026, 4102026…)<br />Wide format: Order · Lines · Time repeating per picker
        </div>
        <button style={{ padding: '8px 22px', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: AMBER, color: '#000', fontFamily: 'inherit' }}>Browse File</button>
      </div>
    </div>
  );
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'compare', label: 'Compare' },
  { id: 'picker-detail', label: 'Picker Detail' },
  { id: 'gap-flags', label: 'Gap Flags' },
];
function TabBar({ activeTab, setActiveTab, gapCount }: { activeTab: string; setActiveTab: (t: string) => void; gapCount: number }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, background: '#0A0A0A', paddingLeft: 20 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '10px 18px', fontSize: 12, fontWeight: activeTab === t.id ? 700 : 500, color: activeTab === t.id ? AMBER : DIM, borderBottom: `2px solid ${activeTab === t.id ? AMBER : 'transparent'}`, cursor: 'pointer', background: 'none', border: 'none', outline: 'none', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.label}
          {t.id === 'gap-flags' && gapCount > 0 && <span style={{ background: RED, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{gapCount}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, padding: '14px 18px' }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || AMBER, ...mono }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ allStats, allDates, pickerNames, allGapFlags }: {
  allStats: DayStats[]; allDates: string[]; pickerNames: string[]; allGapFlags: GapFlag[];
}) {
  const latestDate = allDates[allDates.length - 1] ?? '';
  const todayStats = allStats.filter(s => s.dateStr === latestDate);
  const todayLines = todayStats.reduce((s, d) => s + d.totalLines, 0);
  const todayOrders = todayStats.reduce((s, d) => s + d.totalOrders, 0);
  const todayLphArr = todayStats.filter(s => s.linesPerHour !== null);
  const todayAvgLph = todayLphArr.length ? todayLphArr.reduce((s, d) => s + d.linesPerHour!, 0) / todayLphArr.length : 0;
  const totalLinesAll = allStats.reduce((s, d) => s + d.totalLines, 0);
  const totalOrdersAll = allStats.reduce((s, d) => s + d.totalOrders, 0);

  const leaderboard = pickerNames.map((name, i) => {
    const days = allStats.filter(s => s.pickerName === name);
    const lphDays = days.filter(s => s.linesPerHour !== null);
    const avgLph = lphDays.length ? lphDays.reduce((s, d) => s + d.linesPerHour!, 0) / lphDays.length : 0;
    const totalLines = days.reduce((s, d) => s + d.totalLines, 0);
    const totalOrders = days.reduce((s, d) => s + d.totalOrders, 0);
    return { name, avgLph, totalLines, totalOrders, daysWorked: days.length, color: PICKER_COLORS[i % PICKER_COLORS.length] };
  }).sort((a, b) => b.avgLph - a.avgLph);

  const chartData = allDates.map(ds => {
    const obj: Record<string, string | number> = { date: fmtDate(ds) };
    pickerNames.forEach(n => { obj[n] = allStats.find(s => s.dateStr === ds && s.pickerName === n)?.totalLines ?? 0; });
    return obj;
  });

  const tableRows = [...allStats].sort((a, b) => b.dateStr.localeCompare(a.dateStr) || a.pickerName.localeCompare(b.pickerName));

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ ...section }}>
        <div style={secTitle}>{latestDate ? `Latest Date — ${fmtDate(latestDate)}` : 'Summary'}</div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          <StatCard label="Lines Today" value={todayLines} />
          <StatCard label="Orders Today" value={todayOrders} />
          <StatCard label="Team Avg L/Hr" value={todayAvgLph > 0 ? todayAvgLph.toFixed(1) : '—'} />
          <StatCard label="Total Lines" value={totalLinesAll.toLocaleString()} color={TEXT} />
          <StatCard label="Total Orders" value={totalOrdersAll.toLocaleString()} color={TEXT} />
          <StatCard label="Gap Flags" value={allGapFlags.length} color={allGapFlags.length > 0 ? RED : GREEN} />
        </div>
      </div>

      <div style={{ ...section }}>
        <div style={secTitle}>Leaderboard — Avg Lines / Hr (All Time)</div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {leaderboard.map((p, idx) => (
            <div key={p.name} style={{ ...card, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 10, color: DIM }}>#{idx + 1}</span>
                <span style={{ fontSize: 10, color: DIM }}>{p.daysWorked}d</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: AMBER, ...mono }}>{p.avgLph > 0 ? p.avgLph.toFixed(1) : '—'}</div>
              <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>{p.totalLines.toLocaleString()} lines · {p.totalOrders} orders</div>
            </div>
          ))}
        </div>
      </div>

      {chartData.length > 0 && (
        <div style={{ ...section }}>
          <div style={secTitle}>Daily Lines by Picker</div>
          <div style={{ ...card, padding: '16px 0 8px 0' }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ left: 10, right: 20, top: 4, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date" tick={{ fill: DIM, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: DIM, fontSize: 10 }} />
                <Tooltip content={<DarkTip />} />
                <Legend wrapperStyle={{ color: DIM, fontSize: 11, paddingTop: 6 }} />
                {pickerNames.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={PICKER_COLORS[i % PICKER_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ ...section }}>
        <div style={secTitle}>Full Daily Breakdown</div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead><tr>
              {['Date','Picker','Lines','Orders','L/Hr','Ord/Hr','Avg L/Ord','Window','Rating','Gaps'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {tableRows.map((s, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>{fmtDate(s.dateStr)}</td>
                  <td style={td}>{s.pickerName}</td>
                  <td style={{ ...td, ...mono }}>{s.totalLines}</td>
                  <td style={{ ...td, ...mono }}>{s.totalOrders}</td>
                  <td style={{ ...td, ...mono }}>{s.linesPerHour != null ? s.linesPerHour.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono }}>{s.ordersPerHour != null ? s.ordersPerHour.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono }}>{s.avgLinesPerOrder > 0 ? s.avgLinesPerOrder.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>{s.firstTime != null && s.lastTime != null ? `${fmtMin(s.firstTime)}–${fmtMin(s.lastTime)}` : '—'}</td>
                  <td style={td}>
                    {s.performanceRating && pill(
                      s.performanceRating === 'green' ? '▲' : s.performanceRating === 'red' ? '▼' : '◆',
                      s.performanceRating === 'green' ? GREEN : s.performanceRating === 'red' ? RED : YELLOW,
                      s.performanceRating === 'red' ? '#fff' : '#000'
                    )}
                  </td>
                  <td style={td}>{s.gapFlags.length > 0 && <span style={{ color: RED, ...mono }}>{s.gapFlags.length}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── WEEKLY TAB ───────────────────────────────────────────────────────────────
function WeeklyTab({ allStats, pickerNames }: { allStats: DayStats[]; pickerNames: string[] }) {
  const weekMap = new Map<string, DayStats[]>();
  for (const s of allStats) {
    const wk = weekStart(s.dateStr);
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk)!.push(s);
  }
  const weeks = [...weekMap.keys()].sort();

  const chartData = weeks.map(wk => {
    const ws = weekMap.get(wk)!;
    return { week: weekLabel(wk), lines: ws.reduce((s, d) => s + d.totalLines, 0), orders: ws.reduce((s, d) => s + d.totalOrders, 0) };
  });

  const tableData = weeks.map(wk => {
    const ws = weekMap.get(wk)!;
    const row: Record<string, string | number | null> = { week: weekLabel(wk) };
    for (const name of pickerNames) {
      const days = ws.filter(s => s.pickerName === name);
      row[`${name}_lines`] = days.reduce((s, d) => s + d.totalLines, 0) || null;
      const lphDays = days.filter(s => s.linesPerHour != null);
      row[`${name}_lph`] = lphDays.length ? lphDays.reduce((s, d) => s + d.linesPerHour!, 0) / lphDays.length : null;
    }
    return row;
  });

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ ...section }}>
        <div style={secTitle}>Weekly Total Lines</div>
        <div style={{ ...card, padding: '16px 0 8px 0' }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ left: 10, right: 20, top: 4, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="week" tick={{ fill: DIM, fontSize: 10 }} angle={-20} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: DIM, fontSize: 10 }} />
              <Tooltip content={<DarkTip />} />
              <Bar dataKey="lines" fill={AMBER} name="Lines" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...section }}>
        <div style={secTitle}>Per-Picker Weekly Rollup</div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Week</th>
                {pickerNames.map(n => <th key={n} style={th} colSpan={2}>{n}</th>)}
              </tr>
              <tr>
                <th style={{ ...th, borderTop: 'none' }} />
                {pickerNames.map(n => (
                  <React.Fragment key={n}>
                    <th style={{ ...th, borderTop: 'none', fontSize: 9 }}>Lines</th>
                    <th style={{ ...th, borderTop: 'none', fontSize: 9 }}>L/Hr</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>{row.week}</td>
                  {pickerNames.map(n => (
                    <React.Fragment key={n}>
                      <td style={{ ...td, ...mono }}>{row[`${n}_lines`] != null ? row[`${n}_lines`] : <span style={{ color: DIM }}>—</span>}</td>
                      <td style={{ ...td, ...mono, color: DIM }}>{row[`${n}_lph`] != null ? (row[`${n}_lph`] as number).toFixed(1) : '—'}</td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── COMPARE TAB ──────────────────────────────────────────────────────────────
function CompareTab({ allStats, pickerNames }: { allStats: DayStats[]; pickerNames: string[] }) {
  const [pA, setPA] = useState(pickerNames[0] ?? '');
  const [pB, setPB] = useState(pickerNames[1] ?? pickerNames[0] ?? '');
  useEffect(() => {
    if (pickerNames.length > 0 && !pickerNames.includes(pA)) setPA(pickerNames[0]);
    if (pickerNames.length > 1 && !pickerNames.includes(pB)) setPB(pickerNames[1]);
  }, [pickerNames]);

  const sum = (name: string) => {
    const days = allStats.filter(s => s.pickerName === name);
    const lphDays = days.filter(s => s.linesPerHour != null);
    const ophDays = days.filter(s => s.ordersPerHour != null);
    const totalLines = days.reduce((s, d) => s + d.totalLines, 0);
    const totalOrders = days.reduce((s, d) => s + d.totalOrders, 0);
    const avgLph = lphDays.length ? lphDays.reduce((s, d) => s + d.linesPerHour!, 0) / lphDays.length : 0;
    const avgOph = ophDays.length ? ophDays.reduce((s, d) => s + d.ordersPerHour!, 0) / ophDays.length : 0;
    const avgLpo = totalOrders > 0 ? totalLines / totalOrders : 0;
    return { totalLines, totalOrders, avgLph, avgOph, avgLpo, daysWorked: days.length };
  };
  const sA = sum(pA), sB = sum(pB);

  const maxOf = (a: number, b: number) => Math.max(a, b, 0.001);
  const radarData = [
    { m: 'Lines/Hr',    A: (sA.avgLph / maxOf(sA.avgLph, sB.avgLph)) * 100, B: (sB.avgLph / maxOf(sA.avgLph, sB.avgLph)) * 100 },
    { m: 'Orders/Hr',  A: (sA.avgOph / maxOf(sA.avgOph, sB.avgOph)) * 100, B: (sB.avgOph / maxOf(sA.avgOph, sB.avgOph)) * 100 },
    { m: 'Lines/Order',A: (sA.avgLpo / maxOf(sA.avgLpo, sB.avgLpo)) * 100, B: (sB.avgLpo / maxOf(sA.avgLpo, sB.avgLpo)) * 100 },
    { m: 'Consistency',A: (sA.daysWorked / maxOf(sA.daysWorked, sB.daysWorked)) * 100, B: (sB.daysWorked / maxOf(sA.daysWorked, sB.daysWorked)) * 100 },
  ];

  const sharedDates = [...new Set(allStats.filter(s => s.pickerName === pA || s.pickerName === pB).map(s => s.dateStr))].sort();
  const trendData = sharedDates.map(d => ({
    date: fmtDate(d),
    [pA]: allStats.find(s => s.dateStr === d && s.pickerName === pA)?.totalLines ?? null,
    [pB]: pA !== pB ? (allStats.find(s => s.dateStr === d && s.pickerName === pB)?.totalLines ?? null) : undefined,
  }));

  const rows = [
    { label: 'Total Lines',    vA: sA.totalLines,  vB: sB.totalLines,  fmt: (v: number) => v.toLocaleString() },
    { label: 'Total Orders',   vA: sA.totalOrders, vB: sB.totalOrders, fmt: (v: number) => v.toLocaleString() },
    { label: 'Avg Lines/Hr',   vA: sA.avgLph,      vB: sB.avgLph,      fmt: (v: number) => v.toFixed(2) },
    { label: 'Avg Orders/Hr',  vA: sA.avgOph,      vB: sB.avgOph,      fmt: (v: number) => v.toFixed(2) },
    { label: 'Lines/Order',    vA: sA.avgLpo,      vB: sB.avgLpo,      fmt: (v: number) => v.toFixed(2) },
    { label: 'Days Worked',    vA: sA.daysWorked,  vB: sB.daysWorked,  fmt: (v: number) => String(v) },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 10, color: DIM, marginBottom: 4, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Picker A</div>{selEl(pA, setPA, pickerNames)}</div>
        <div style={{ color: DIM, fontSize: 18, paddingBottom: 6 }}>vs</div>
        <div><div style={{ fontSize: 10, color: DIM, marginBottom: 4, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Picker B</div>{selEl(pB, setPB, pickerNames)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={card}>
          <div style={secTitle}>Radar Comparison</div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={BORDER} />
              <PolarAngleAxis dataKey="m" tick={{ fill: DIM, fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: DIM, fontSize: 8 }} domain={[0, 100]} tickCount={3} />
              <Radar name={pA} dataKey="A" stroke={AMBER} fill={AMBER} fillOpacity={0.15} />
              {pA !== pB && <Radar name={pB} dataKey="B" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} />}
              <Legend wrapperStyle={{ color: DIM, fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={secTitle}>Stat by Stat</div>
          <table style={tbl}>
            <thead><tr>
              <th style={th}>Metric</th>
              <th style={{ ...th, color: AMBER }}>{pA}</th>
              {pA !== pB && <th style={{ ...th, color: '#3B82F6' }}>{pB}</th>}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const aW = r.vA > r.vB, bW = r.vB > r.vA;
                return (
                  <tr key={i}>
                    <td style={{ ...td, color: DIM, fontSize: 11 }}>{r.label}</td>
                    <td style={{ ...td, ...mono, color: aW ? GREEN : TEXT }}>{aW ? '▲ ' : ''}{r.fmt(r.vA)}</td>
                    {pA !== pB && <td style={{ ...td, ...mono, color: bW ? GREEN : TEXT }}>{bW ? '▲ ' : ''}{r.fmt(r.vB)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {trendData.length > 0 && pA !== pB && (
        <div style={{ ...section }}>
          <div style={secTitle}>Shared Day Trend — Lines Picked</div>
          <div style={{ ...card, padding: '16px 0 8px 0' }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ left: 10, right: 20, top: 4, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date" tick={{ fill: DIM, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: DIM, fontSize: 10 }} />
                <Tooltip content={<DarkTip />} />
                <Legend wrapperStyle={{ color: DIM, fontSize: 11 }} />
                <Line type="monotone" dataKey={pA} stroke={AMBER} strokeWidth={2} dot={{ fill: AMBER, r: 3 }} connectNulls />
                <Line type="monotone" dataKey={pB} stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PICKER DETAIL TAB ────────────────────────────────────────────────────────
function PickerDetailTab({ allStats, pickerNames, allDates, externalPicker }: {
  allStats: DayStats[]; pickerNames: string[]; allDates: string[]; externalPicker?: string;
}) {
  const [sel, setSel] = useState(externalPicker || pickerNames[0] || '');
  useEffect(() => {
    if (externalPicker && pickerNames.includes(externalPicker)) setSel(externalPicker);
    else if (pickerNames.length > 0 && !pickerNames.includes(sel)) setSel(pickerNames[0]);
  }, [externalPicker, pickerNames]);

  const days = allStats.filter(s => s.pickerName === sel);
  const totalLines = days.reduce((s, d) => s + d.totalLines, 0);
  const totalOrders = days.reduce((s, d) => s + d.totalOrders, 0);
  const lphDays = days.filter(s => s.linesPerHour != null);
  const avgLph = lphDays.length ? lphDays.reduce((s, d) => s + d.linesPerHour!, 0) / lphDays.length : 0;
  const avgLpo = totalOrders > 0 ? totalLines / totalOrders : 0;
  const teamLphs = allStats.filter(s => s.linesPerHour != null);
  const teamAvgLph = teamLphs.length ? teamLphs.reduce((s, d) => s + d.linesPerHour!, 0) / teamLphs.length : 0;
  const vsTeam = teamAvgLph > 0 ? ((avgLph - teamAvgLph) / teamAvgLph) * 100 : 0;

  const trendData = allDates.map(d => ({
    date: fmtDate(d),
    lines: days.find(s => s.dateStr === d)?.totalLines ?? null,
    lph: days.find(s => s.dateStr === d)?.linesPerHour ?? null,
  }));

  const sortedDays = [...days].sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  const pickerGaps = days.flatMap(s => s.gapFlags).sort((a, b) => b.gapMinutes - a.gapMinutes);

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: DIM, marginBottom: 4, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Select Picker</div>
        {selEl(sel, setSel, pickerNames)}
      </div>

      <div style={{ ...section }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          <StatCard label="Total Lines" value={totalLines.toLocaleString()} />
          <StatCard label="Total Orders" value={totalOrders.toLocaleString()} />
          <StatCard label="Avg Lines/Hr" value={avgLph > 0 ? avgLph.toFixed(1) : '—'} />
          <StatCard label="Lines/Order" value={avgLpo > 0 ? avgLpo.toFixed(1) : '—'} color={TEXT} />
          <StatCard label="Days Worked" value={days.length} color={TEXT} />
          <StatCard label="vs Team Avg" value={vsTeam !== 0 ? `${vsTeam > 0 ? '+' : ''}${vsTeam.toFixed(1)}%` : '—'} color={vsTeam > 15 ? GREEN : vsTeam < -15 ? RED : YELLOW} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ ...card, padding: '14px 0 8px 0' }}>
          <div style={{ padding: '0 16px 6px', fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Daily Lines</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} margin={{ left: 10, right: 12, top: 4, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fill: DIM, fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: DIM, fontSize: 9 }} />
              <Tooltip content={<DarkTip />} />
              <Bar dataKey="lines" fill={AMBER} name="Lines" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ ...card, padding: '14px 0 8px 0' }}>
          <div style={{ padding: '0 16px 6px', fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Lines / Hr</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData.filter(d => d.lph != null)} margin={{ left: 10, right: 12, top: 4, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fill: DIM, fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: DIM, fontSize: 9 }} />
              <Tooltip content={<DarkTip />} />
              <Line type="monotone" dataKey="lph" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 3 }} name="L/Hr" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...section }}>
        <div style={secTitle}>Day-by-Day Breakdown</div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead><tr>
              {['Date','Lines','Orders','L/Hr','Ord/Hr','Avg L/Ord','Active Window','Rating','Gaps'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {sortedDays.map((s, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>{fmtDate(s.dateStr)}</td>
                  <td style={{ ...td, ...mono }}>{s.totalLines}</td>
                  <td style={{ ...td, ...mono }}>{s.totalOrders}</td>
                  <td style={{ ...td, ...mono }}>{s.linesPerHour != null ? s.linesPerHour.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono }}>{s.ordersPerHour != null ? s.ordersPerHour.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono }}>{s.avgLinesPerOrder > 0 ? s.avgLinesPerOrder.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>
                    {s.firstTime != null && s.lastTime != null
                      ? `${fmtMin(s.firstTime)}–${fmtMin(s.lastTime)} (${s.activeWindowMinutes}m)` : '—'}
                  </td>
                  <td style={td}>
                    {s.performanceRating && pill(
                      s.performanceRating.toUpperCase(),
                      s.performanceRating === 'green' ? GREEN : s.performanceRating === 'red' ? RED : YELLOW,
                      s.performanceRating === 'red' ? '#fff' : '#000'
                    )}
                  </td>
                  <td style={td}>
                    {s.gapFlags.length > 0 && (
                      <span style={{ color: DIM, ...mono, fontSize: 11 }}>{s.gapFlags.map(g => `${g.gapMinutes}m`).join(', ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pickerGaps.length > 0 && (
        <div style={{ ...section }}>
          <div style={secTitle}>Gap Flags</div>
          <div style={{ ...card, padding: 0 }}>
            <table style={tbl}>
              <thead><tr>
                {['Severity','Date','From','To','Gap'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pickerGaps.map((g, i) => (
                  <tr key={i}>
                    <td style={td}>{pill(g.severity.toUpperCase(), g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : BG3, g.severity === 'High' ? '#fff' : g.severity === 'Med' ? '#000' : DIM)}</td>
                    <td style={{ ...td, ...mono, fontSize: 11 }}>{fmtDate(g.dateStr)}</td>
                    <td style={{ ...td, ...mono }}>{fmtMin(g.fromMinutes)}</td>
                    <td style={{ ...td, ...mono }}>{fmtMin(g.toMinutes)}</td>
                    <td style={{ ...td, ...mono, color: g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : DIM }}>{g.gapMinutes}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GAP FLAGS TAB ────────────────────────────────────────────────────────────
function GapFlagsTab({ allGapFlags, setActiveTab, onPickerJump }: {
  allGapFlags: GapFlag[]; setActiveTab: (t: string) => void; onPickerJump: (p: string) => void;
}) {
  const sorted = [...allGapFlags].sort((a, b) => b.gapMinutes - a.gapMinutes);
  if (!sorted.length) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: DIM }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>No gap flags</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>All timestamps have gaps under 60 minutes.</div>
      </div>
    );
  }
  const high = sorted.filter(g => g.severity === 'High').length;
  const med  = sorted.filter(g => g.severity === 'Med').length;
  const low  = sorted.filter(g => g.severity === 'Low').length;

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard label="High ≥120m" value={high} color={high > 0 ? RED : DIM} />
        <StatCard label="Med 90–119m" value={med} color={med > 0 ? YELLOW : DIM} />
        <StatCard label="Low 60–89m" value={low} color={DIM} />
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={tbl}>
          <thead><tr>
            {['Severity','Picker','Date','From','To','Gap',''].map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {sorted.map((g, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                <td style={td}>{pill(g.severity.toUpperCase(), g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : BG3, g.severity === 'High' ? '#fff' : g.severity === 'Med' ? '#000' : DIM)}</td>
                <td style={td}>{g.pickerName}</td>
                <td style={{ ...td, ...mono, fontSize: 11 }}>{fmtDate(g.dateStr)}</td>
                <td style={{ ...td, ...mono }}>{fmtMin(g.fromMinutes)}</td>
                <td style={{ ...td, ...mono }}>{fmtMin(g.toMinutes)}</td>
                <td style={{ ...td, ...mono, color: g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : DIM }}>{g.gapMinutes}m</td>
                <td style={td}>
                  {btn('View →', () => { onPickerJump(g.pickerName); setActiveTab('picker-detail'); }, { padding: '3px 8px', fontSize: 10 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [pickerData, setPickerData] = useState<Record<string, PickerDayData>>({});
  const [fileHistory, setFileHistory] = useState<FileHistoryEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [jumpPicker, setJumpPicker] = useState('');
  const pickerDataRef = useRef(pickerData);
  pickerDataRef.current = pickerData;

  const handleFiles = useCallback((files: FileList) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const data = e.target?.result;
        if (!data) return;
        const wb = XLSX.read(data, { type: 'array' });
        const now = new Date();
        const entries: Record<string, PickerDayData> = {};
        for (const sheetName of wb.SheetNames) {
          const parsed = parseSheet(wb.Sheets[sheetName], sheetName, now);
          for (const [key, val] of Object.entries(parsed)) {
            entries[key] = { ...val, loadedAt: now };
          }
        }
        const cur = pickerDataRef.current;
        let added = 0, replaced = 0;
        for (const key of Object.keys(entries)) {
          if (cur[key]) replaced++; else added++;
        }
        setPickerData(prev => ({ ...prev, ...entries }));
        setLastUpdated(now);
        setFileHistory(h => [...h, { fileName: file.name, loadedAt: now, tabsLoaded: Object.keys(entries).length, recordsAdded: added, recordsReplaced: replaced }]);
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleClear = useCallback(() => {
    setPickerData({}); setFileHistory([]); setLastUpdated(null);
    setActiveTab('overview'); setShowHistory(false); setJumpPicker('');
  }, []);

  const { allStats, allDates, pickerNames, allGapFlags } = useMemo(() => {
    const statsArr = Object.values(pickerData).map(computeDayStats);
    const byDate = new Map<string, DayStats[]>();
    for (const s of statsArr) {
      if (!byDate.has(s.dateStr)) byDate.set(s.dateStr, []);
      byDate.get(s.dateStr)!.push(s);
    }
    assignRatings(byDate);
    const dates = [...new Set(statsArr.map(s => s.dateStr))].sort();
    const pickers = [...new Set(statsArr.map(s => s.pickerName))].sort();
    const gaps = statsArr.flatMap(s => s.gapFlags);
    return { allStats: statsArr, allDates: dates, pickerNames: pickers, allGapFlags: gaps };
  }, [pickerData]);

  const hasData = allStats.length > 0;

  const dateRange = allDates.length > 0
    ? { first: allDates[0], last: allDates[allDates.length - 1], days: allDates.length }
    : null;

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'DM Sans', 'Inter', ui-sans-serif, sans-serif", color: TEXT, fontSize: 13 }}>
      <Header lastUpdated={lastUpdated} onClear={handleClear} onToggleHistory={() => setShowHistory(v => !v)} hasData={hasData} dateRange={dateRange} />
      {showHistory && hasData && <FileHistoryPanel history={fileHistory} />}

      {!hasData ? (
        <DropZone onFiles={handleFiles} isDragging={isDragging} setIsDragging={setIsDragging} />
      ) : (
        <>
          <TabBar activeTab={activeTab} setActiveTab={setActiveTab} gapCount={allGapFlags.length} />
          <DropZone onFiles={handleFiles} isDragging={isDragging} setIsDragging={setIsDragging} compact />

          {activeTab === 'overview' && <OverviewTab allStats={allStats} allDates={allDates} pickerNames={pickerNames} allGapFlags={allGapFlags} />}
          {activeTab === 'weekly' && <WeeklyTab allStats={allStats} pickerNames={pickerNames} />}
          {activeTab === 'compare' && <CompareTab allStats={allStats} pickerNames={pickerNames} />}
          {activeTab === 'picker-detail' && <PickerDetailTab allStats={allStats} pickerNames={pickerNames} allDates={allDates} externalPicker={jumpPicker} />}
          {activeTab === 'gap-flags' && <GapFlagsTab allGapFlags={allGapFlags} setActiveTab={setActiveTab} onPickerJump={setJumpPicker} />}
        </>
      )}
    </div>
  );
}
