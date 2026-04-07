import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { Order, PickerDayRaw } from './parseUtils';
import { toDateStr } from './parseUtils';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BG   = '#08080F';
const BG2  = 'rgba(255,255,255,0.04)';
const BG3  = 'rgba(255,255,255,0.07)';
const AMBER  = '#FF9F0A';
const TEXT   = '#F5F5F7';
const DIM    = 'rgba(255,255,255,0.38)';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN  = '#30D158';
const YELLOW = '#FFD60A';
const RED    = '#FF453A';

const PICKER_COLORS = [
  '#FF9F0A','#3B82F6','#30D158','#BF5AF2',
  '#FF375F','#32D2F2','#FF6B35','#ACE834',
  '#7D7AFF','#2AC3C3',
];

// ─── TYPES ────────────────────────────────────────────────────────────────────
// Order is re-exported from parseUtils
export type { Order };

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

// ─── KPI COMPUTATION ──────────────────────────────────────────────────────────
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

/**
 * Some sheets contain a secondary block of pick data below the main section
 * (e.g. a different shift or date overflow).  Those rows have timestamps in the
 * 1–2 AM range (< 150 min from midnight) while the main shift runs from 5 AM
 * onwards (≥ 150 min).  When both groups are present we drop the early-morning
 * cluster from TIMING analysis — it only creates false gaps.  Line counts from
 * those same rows are still included in totals because the lines are real.
 */
function removePhantomTimes(times: number[]): number[] {
  if (times.length <= 1) return times;
  const PHANTOM_CUTOFF = 240; // 4:00 AM — before this is suspicious
  const earlyTimes = times.filter(t => t < PHANTOM_CUTOFF);
  const mainTimes  = times.filter(t => t >= PHANTOM_CUTOFF);
  // Only strip early-morning times when there is ALSO a main-shift cluster.
  // If ALL times are early-morning we keep them (might be a real night shift).
  if (earlyTimes.length > 0 && mainTimes.length > 0) return mainTimes;
  return times;
}

function computeDayStats(data: PickerDayData): DayStats {
  const { pickerName, dateStr, date, orders } = data;
  const totalOrders = orders.length;
  const totalLines  = orders.reduce((s, o) => s + o.linesPicked, 0);
  const rawTimes = orders.map(o => o.timeMinutes).filter((t): t is number => t !== null);
  const times = removePhantomTimes(rawTimes).sort((a, b) => a - b);
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

// ─── BATCH / CLUSTER ANALYSIS ─────────────────────────────────────────────────
// Timestamp structure: pickers enter orders one by one; only the LAST order of
// each run gets a timestamp. Orders with null timestamps are mid-batch. The
// timestamp closes the batch — everything since the previous close is one run.

interface Batch { orderCount: number; lineCount: number; }

function computeBatches(dayOrders: Order[]): Batch[] {
  // Same phantom logic as removePhantomTimes: if any timestamp >= 240 exists,
  // early-morning ones (< 240) are phantom and do NOT close a batch.
  const allTimes = dayOrders.map(o => o.timeMinutes).filter((t): t is number => t !== null);
  const hasMain = allTimes.some(t => t >= 240);
  const closesRun = (t: number | null) => t !== null && !(hasMain && t < 240);

  const batches: Batch[] = [];
  let cur: Order[] = [];
  for (const order of dayOrders) {
    cur.push(order);
    if (closesRun(order.timeMinutes)) {
      batches.push({ orderCount: cur.length, lineCount: cur.reduce((s, o) => s + o.linesPicked, 0) });
      cur = [];
    }
    // null or phantom timestamp → order stays in current accumulation
  }
  // any remaining cur = incomplete run with no closing timestamp yet — ignore
  return batches;
}

function pickerBatchStats(pickerDays: PickerDayData[]) {
  // Compute per-day to avoid merging runs across day boundaries
  const allBatches = pickerDays.flatMap(d => computeBatches(d.orders));
  if (!allBatches.length) return null;
  const avgOrders = allBatches.reduce((s, b) => s + b.orderCount, 0) / allBatches.length;
  const avgLines  = allBatches.reduce((s, b) => s + b.lineCount,  0) / allBatches.length;
  const maxBatch  = Math.max(...allBatches.map(b => b.orderCount));
  return { batches: allBatches, avgOrders, avgLines, maxBatch, totalRuns: allBatches.length };
}

// ─── PERFORMANCE SCORE ENGINE ────────────────────────────────────────────────
interface KpiResult { pts: number; max: number; rawValue: string; label: string; }
interface PickerScore {
  total: number; band: string; bandColor: string;
  pickRate: KpiResult; consistency: KpiResult; uptime: KpiResult;
  batchEff: KpiResult; trend: KpiResult;
}
function computePickerScore(
  picker: string,
  allStats: DayStats[],
  allGapFlags: GapFlag[],
  pickerData: Record<string, PickerDayData>,
): PickerScore {
  const days     = allStats.filter(s => s.pickerName === picker);
  const lphDays  = days.filter(d => d.linesPerHour != null);

  // 1. Pick Rate (max 35 pts) ─────────────────────────────────────────────────
  const pickerAvgLph = lphDays.length
    ? lphDays.reduce((s, d) => s + d.linesPerHour!, 0) / lphDays.length : 0;
  const teamLphs     = allStats.filter(s => s.linesPerHour != null);
  const teamAvgLph   = teamLphs.length
    ? teamLphs.reduce((s, d) => s + d.linesPerHour!, 0) / teamLphs.length : 0;
  const ratio        = teamAvgLph > 0 ? pickerAvgLph / teamAvgLph : 0;
  // 100 % of team ≈ 25 pts; 120 %+ → 35 pts; scales linearly; floor 5
  const pickRatePts  = Math.round(Math.max(5, Math.min(35, ratio * 29.2)));

  // 2. Consistency (max 25 pts) ───────────────────────────────────────────────
  let consistencyPts = 12;
  let cvLabel        = 'Insufficient data (need ≥3 days)';
  if (lphDays.length >= 3) {
    const mean     = pickerAvgLph;
    const variance = lphDays.reduce((s, d) => s + Math.pow(d.linesPerHour! - mean, 2), 0) / lphDays.length;
    const cv       = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 100;
    cvLabel        = `${cv.toFixed(0)}% day-to-day variation`;
    if      (cv < 10) consistencyPts = 25;
    else if (cv < 15) consistencyPts = 20;
    else if (cv < 25) consistencyPts = 15;
    else if (cv < 35) consistencyPts = 8;
    else              consistencyPts = 3;
  }

  // 3. Uptime (max 20 pts) ────────────────────────────────────────────────────
  const pickerFlags    = allGapFlags.filter(f => f.pickerName === picker);
  const daysWorked     = Math.max(1, days.length);
  const penaltyByDay: Record<string, number> = {};
  for (const f of pickerFlags) {
    const p = f.severity === 'High' ? 15 : f.severity === 'Med' ? 9 : 4;
    penaltyByDay[f.dateStr] = (penaltyByDay[f.dateStr] || 0) + p;
  }
  const totalPenalty = Object.values(penaltyByDay).reduce((s, v) => s + Math.min(v, 20), 0);
  const uptimePts    = Math.round(Math.max(0, 20 - totalPenalty / daysWorked));
  const flagLabel    = pickerFlags.length === 0
    ? 'No flags'
    : `${pickerFlags.length} flag${pickerFlags.length > 1 ? 's' : ''} across ${Object.keys(penaltyByDay).length} day(s)`;

  // 4. Batch Efficiency (max 10 pts) ──────────────────────────────────────────
  const pickerDays = Object.values(pickerData).filter(d => d.pickerName === picker);
  const allBatches = pickerDays.flatMap(d => computeBatches(d.orders));
  let batchPts     = 5;
  let batchLabel   = 'Insufficient run data (need ≥5)';
  if (allBatches.length >= 5) {
    const avg  = allBatches.reduce((s, b) => s + b.orderCount, 0) / allBatches.length;
    batchLabel = `${avg.toFixed(1)} avg orders per run`;
    if      (avg >= 4) batchPts = 10;
    else if (avg >= 3) batchPts = 8;
    else if (avg >= 2) batchPts = 5;
    else               batchPts = 2;
  }

  // 5. Trend (max 10 pts) ─────────────────────────────────────────────────────
  const sorted = [...lphDays].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  let trendPts   = 6;
  let trendLabel = 'Flat';
  const calcPct  = (early: typeof sorted, late: typeof sorted) => {
    if (!early.length || !late.length) return null;
    const ea = early.reduce((s, d) => s + d.linesPerHour!, 0) / early.length;
    const la = late.reduce((s, d)  => s + d.linesPerHour!, 0) / late.length;
    return ea > 0 ? ((la - ea) / ea) * 100 : 0;
  };
  const applyPct = (pct: number) => {
    if      (pct >   5) { trendPts = 10; trendLabel = `Improving +${pct.toFixed(0)}%`; }
    else if (pct >  -5) { trendPts =  6; trendLabel = `Flat (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)`; }
    else if (pct > -15) { trendPts =  3; trendLabel = `Declining ${pct.toFixed(0)}%`; }
    else                { trendPts =  0; trendLabel = `Declining ${pct.toFixed(0)}%`; }
  };
  if (sorted.length >= 6) {
    const prior = sorted.slice(-10, -5);
    const pct   = calcPct(prior.length >= 1 ? prior : sorted.slice(0, Math.floor(sorted.length / 2)), sorted.slice(-5));
    if (pct !== null) applyPct(pct);
  } else if (sorted.length >= 3) {
    const half = Math.floor(sorted.length / 2);
    const pct  = calcPct(sorted.slice(0, half), sorted.slice(half));
    if (pct !== null) applyPct(pct);
  }

  const total = pickRatePts + consistencyPts + uptimePts + batchPts + trendPts;
  let band = 'Needs Focus', bandColor = RED;
  if      (total >= 85) { band = 'Elite';      bandColor = '#00E5FF'; }
  else if (total >= 70) { band = 'Strong';     bandColor = GREEN; }
  else if (total >= 55) { band = 'Solid';      bandColor = AMBER; }
  else if (total >= 40) { band = 'Developing'; bandColor = YELLOW; }

  return {
    total, band, bandColor,
    pickRate:    { pts: pickRatePts,    max: 35, rawValue: pickerAvgLph > 0 ? `${pickerAvgLph.toFixed(1)} L/Hr` : 'No timing data', label: 'Pick Rate' },
    consistency: { pts: consistencyPts, max: 25, rawValue: cvLabel,      label: 'Consistency' },
    uptime:      { pts: uptimePts,      max: 20, rawValue: flagLabel,     label: 'Uptime' },
    batchEff:    { pts: batchPts,       max: 10, rawValue: batchLabel,    label: 'Batch Efficiency' },
    trend:       { pts: trendPts,       max: 10, rawValue: trendLabel,    label: 'Trend (recent vs prior)' },
  };
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const mono: React.CSSProperties = { fontFamily: "'SF Mono', ui-monospace, 'Cascadia Code', 'Fira Code', Menlo, monospace" };
const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 16,
  boxShadow: '0 4px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
};
const card: React.CSSProperties = { ...glass, padding: 20 };
const th: React.CSSProperties = { padding: '10px 14px', fontSize: 10, color: DIM, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)', textTransform: 'uppercase', letterSpacing: '0.11em', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const section: React.CSSProperties = { marginBottom: 32 };
const secTitle: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, marginBottom: 14 };

function pill(text: string, bg: string, fg: string): React.ReactElement {
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: bg, color: fg, ...mono, letterSpacing: '0.04em' }}>{text}</span>;
}
function btn(label: string, onClick: () => void, style?: React.CSSProperties): React.ReactElement {
  return <button onClick={onClick} style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)', color: TEXT, fontFamily: 'inherit', letterSpacing: '0.01em', transition: 'all 0.15s', ...style }}>{label}</button>;
}
function Dropdown({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', minWidth: 160 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)', color: TEXT, fontFamily: 'inherit', outline: 'none' }}
      >
        <span>{value || '—'}</span>
        <span style={{ color: DIM, fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200, background: 'rgba(18,18,28,0.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: 280, overflowY: 'auto' }}>
          {options.map(o => (
            <div
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: o === value ? AMBER : TEXT, background: o === value ? 'rgba(255,159,10,0.1)' : 'transparent', transition: 'background 0.1s', fontFamily: 'inherit' }}
              onMouseEnter={e => { if (o !== value) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (o !== value) (e.target as HTMLElement).style.background = 'transparent'; }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RAW ORDERS EXPAND PANEL ──────────────────────────────────────────────────
const PHANTOM_CUTOFF_DISPLAY = 240;

function RawOrdersExpand({ orders, gapFrom, gapTo, colSpan }: {
  orders: Order[];
  gapFrom?: number;
  gapTo?: number;
  colSpan: number;
}) {
  const allTimes = orders.map(o => o.timeMinutes).filter((t): t is number => t !== null);
  const hasMain = allTimes.some(t => t >= PHANTOM_CUTOFF_DISPLAY);

  const sorted = [...orders].sort((a, b) => {
    if (a.timeMinutes === null && b.timeMinutes === null) return 0;
    if (a.timeMinutes === null) return 1;
    if (b.timeMinutes === null) return -1;
    return a.timeMinutes - b.timeMinutes;
  });

  const totalLines = orders.reduce((s, o) => s + o.linesPicked, 0);
  const timestamped = allTimes.length;

  // Build row list, inserting a gap divider between fromMinutes and toMinutes
  type RowItem = { kind: 'order'; order: Order; idx: number } | { kind: 'divider' };
  const rows: RowItem[] = [];
  let dividerDone = false;
  sorted.forEach((order, idx) => {
    if (!dividerDone && gapFrom !== undefined && gapTo !== undefined
        && order.timeMinutes !== null && order.timeMinutes >= gapTo) {
      rows.push({ kind: 'divider' });
      dividerDone = true;
    }
    rows.push({ kind: 'order', order, idx });
  });

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '14px 22px 16px' }}>
          <div style={{ fontSize: 10, color: DIM, marginBottom: 10, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Raw parsed orders — {orders.length} total · {timestamped} timestamped · {totalLines} lines picked
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 4, border: `1px solid ${BORDER}` }}>
            <table style={{ ...tbl, fontSize: 11 }}>
              <thead>
                <tr>
                  {['Order #', 'Lines', 'Parsed Time', 'Note'].map(h => (
                    <th key={h} style={{ ...th, fontSize: 10, position: 'sticky', top: 0, background: BG3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  if (row.kind === 'divider') {
                    const gapLen = gapTo! - gapFrom!;
                    return (
                      <tr key={`div-${i}`}>
                        <td colSpan={4} style={{ padding: '5px 12px', fontSize: 10, color: RED, fontStyle: 'italic', borderTop: `1px dashed rgba(239,68,68,0.4)`, borderBottom: `1px dashed rgba(239,68,68,0.4)`, background: 'rgba(239,68,68,0.06)', textAlign: 'center', ...mono }}>
                          ↑ last pick before gap · {gapLen}m gap · first pick after gap ↓
                        </td>
                      </tr>
                    );
                  }
                  const { order } = row;
                  const isPhantom = order.timeMinutes !== null && hasMain && order.timeMinutes < PHANTOM_CUTOFF_DISPLAY;
                  const isBoundary = order.timeMinutes === gapFrom || order.timeMinutes === gapTo;
                  return (
                    <tr key={`ord-${i}`} style={{ background: isBoundary ? 'rgba(245,166,35,0.07)' : 'transparent' }}>
                      <td style={{ ...td, ...mono, fontSize: 11, color: isPhantom ? DIM : TEXT }}>{order.orderNumber}</td>
                      <td style={{ ...td, ...mono, fontSize: 11, color: isPhantom ? DIM : TEXT }}>{order.linesPicked}</td>
                      <td style={{ ...td, ...mono, fontSize: 11, color: isPhantom ? '#7f4444' : isBoundary ? AMBER : order.timeMinutes !== null ? TEXT : DIM }}>
                        {order.timeMinutes !== null ? fmtMin(order.timeMinutes) : '—'}
                      </td>
                      <td style={{ ...td, fontSize: 10, color: DIM, fontStyle: 'italic' }}>
                        {isPhantom ? 'filtered — phantom timestamp' : isBoundary && order.timeMinutes === gapFrom ? 'gap starts here' : isBoundary && order.timeMinutes === gapTo ? 'gap ends here' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── RECHARTS TOOLTIP ─────────────────────────────────────────────────────────
const DarkTip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ ...glass, padding: '10px 14px', fontSize: 11 }}>
      {label && <div style={{ color: DIM, marginBottom: 6, fontSize: 10, letterSpacing: '0.06em' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, ...mono, marginBottom: 2 }}>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(8,8,15,0.75)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: TEXT }}>
          Pick<span style={{ color: AMBER }}> Track</span>
        </span>
        {dateRange && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.22)', borderRadius: 20, padding: '3px 12px' }}>
            <span style={{ ...mono, fontSize: 12, color: AMBER }}>{fmtDate(dateRange.first)}</span>
            {dateRange.first !== dateRange.last && (
              <>
                <span style={{ color: DIM, fontSize: 10 }}>→</span>
                <span style={{ ...mono, fontSize: 12, color: AMBER }}>{fmtDate(dateRange.last)}</span>
              </>
            )}
            <span style={{ fontSize: 10, color: DIM }}>· {dateRange.days}d</span>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {lastUpdated && <span style={{ fontSize: 11, color: DIM, ...mono }}>{lastUpdated.toLocaleTimeString()}</span>}
        {hasData && btn('History', onToggleHistory)}
        {hasData && btn('Clear', onClear, { color: RED, borderColor: 'rgba(255,69,58,0.35)', background: 'rgba(255,69,58,0.08)' })}
      </div>
    </div>
  );
}

// ─── FILE HISTORY PANEL ───────────────────────────────────────────────────────
function FileHistoryPanel({ history }: { history: FileHistoryEntry[] }) {
  return (
    <div style={{ background: 'rgba(8,8,15,0.6)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 28px' }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>File History</div>
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
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 28px', background: 'rgba(8,8,15,0.6)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', gap: 12 }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={e => e.target.files && onFiles(e.target.files)} />
        <button onClick={() => inputRef.current?.click()} style={{ padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: AMBER, color: '#000', fontFamily: 'inherit' }}>+ Load File</button>
        <span style={{ fontSize: 11, color: DIM }}>Drop an xlsx anywhere to update data</span>
        {isDragging && <span style={{ color: AMBER, fontSize: 11, ...mono }}>● Drop now</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 24px', minHeight: '70vh' }}>
      <div
        style={{ ...glass, border: `2px dashed ${isDragging ? AMBER : 'rgba(255,255,255,0.12)'}`, borderRadius: 24, padding: '60px 48px', textAlign: 'center', background: isDragging ? 'rgba(255,159,10,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s ease', maxWidth: 520, width: '100%' }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={e => e.target.files && onFiles(e.target.files)} />
        <div style={{ fontSize: 44, marginBottom: 18, opacity: 0.9 }}>📊</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 10, color: isDragging ? AMBER : TEXT, letterSpacing: '-0.01em' }}>Drop your Excel file here</div>
        <div style={{ fontSize: 13, color: DIM, marginBottom: 28, lineHeight: 1.7 }}>
          Date-named tabs (412026, 4102026…)<br />Wide format: Order · Lines · Time repeating per picker
        </div>
        <button style={{ padding: '10px 28px', borderRadius: 22, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: AMBER, color: '#000', fontFamily: 'inherit', letterSpacing: '0.01em' }}>Browse File</button>
      </div>
    </div>
  );
}

// ─── SCORE TAB ────────────────────────────────────────────────────────────────
const KPI_META = [
  {
    key: 'pickRate' as const, color: AMBER, max: 35,
    what: 'Your rolling average Lines per Hour (L/Hr) compared to the team average. This is the core measure of raw productivity.',
    rows: [
      ['≥ 120% of team avg', '35 pts'],
      ['100% of team avg',   '~25 pts'],
      ['80% of team avg',    '~15 pts'],
      ['< 60% of team avg',  '5 pts (floor)'],
    ],
    note: 'Score scales smoothly between thresholds — never falls below 5 pts so everyone gets credit for working.',
  },
  {
    key: 'consistency' as const, color: GREEN, max: 25,
    what: 'How steady your output is day to day, measured by Coefficient of Variation (CV) — your standard deviation divided by your mean L/Hr, as a percentage. Lower CV = more reliable output.',
    rows: [
      ['CV < 10%  — rock solid',    '25 pts'],
      ['CV 10–15%',                 '20 pts'],
      ['CV 15–25%',                 '15 pts'],
      ['CV 25–35%',                 '8 pts'],
      ['CV > 35%  — very erratic',  '3 pts'],
    ],
    note: 'Requires ≥3 days of timing data. Earns 12 pts (midpoint) until enough data is available.',
  },
  {
    key: 'uptime' as const, color: '#32D2F2', max: 20,
    what: 'How much of your shift you spend actively picking, measured by unexplained gap flags — periods between two consecutive runs longer than expected with no recorded picks.',
    rows: [
      ['No flags',                          '20 pts'],
      ['Low flag (60–89 min gap)',           '−4 pts per flag-day'],
      ['Med flag (90–119 min gap)',          '−9 pts per flag-day'],
      ['High flag (120+ min gap)',           '−15 pts per flag-day'],
    ],
    note: 'Penalties are averaged across all days worked, so occasional flags matter less the more days you have on record.',
  },
  {
    key: 'batchEff' as const, color: '#BF5AF2', max: 10,
    what: 'Average number of orders you grab per run to staging. More orders per trip = fewer trips for the same work = smarter use of shift time.',
    rows: [
      ['≥ 4.0 orders per run', '10 pts'],
      ['3.0–3.9',              '8 pts'],
      ['2.0–2.9',              '5 pts'],
      ['< 2.0',                '2 pts'],
    ],
    note: 'Requires ≥5 completed runs to calculate. Earns 5 pts (midpoint) until enough run data is available.',
  },
  {
    key: 'trend' as const, color: YELLOW, max: 10,
    what: 'Whether your L/Hr is improving or declining recently. Compares your last 5 days against the 5 days before that. If fewer than 10 days are available, the data is split in half.',
    rows: [
      ['Improving > +5%',   '10 pts'],
      ['Flat (±5%)',         '6 pts'],
      ['Declining 5–15%',   '3 pts'],
      ['Declining > 15%',   '0 pts'],
    ],
    note: 'Requires ≥3 days of timing data. Defaults to 6 pts (flat) when not enough data is available.',
  },
] as const;

const SCORE_BANDS = [
  { range: '85–100', label: 'Elite',       color: '#00E5FF' },
  { range: '70–84',  label: 'Strong',      color: GREEN },
  { range: '55–69',  label: 'Solid',       color: AMBER },
  { range: '40–54',  label: 'Developing',  color: YELLOW },
  { range: '0–39',   label: 'Needs Focus', color: RED },
];

function ScoreTab({ allStats, allGapFlags, pickerNames, pickerData }: {
  allStats: DayStats[]; allGapFlags: GapFlag[];
  pickerNames: string[]; pickerData: Record<string, PickerDayData>;
}) {
  const [sel, setSel]         = useState(pickerNames[0] || '');
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    if (pickerNames.length > 0 && !pickerNames.includes(sel)) setSel(pickerNames[0]);
  }, [pickerNames]);

  const scores = useMemo(() =>
    pickerNames
      .map(p => ({ name: p, score: computePickerScore(p, allStats, allGapFlags, pickerData) }))
      .sort((a, b) => b.score.total - a.score.total),
    [pickerNames, allStats, allGapFlags, pickerData],
  );

  const selScore = useMemo(() =>
    computePickerScore(sel, allStats, allGapFlags, pickerData),
    [sel, allStats, allGapFlags, pickerData],
  );

  const rank = scores.findIndex(s => s.name === sel) + 1;

  if (!pickerNames.length) {
    return <div style={{ padding: 60, textAlign: 'center', color: DIM }}>No data loaded.</div>;
  }

  const kpiOrder: (keyof Omit<PickerScore, 'total' | 'band' | 'bandColor'>)[] =
    ['pickRate', 'consistency', 'uptime', 'batchEff', 'trend'];

  return (
    <div style={{ padding: '28px 28px', maxWidth: 920, margin: '0 auto' }}>

      {/* ── Team Leaderboard ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={secTitle}>Team Leaderboard</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {scores.map((s, i) => (
            <button key={s.name} onClick={() => setSel(s.name)}
              style={{
                ...glass, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', borderRadius: 14, transition: 'all 0.15s',
                border: s.name === sel
                  ? `1px solid ${s.score.bandColor}`
                  : '1px solid rgba(255,255,255,0.09)',
                background: s.name === sel
                  ? `${s.score.bandColor}1A`
                  : 'rgba(255,255,255,0.04)',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: DIM }}>#{i + 1}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: s.score.bandColor, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{s.score.band}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.score.bandColor, ...mono, lineHeight: 1 }}>{s.score.total}</div>
              <div style={{ fontSize: 9, color: DIM, marginTop: 2 }}>/ 100</div>
              <div style={{ marginTop: 10, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${s.score.total}%`, background: s.score.bandColor, borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Individual Score Card ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={secTitle}>Score Breakdown</div>
          <Dropdown value={sel} onChange={setSel} options={pickerNames} />
          <div style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>
            Ranked <span style={{ color: TEXT, fontWeight: 600 }}>#{rank}</span> of {scores.length}
          </div>
        </div>

        <div style={{ ...card, padding: 28 }}>

          {/* Score ring + name/band */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 28, flexWrap: 'wrap' }}>
            {(() => {
              const r = 51, circ = 2 * Math.PI * r;
              const fill = (selScore.total / 100) * circ;
              return (
                <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                  <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={60} cy={60} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />
                    <circle cx={60} cy={60} r={r} fill="none" stroke={selScore.bandColor} strokeWidth={10}
                      strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 34, fontWeight: 700, color: selScore.bandColor, ...mono, lineHeight: 1 }}>{selScore.total}</div>
                    <div style={{ fontSize: 10, color: DIM }}>/ 100</div>
                  </div>
                </div>
              );
            })()}
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{sel}</div>
              <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: `${selScore.bandColor}22`, border: `1px solid ${selScore.bandColor}55`, fontSize: 12, fontWeight: 700, color: selScore.bandColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {selScore.band}
              </div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 10 }}>
                Ranked #{rank} of {scores.length} · Based on {allStats.filter(s => s.pickerName === sel).length} days of data
              </div>
            </div>
          </div>

          {/* KPI rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {kpiOrder.map((key, i) => {
              const kpi   = selScore[key] as KpiResult;
              const meta  = KPI_META[i];
              const pct   = (kpi.pts / kpi.max) * 100;
              const col   = meta.color;
              const isLast = i === kpiOrder.length - 1;
              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr auto 90px', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: col }}>{kpi.label}</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>{kpi.rawValue}</div>
                    <div style={{ marginTop: 8, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, maxWidth: 320 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: col, ...mono }}>{kpi.pts}</span>
                    <span style={{ fontSize: 11, color: DIM }}> / {kpi.max} pts</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total Score</div>
            <div>
              <span style={{ fontSize: 28, fontWeight: 700, color: selScore.bandColor, ...mono }}>{selScore.total}</span>
              <span style={{ fontSize: 13, color: DIM }}> / 100</span>
            </div>
          </div>

          {/* ── How is this score calculated? ──────────────────────────────────── */}
          <div style={{ marginTop: 22, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 18 }}>
            <button onClick={() => setShowHow(h => !h)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, padding: 0, color: DIM, letterSpacing: '0.03em' }}>
              <span style={{ fontSize: 11, display: 'inline-block', transition: 'transform 0.2s', transform: showHow ? 'rotate(90deg)' : 'none' }}>▶</span>
              How is this score calculated?
            </button>

            {showHow && (
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Intro */}
                <div style={{ fontSize: 12, color: DIM, lineHeight: 1.75, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px' }}>
                  This score is built on <strong style={{ color: TEXT }}>5 different indicators</strong> that together measure picking performance.
                  Each indicator contributes a fixed number of points towards the score, which is simply the sum of all five.
                  The breakdown above tells you exactly where to improve.
                </div>

                {/* One card per KPI */}
                {KPI_META.map(meta => (
                  <div key={meta.key} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}33`, borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{selScore[meta.key].label}</div>
                      <div style={{ fontSize: 10, color: DIM, ...mono }}>max {meta.max} pts</div>
                    </div>
                    <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.75, marginBottom: 14 }}>{meta.what}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, padding: '6px 0', fontSize: 9 }}>Condition</th>
                          <th style={{ ...th, padding: '6px 0', fontSize: 9, textAlign: 'right' }}>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meta.rows.map(([cond, pts]) => (
                          <tr key={cond}>
                            <td style={{ ...td, fontSize: 11, color: DIM, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{cond}</td>
                            <td style={{ ...td, fontSize: 11, fontWeight: 700, color: meta.color, padding: '6px 0', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.03)', ...mono }}>{pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ fontSize: 10, color: DIM, lineHeight: 1.65, fontStyle: 'italic' }}>{meta.note}</div>
                  </div>
                ))}

                {/* Score bands */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Score Bands</div>
                  {SCORE_BANDS.map(b => (
                    <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 12, color: DIM, ...mono }}>{b.range}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: b.color }}>{b.label}</span>
                    </div>
                  ))}
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',      label: 'Overview' },
  { id: 'score',         label: 'Score' },
  { id: 'weekly',        label: 'Weekly' },
  { id: 'compare',       label: 'Compare' },
  { id: 'picker-detail', label: 'Picker Detail' },
  { id: 'gap-flags',     label: 'Gap Flags' },
];
function TabBar({ activeTab, setActiveTab, gapCount }: { activeTab: string; setActiveTab: (t: string) => void; gapCount: number }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,8,15,0.5)', backdropFilter: 'blur(20px)', paddingLeft: 20, paddingRight: 20, gap: 2 }}>
      {TABS.map(t => {
        const active = activeTab === t.id;
        return (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: '12px 16px', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? TEXT : DIM, borderBottom: `2px solid ${active ? AMBER : 'transparent'}`, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0, outline: 'none', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s, border-color 0.15s', letterSpacing: '0.01em' }}>
            {t.label}
            {t.id === 'gap-flags' && gapCount > 0 && (
              <span style={{ background: RED, color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}>{gapCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, padding: '16px 20px' }}>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: '0.13em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: color || AMBER, ...mono, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: DIM, marginTop: 6, letterSpacing: '0.02em' }}>{sub}</div>}
    </div>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ allStats, allDates, pickerNames, allGapFlags, pickerData }: {
  allStats: DayStats[]; allDates: string[]; pickerNames: string[]; allGapFlags: GapFlag[];
  pickerData: Record<string, PickerDayData>;
}) {
  const latestDate = allDates[allDates.length - 1] ?? '';
  const todayStats = allStats.filter(s => s.dateStr === latestDate);
  const todayLines = todayStats.reduce((s, d) => s + d.totalLines, 0);
  const todayOrders = todayStats.reduce((s, d) => s + d.totalOrders, 0);
  const todayLphArr = todayStats.filter(s => s.linesPerHour !== null);
  const todayAvgLph = todayLphArr.length ? todayLphArr.reduce((s, d) => s + d.linesPerHour!, 0) / todayLphArr.length : 0;
  const totalLinesAll = allStats.reduce((s, d) => s + d.totalLines, 0);
  const totalOrdersAll = allStats.reduce((s, d) => s + d.totalOrders, 0);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);

  const batchRows = useMemo(() => pickerNames.map((name, i) => {
    const days = Object.values(pickerData).filter(d => d.pickerName === name);
    const bs = pickerBatchStats(days);
    return { name, bs, color: PICKER_COLORS[i % PICKER_COLORS.length] };
  }).filter(r => r.bs !== null) as { name: string; bs: NonNullable<ReturnType<typeof pickerBatchStats>>; color: string }[], [pickerData, pickerNames]);

  const maxAvgOrders = batchRows.length ? Math.max(...batchRows.map(r => r.bs.avgOrders)) : 1;

  const leaderboard = useMemo(() => pickerNames.map((name, i) => {
    const days = allStats.filter(s => s.pickerName === name);
    const lphDays = days.filter(s => s.linesPerHour !== null);
    const avgLph = lphDays.length ? lphDays.reduce((s, d) => s + d.linesPerHour!, 0) / lphDays.length : 0;
    const totalLines = days.reduce((s, d) => s + d.totalLines, 0);
    const totalOrders = days.reduce((s, d) => s + d.totalOrders, 0);
    return { name, avgLph, totalLines, totalOrders, daysWorked: days.length, color: PICKER_COLORS[i % PICKER_COLORS.length] };
  }).sort((a, b) => b.avgLph - a.avgLph), [allStats, pickerNames]);

  const chartData = useMemo(() => allDates.map(ds => {
    const byDate = allStats.filter(s => s.dateStr === ds);
    const obj: Record<string, string | number> = { date: fmtDate(ds) };
    pickerNames.forEach(n => { obj[n] = byDate.find(s => s.pickerName === n)?.totalLines ?? 0; });
    return obj;
  }), [allDates, allStats, pickerNames]);

  const tableRows = useMemo(() =>
    [...allStats].sort((a, b) => b.dateStr.localeCompare(a.dateStr) || a.pickerName.localeCompare(b.pickerName)),
  [allStats]);

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE);
  const pageRows = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
        <div style={secTitle}>Team Snapshot — Avg Lines / Hr</div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {leaderboard.map((p) => (
            <div key={p.name} style={{ ...card, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: DIM }}>{p.daysWorked}d logged</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: AMBER, ...mono }}>{p.avgLph > 0 ? p.avgLph.toFixed(1) : '—'}</div>
              <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>{p.totalLines.toLocaleString()} lines · {p.totalOrders} orders</div>
            </div>
          ))}
        </div>
      </div>

      {batchRows.length > 0 && (
        <div style={{ ...section }}>
          <div style={secTitle}>Order Clustering — Avg Orders per Run <span style={{ fontSize: 10, color: DIM, fontWeight: 400 }}>timestamp on last order of each run</span></div>
          <div style={{ ...card, padding: '20px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[...batchRows].sort((a, b) => b.bs.avgOrders - a.bs.avgOrders).map(r => {
                const pct = (r.bs.avgOrders / maxAvgOrders) * 100;
                return (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 110, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{r.name.split(' ')[0]}</div>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: r.color, borderRadius: 6, minWidth: 4, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: r.color, width: 34, textAlign: 'right' }}>{r.bs.avgOrders.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: DIM, width: 96, flexShrink: 0 }}>avg {r.bs.avgLines.toFixed(1)} L/run</div>
                    <div style={{ fontSize: 11, color: DIM, width: 70, flexShrink: 0 }}>max {r.bs.maxBatch} orders</div>
                    <div style={{ fontSize: 11, color: DIM, width: 60, flexShrink: 0 }}>{r.bs.totalRuns} runs</div>
                  </div>
                );
              })}
            </div>
            {(() => {
              const sorted = [...batchRows].sort((a, b) => b.bs.avgOrders - a.bs.avgOrders);
              const top = sorted[0];
              const bot = sorted[sorted.length - 1];
              if (!top || top.name === bot.name) return null;
              const diff = ((top.bs.avgOrders - bot.bs.avgOrders) / bot.bs.avgOrders * 100);
              return (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10 }}>
                  <span style={{ background: 'rgba(48,209,88,0.12)', color: GREEN, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 600 }}>
                    Biggest batches: {top.name.split(' ')[0]} ({top.bs.avgOrders.toFixed(1)} orders/run)
                  </span>
                  {diff > 10 && (
                    <span style={{ background: 'rgba(255,159,10,0.1)', color: AMBER, borderRadius: 20, padding: '3px 12px', fontSize: 11 }}>
                      {diff.toFixed(0)}% more per run than {bot.name.split(' ')[0]}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div style={{ ...section }}>
          <div style={secTitle}>Daily Lines by Picker</div>
          <div style={{ ...card, padding: '16px 0 0 0' }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ left: 10, right: 20, top: 4, bottom: 46 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: DIM, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: DIM, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTip />} />
                {pickerNames.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={PICKER_COLORS[i % PICKER_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', padding: '10px 20px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {pickerNames.map((name, i) => (
                <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PICKER_COLORS[i % PICKER_COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: DIM }}>{name.split(' ')[0]}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ ...section }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={secTitle}>Full Daily Breakdown <span style={{ fontSize: 11, color: DIM, fontWeight: 400 }}>({tableRows.length} records)</span></div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {btn('‹', () => setPage(p => Math.max(0, p - 1)), { padding: '4px 10px', opacity: page === 0 ? 0.35 : 1 })}
              <span style={{ fontSize: 11, color: DIM }}>{page + 1} / {totalPages}</span>
              {btn('›', () => setPage(p => Math.min(totalPages - 1, p + 1)), { padding: '4px 10px', opacity: page === totalPages - 1 ? 0.35 : 1 })}
            </div>
          )}
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead><tr>
              {['Date','Picker','Lines','Orders','L/Hr','Ord/Hr','Avg L/Ord','Window','Gaps'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pageRows.map((s, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>{fmtDate(s.dateStr)}</td>
                  <td style={td}>{s.pickerName}</td>
                  <td style={{ ...td, ...mono }}>{s.totalLines}</td>
                  <td style={{ ...td, ...mono }}>{s.totalOrders}</td>
                  <td style={{ ...td, ...mono }}>{s.linesPerHour != null ? s.linesPerHour.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono }}>{s.ordersPerHour != null ? s.ordersPerHour.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono }}>{s.avgLinesPerOrder > 0 ? s.avgLinesPerOrder.toFixed(1) : '—'}</td>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>{s.firstTime != null && s.lastTime != null ? `${fmtMin(s.firstTime)}–${fmtMin(s.lastTime)}` : '—'}</td>
                  <td style={td}>{s.gapFlags.length > 0 && <span style={{ color: RED, ...mono }}>{s.gapFlags.length}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {btn('‹ Prev', () => setPage(p => Math.max(0, p - 1)), { opacity: page === 0 ? 0.35 : 1 })}
            <span style={{ fontSize: 11, color: DIM, alignSelf: 'center' }}>Page {page + 1} of {totalPages} · showing {pageRows.length} of {tableRows.length}</span>
            {btn('Next ›', () => setPage(p => Math.min(totalPages - 1, p + 1)), { opacity: page === totalPages - 1 ? 0.35 : 1 })}
          </div>
        )}
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

  // ── Day of week patterns ────────────────────────────────────────────────────
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon … Sat, Sun last
  const dowMap = new Map<number, DayStats[]>();
  for (const s of allStats) {
    const dow = new Date(s.dateStr + 'T12:00:00').getDay();
    if (!dowMap.has(dow)) dowMap.set(dow, []);
    dowMap.get(dow)!.push(s);
  }
  const dowData = DOW_ORDER.filter(d => dowMap.has(d)).map(d => {
    const items = dowMap.get(d)!;
    const lphItems = items.filter(x => x.linesPerHour != null);
    const avgLph = lphItems.length ? lphItems.reduce((s, x) => s + x.linesPerHour!, 0) / lphItems.length : 0;
    const totalLinesSum = items.reduce((s, x) => s + x.totalLines, 0);
    const uniqueDates = new Set(items.map(x => x.dateStr)).size;
    const avgTeamLines = uniqueDates > 0 ? Math.round(totalLinesSum / uniqueDates) : 0;
    return { day: DOW_NAMES[d], avgLph: +avgLph.toFixed(2), avgTeamLines, uniqueDates };
  });
  const dowMin = dowData.length ? dowData.reduce((a, b) => b.avgLph > 0 && (a.avgLph === 0 || b.avgLph < a.avgLph) ? b : a) : null;
  const dowMax = dowData.length ? dowData.reduce((a, b) => b.avgLph > a.avgLph ? b : a) : null;

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

      {dowData.length > 0 && (
        <div style={{ ...section }}>
          <div style={secTitle}>Day of Week Patterns</div>
          <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>
            Average team L/Hr and lines by day of week — steady differences may point to staffing or volume patterns.
          </div>

          {/* callout pills */}
          {dowMin && dowMax && dowMin.day !== dowMax.day && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(245,166,35,0.08)', border: `1px solid rgba(245,166,35,0.25)`, borderRadius: 6, padding: '8px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Highest</span>
                <span style={{ ...mono, color: GREEN, fontWeight: 700, fontSize: 14 }}>{dowMax.day}</span>
                <span style={{ ...mono, color: TEXT, fontSize: 13 }}>{dowMax.avgLph.toFixed(1)} L/Hr</span>
                <span style={{ fontSize: 11, color: DIM }}>· {dowMax.avgTeamLines.toLocaleString()} avg lines</span>
              </div>
              <div style={{ background: 'rgba(245,166,35,0.05)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Lowest</span>
                <span style={{ ...mono, color: YELLOW, fontWeight: 700, fontSize: 14 }}>{dowMin.day}</span>
                <span style={{ ...mono, color: TEXT, fontSize: 13 }}>{dowMin.avgLph.toFixed(1)} L/Hr</span>
                <span style={{ fontSize: 11, color: DIM }}>· {dowMin.avgTeamLines.toLocaleString()} avg lines</span>
              </div>
              {dowMax.avgLph > 0 && dowMin.avgLph > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', fontSize: 12, color: DIM }}>
                  Gap: <span style={{ ...mono, color: AMBER, marginLeft: 6 }}>{((dowMax.avgLph - dowMin.avgLph) / dowMin.avgLph * 100).toFixed(0)}% difference</span>
                </div>
              )}
            </div>
          )}

          {/* chart */}
          <div style={{ ...card, padding: '16px 0 8px 0' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dowData} margin={{ left: 10, right: 20, top: 4, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="day" tick={{ fill: DIM, fontSize: 11 }} />
                <YAxis tick={{ fill: DIM, fontSize: 10 }} />
                <Tooltip content={<DarkTip />} />
                {/* Two bars per day: avg L/Hr (amber) and avg team lines scaled */}
                <Bar dataKey="avgLph" name="Avg L/Hr" radius={[3, 3, 0, 0]}
                  fill={AMBER}
                  label={{ position: 'top', fill: DIM, fontSize: 9, formatter: (v: number) => v > 0 ? v.toFixed(1) : '' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* detail table */}
          <div style={{ ...card, padding: 0, overflowX: 'auto', marginTop: 12 }}>
            <table style={tbl}>
              <thead><tr>
                {['Day', 'Avg L/Hr', 'Avg Team Lines', 'Days Logged'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[...dowData].sort((a, b) => b.avgLph - a.avgLph).map((row, i) => {
                  const isMax = dowMax?.day === row.day;
                  const isMin = dowMin?.day === row.day && dowMin.day !== dowMax?.day;
                  return (
                    <tr key={row.day} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{row.day}</td>
                      <td style={{ ...td, ...mono, color: isMax ? GREEN : isMin ? YELLOW : TEXT }}>{row.avgLph > 0 ? row.avgLph.toFixed(1) : '—'}</td>
                      <td style={{ ...td, ...mono }}>{row.avgTeamLines > 0 ? row.avgTeamLines.toLocaleString() : '—'}</td>
                      <td style={{ ...td, ...mono, color: DIM }}>{row.uniqueDates}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
        <div><div style={{ fontSize: 10, color: DIM, marginBottom: 4, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Picker A</div><Dropdown value={pA} onChange={setPA} options={pickerNames} /></div>
        <div style={{ color: DIM, fontSize: 18, paddingBottom: 6 }}>vs</div>
        <div><div style={{ fontSize: 10, color: DIM, marginBottom: 4, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Picker B</div><Dropdown value={pB} onChange={setPB} options={pickerNames} /></div>
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
function PickerDetailTab({ allStats, pickerNames, allDates, externalPicker, pickerData }: {
  allStats: DayStats[]; pickerNames: string[]; allDates: string[]; externalPicker?: string;
  pickerData: Record<string, PickerDayData>;
}) {
  const [sel, setSel] = useState(externalPicker || pickerNames[0] || '');
  const [expandedGapKey, setExpandedGapKey] = useState<string | null>(null);
  useEffect(() => {
    if (externalPicker && pickerNames.includes(externalPicker)) setSel(externalPicker);
    else if (pickerNames.length > 0 && !pickerNames.includes(sel)) setSel(pickerNames[0]);
  }, [externalPicker, pickerNames]);

  const teamAvgLph = useMemo(() => {
    const lphs = allStats.filter(s => s.linesPerHour != null);
    return lphs.length ? lphs.reduce((s, d) => s + d.linesPerHour!, 0) / lphs.length : 0;
  }, [allStats]);

  const teamAvgLpo = useMemo(() => {
    const tl = allStats.reduce((s, d) => s + d.totalLines, 0);
    const to = allStats.reduce((s, d) => s + d.totalOrders, 0);
    return to > 0 ? tl / to : 0;
  }, [allStats]);

  const days = useMemo(() => allStats.filter(s => s.pickerName === sel), [allStats, sel]);
  const totalLines = days.reduce((s, d) => s + d.totalLines, 0);
  const totalOrders = days.reduce((s, d) => s + d.totalOrders, 0);
  const lphDays = days.filter(s => s.linesPerHour != null);
  const avgLph = lphDays.length ? lphDays.reduce((s, d) => s + d.linesPerHour!, 0) / lphDays.length : 0;
  const avgLpo = totalOrders > 0 ? totalLines / totalOrders : 0;
  const vsTeam  = teamAvgLph > 0 ? ((avgLph  - teamAvgLph)  / teamAvgLph)  * 100 : 0;
  const vsTeamLpo = teamAvgLpo > 0 ? ((avgLpo - teamAvgLpo) / teamAvgLpo) * 100 : 0;

  // ── Batch clustering ─────────────────────────────────────────────────────────
  const pickerDays = useMemo(() => Object.values(pickerData).filter(d => d.pickerName === sel), [pickerData, sel]);
  const batchStats = useMemo(() => pickerBatchStats(pickerDays), [pickerDays]);

  // ── Trend direction: last 5 days vs prior 5 days (by L/Hr) ──────────────────
  const lphSorted = [...lphDays].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const last5  = lphSorted.slice(-5);
  const prior5 = lphSorted.slice(-10, -5);
  const last5Avg  = last5.length  ? last5.reduce((s, d)  => s + d.linesPerHour!, 0) / last5.length  : 0;
  const prior5Avg = prior5.length ? prior5.reduce((s, d) => s + d.linesPerHour!, 0) / prior5.length : 0;
  let trendValue = '—', trendSub = '', trendColor = DIM;
  if (last5.length >= 2 && prior5.length >= 1) {
    const pct = prior5Avg > 0 ? ((last5Avg - prior5Avg) / prior5Avg) * 100 : 0;
    trendSub = 'vs prior 5 days';
    if (pct > 5)       { trendValue = `↑ +${pct.toFixed(0)}%`; trendColor = GREEN; }
    else if (pct < -5) { trendValue = `↓ ${pct.toFixed(0)}%`;  trendColor = RED;   }
    else               { trendValue = '→ flat';                 trendColor = YELLOW; }
  } else if (last5.length >= 3) {
    // fewer than 10 total days — split what we have in half
    const half = Math.floor(last5.length / 2);
    const earlyAvg = last5.slice(0, half).reduce((s, d) => s + d.linesPerHour!, 0) / half;
    const lateAvg  = last5.slice(half).reduce((s, d) => s + d.linesPerHour!, 0) / (last5.length - half);
    const pct = earlyAvg > 0 ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;
    trendSub = 'recent vs early';
    if (pct > 5)       { trendValue = `↑ +${pct.toFixed(0)}%`; trendColor = GREEN; }
    else if (pct < -5) { trendValue = `↓ ${pct.toFixed(0)}%`;  trendColor = RED;   }
    else               { trendValue = '→ flat';                 trendColor = YELLOW; }
  }

  // ── Consistency score: coefficient of variation of daily L/Hr ───────────────
  let consistencyValue = '—', consistencySub = '', consistencyColor = DIM;
  if (lphDays.length >= 2) {
    const mean = avgLph;
    const variance = lphDays.reduce((s, d) => s + Math.pow(d.linesPerHour! - mean, 2), 0) / lphDays.length;
    const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
    consistencySub = `CV ${cv.toFixed(0)}% · ${lphDays.length}d`;
    if      (cv < 15) { consistencyValue = 'High'; consistencyColor = GREEN;  }
    else if (cv < 30) { consistencyValue = 'Med';  consistencyColor = YELLOW; }
    else              { consistencyValue = 'Low';  consistencyColor = RED;    }
  }

  const trendData = allDates.map(d => {
    const day = days.find(s => s.dateStr === d);
    return {
      date: fmtDate(d),
      lines: day?.totalLines ?? null,
      lph:   day?.linesPerHour ?? null,
      lpo:   day && day.totalOrders > 0 ? +(day.totalLines / day.totalOrders).toFixed(2) : null,
    };
  });

  const sortedDays = [...days].sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  const pickerGaps = days.flatMap(s => s.gapFlags).sort((a, b) => b.gapMinutes - a.gapMinutes);

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: DIM, marginBottom: 4, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Select Picker</div>
        <Dropdown value={sel} onChange={setSel} options={pickerNames} />
      </div>

      <div style={{ ...section }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          <StatCard label="Total Lines" value={totalLines.toLocaleString()} />
          <StatCard label="Total Orders" value={totalOrders.toLocaleString()} />
          <StatCard label="Avg Lines/Hr" value={avgLph > 0 ? avgLph.toFixed(1) : '—'} />
          <StatCard label="Lines/Order" value={avgLpo > 0 ? avgLpo.toFixed(1) : '—'} color={TEXT} />
          <StatCard label="Days Worked" value={days.length} color={TEXT} />
          <StatCard label="vs Avg" value={vsTeam !== 0 ? `${vsTeam > 0 ? '+' : ''}${vsTeam.toFixed(1)}%` : '—'} color={vsTeam > 15 ? GREEN : vsTeam < -15 ? RED : YELLOW} />
          <StatCard label="Trend" value={trendValue} sub={trendSub || undefined} color={trendColor} />
          <StatCard label="Consistency" value={consistencyValue} sub={consistencySub || undefined} color={consistencyColor} />
        </div>
      </div>

      {/* ── Rate in Context ──────────────────────────────────────────────────── */}
      {avgLpo > 0 && teamAvgLpo > 0 && (() => {
        const aboveRate       = vsTeam    >  5;
        const belowRate       = vsTeam    < -5;
        const aboveComplexity = vsTeamLpo >  15;
        const belowComplexity = vsTeamLpo < -15;
        let insight = '';
        let insightColor = DIM;
        if (aboveRate && aboveComplexity) {
          insight = `Exceptional — delivering an above-average pick rate while handling orders ${vsTeamLpo.toFixed(0)}% more complex than the team average. These two facts together indicate genuinely high performance.`;
          insightColor = GREEN;
        } else if (aboveRate && belowComplexity) {
          insight = `Strong rate, but orders are ${Math.abs(vsTeamLpo).toFixed(0)}% less complex than the team average. The rate likely benefits from simpler order types — worth factoring in when comparing to other pickers.`;
          insightColor = YELLOW;
        } else if (belowRate && aboveComplexity) {
          insight = `Order complexity is ${vsTeamLpo.toFixed(0)}% above the team average. Their lower L/Hr is partly explained by heavier orders — complex orders take more time per line. This is not the same as a pace problem.`;
          insightColor = AMBER;
        } else if (belowRate && belowComplexity) {
          insight = `Both pick rate and order complexity are below the team average. Complexity does not explain the gap — the focus should be on picking pace.`;
          insightColor = RED;
        } else {
          insight = `Both pick rate and order complexity are close to the team average. No significant complexity gap to account for.`;
          insightColor = DIM;
        }
        const metricRow = (label: string, pickerVal: string, teamVal: string, delta: number, color: string) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10, color: DIM, width: 110, flexShrink: 0, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, ...mono, marginRight: 10 }}>{pickerVal}</div>
            <div style={{ fontSize: 11, color: DIM }}>
              team avg <span style={{ color: TEXT, ...mono }}>{teamVal}</span>
            </div>
            <div style={{ marginLeft: 12, padding: '2px 10px', borderRadius: 20, background: `${color}18`, border: `1px solid ${color}44`, fontSize: 10, fontWeight: 700, color, ...mono }}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
            </div>
          </div>
        );
        const rateColor      = aboveRate      ? GREEN : belowRate      ? RED : TEXT;
        const complexityColor = aboveComplexity ? AMBER : belowComplexity ? '#32D2F2' : TEXT;
        return (
          <div style={{ ...section }}>
            <div style={secTitle}>Rate in Context</div>
            <div style={{ ...card, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {metricRow('Lines / Hr', avgLph > 0 ? avgLph.toFixed(1) : '—', teamAvgLph.toFixed(1), vsTeam, rateColor)}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
              {metricRow('Lines / Order', avgLpo.toFixed(1), teamAvgLpo.toFixed(1), vsTeamLpo, complexityColor)}
              {insight && (
                <div style={{ marginTop: 4, padding: '12px 16px', borderRadius: 10, background: `${insightColor}10`, borderLeft: `3px solid ${insightColor}`, fontSize: 12, color: TEXT, lineHeight: 1.7 }}>
                  {insight}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {(() => {
        const strengths: string[] = [];
        const focus: string[] = [];
        if (avgLph > 0 && teamAvgLph > 0) {
          if (avgLph >= teamAvgLph * 1.05) strengths.push(`Above-average pick rate — ${avgLph.toFixed(1)} L/Hr vs team ${teamAvgLph.toFixed(1)}`);
          else if (avgLph < teamAvgLph * 0.95) focus.push(`Pick rate below team average — ${avgLph.toFixed(1)} L/Hr vs team ${teamAvgLph.toFixed(1)}`);
        }
        if (consistencyValue === 'High') strengths.push(`Steady day-to-day output (${consistencySub})`);
        else if (consistencyValue === 'Low') focus.push(`Variable output day to day (${consistencySub})`);
        if (trendValue.startsWith('↑')) strengths.push(`Improving trend — ${trendValue.replace('↑ ', '')} ${trendSub}`);
        else if (trendValue.startsWith('↓')) focus.push(`Declining trend — ${trendValue.replace('↓ ', '')} ${trendSub}`);
        if (pickerGaps.length === 0 && days.length >= 3) strengths.push(`No gap flags across ${days.length} days`);
        else if (pickerGaps.length > 0) focus.push(`${pickerGaps.length} gap flag${pickerGaps.length > 1 ? 's' : ''} recorded — check raw orders`);
        if (avgLpo > 0 && teamAvgLpo > 0) {
          if (vsTeamLpo >= 20) strengths.push(`Handles orders ${vsTeamLpo.toFixed(0)}% more complex than the team average (${avgLpo.toFixed(1)} vs ${teamAvgLpo.toFixed(1)} lines/order) — their L/Hr should be read in that context`);
          else if (vsTeamLpo <= -20) focus.push(`Order complexity is ${Math.abs(vsTeamLpo).toFixed(0)}% below the team average (${avgLpo.toFixed(1)} vs ${teamAvgLpo.toFixed(1)} lines/order) — rate comparisons are more direct`);
        }
        if (strengths.length === 0 && focus.length === 0) return null;
        const col = (items: string[], color: string, label: string) => (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
            {items.length === 0
              ? <div style={{ fontSize: 12, color: DIM }}>Nothing notable</div>
              : items.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{ color, fontSize: 13, lineHeight: 1, marginTop: 1 }}>{label === 'Strengths' ? '✓' : '·'}</span>
                  <span style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{s}</span>
                </div>
              ))
            }
          </div>
        );
        return (
          <div style={{ ...section }}>
            <div style={secTitle}>Strengths &amp; Focus Areas</div>
            <div style={{ ...card, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {col(strengths, GREEN, 'Strengths')}
              {col(focus, YELLOW, 'Focus Areas')}
            </div>
          </div>
        );
      })()}

      {batchStats && (() => {
        const sizeBuckets = [
          { label: '1', count: batchStats.batches.filter(b => b.orderCount === 1).length },
          { label: '2–3', count: batchStats.batches.filter(b => b.orderCount >= 2 && b.orderCount <= 3).length },
          { label: '4–5', count: batchStats.batches.filter(b => b.orderCount >= 4 && b.orderCount <= 5).length },
          { label: '6+', count: batchStats.batches.filter(b => b.orderCount >= 6).length },
        ];
        const maxCount = Math.max(...sizeBuckets.map(b => b.count), 1);
        return (
          <div style={{ ...section }}>
            <div style={secTitle}>Order Clustering <span style={{ fontSize: 10, color: DIM, fontWeight: 400 }}>timestamp on last order of each run</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ ...card, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 9, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Avg Orders / Run</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: AMBER, ...mono }}>{batchStats.avgOrders.toFixed(1)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Avg Lines / Run</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: TEXT, ...mono }}>{batchStats.avgLines.toFixed(1)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Biggest Run</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: GREEN, ...mono }}>{batchStats.maxBatch}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Total Runs</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: DIM, ...mono }}>{batchStats.totalRuns}</div>
                  </div>
                </div>
              </div>
              <div style={{ ...card, padding: '16px 20px' }}>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Run Size Distribution</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 70 }}>
                  {sizeBuckets.map(b => (
                    <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 11, color: TEXT, fontWeight: 600 }}>{b.count || ''}</div>
                      <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 48, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{ width: '100%', background: AMBER, borderRadius: 4, height: `${(b.count / maxCount) * 100}%`, opacity: b.count === 0 ? 0.15 : 1, minHeight: b.count > 0 ? 4 : 0, transition: 'height 0.3s' }} />
                      </div>
                      <div style={{ fontSize: 10, color: DIM }}>{b.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: DIM, marginTop: 6 }}>Orders per run</div>
              </div>
            </div>
          </div>
        );
      })()}

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
          <div style={{ padding: '0 16px 6px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Lines / Hr</span>
            <span style={{ fontSize: 9, color: DIM }}>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: GREEN, verticalAlign: 'middle', marginRight: 4 }} />L/Hr
              <span style={{ display: 'inline-block', width: 18, height: 2, background: AMBER, verticalAlign: 'middle', marginLeft: 10, marginRight: 4, borderTop: '2px dashed ' + AMBER }} />L/Order
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData.filter(d => d.lph != null || d.lpo != null)} margin={{ left: 10, right: 28, top: 4, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fill: DIM, fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis yAxisId="left"  tick={{ fill: DIM, fontSize: 9 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: AMBER, fontSize: 9 }} />
              <Tooltip content={<DarkTip />} />
              <Line yAxisId="left"  type="monotone" dataKey="lph" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 3 }} name="L/Hr" connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="lpo" stroke={AMBER} strokeWidth={1.5} strokeDasharray="5 3" dot={{ fill: AMBER, r: 2 }} name="L/Order" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...section }}>
        <div style={secTitle}>Day-by-Day Breakdown</div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={tbl}>
            <thead><tr>
              {['Date','Lines','Orders','L/Hr','Ord/Hr','Avg L/Ord','Active Window','Gaps'].map(h => <th key={h} style={th}>{h}</th>)}
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
          <div style={{ fontSize: 10, color: DIM, marginBottom: 8, letterSpacing: '0.07em' }}>
            Click any row to inspect raw parsed orders for that day
          </div>
          <div style={{ ...card, padding: 0 }}>
            <table style={tbl}>
              <thead><tr>
                {['Severity','Date','From','To','Gap',''].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pickerGaps.map((g, i) => {
                  const rowKey = `${g.pickerName}|${g.dateStr}|${g.fromMinutes}|${g.toMinutes}`;
                  const isExpanded = expandedGapKey === rowKey;
                  const orders = pickerData[`${g.pickerName}|${g.dateStr}`]?.orders;
                  return (
                    <React.Fragment key={i}>
                      <tr
                        onClick={() => setExpandedGapKey(isExpanded ? null : rowKey)}
                        style={{ background: isExpanded ? 'rgba(245,166,35,0.06)' : 'transparent', cursor: 'pointer' }}
                      >
                        <td style={td}>{pill(g.severity.toUpperCase(), g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : BG3, g.severity === 'High' ? '#fff' : g.severity === 'Med' ? '#000' : DIM)}</td>
                        <td style={{ ...td, ...mono, fontSize: 11 }}>{fmtDate(g.dateStr)}</td>
                        <td style={{ ...td, ...mono }}>{fmtMin(g.fromMinutes)}</td>
                        <td style={{ ...td, ...mono }}>{fmtMin(g.toMinutes)}</td>
                        <td style={{ ...td, ...mono, color: g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : DIM }}>{g.gapMinutes}m</td>
                        <td style={{ ...td, color: DIM, fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</td>
                      </tr>
                      {isExpanded && orders && (
                        <RawOrdersExpand orders={orders} gapFrom={g.fromMinutes} gapTo={g.toMinutes} colSpan={6} />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GAP FLAGS TAB ────────────────────────────────────────────────────────────
function GapFlagsTab({ allGapFlags, setActiveTab, onPickerJump, pickerData }: {
  allGapFlags: GapFlag[]; setActiveTab: (t: string) => void; onPickerJump: (p: string) => void;
  pickerData: Record<string, PickerDayData>;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
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
      <div style={{ fontSize: 10, color: DIM, marginBottom: 10, letterSpacing: '0.07em' }}>
        Click any row to inspect raw parsed orders for that picker · day
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={tbl}>
          <thead><tr>
            {['Severity','Picker','Date','From','To','Gap',''].map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {sorted.map((g, i) => {
              const rowKey = `${g.pickerName}|${g.dateStr}|${g.fromMinutes}|${g.toMinutes}`;
              const isExpanded = expandedKey === rowKey;
              const pdKey = `${g.pickerName}|${g.dateStr}`;
              const orders = pickerData[pdKey]?.orders;
              return (
                <React.Fragment key={i}>
                  <tr
                    onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                    style={{ background: isExpanded ? 'rgba(245,166,35,0.06)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', cursor: 'pointer' }}
                  >
                    <td style={td}>{pill(g.severity.toUpperCase(), g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : BG3, g.severity === 'High' ? '#fff' : g.severity === 'Med' ? '#000' : DIM)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{g.pickerName}</td>
                    <td style={{ ...td, ...mono, fontSize: 11 }}>{fmtDate(g.dateStr)}</td>
                    <td style={{ ...td, ...mono }}>{fmtMin(g.fromMinutes)}</td>
                    <td style={{ ...td, ...mono }}>{fmtMin(g.toMinutes)}</td>
                    <td style={{ ...td, ...mono, color: g.severity === 'High' ? RED : g.severity === 'Med' ? YELLOW : DIM }}>{g.gapMinutes}m</td>
                    <td style={{ ...td, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: DIM, fontSize: 14, lineHeight: 1 }}>{isExpanded ? '▲' : '▼'}</span>
                      <span onClick={e => e.stopPropagation()}>
                        {btn('View →', () => { onPickerJump(g.pickerName); setActiveTab('picker-detail'); }, { padding: '3px 8px', fontSize: 10 })}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && orders && (
                    <RawOrdersExpand orders={orders} gapFrom={g.fromMinutes} gapTo={g.toMinutes} colSpan={7} />
                  )}
                </React.Fragment>
              );
            })}
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
  const [parseStatus, setParseStatus] = useState<{ pending: number; label: string } | null>(null);
  const pickerDataRef = useRef(pickerData);
  pickerDataRef.current = pickerData;

  // ── Web Worker: created once, reused for all file loads ──────────────────────
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<{ total: number; done: number }>({ total: 0, done: 0 });

  useEffect(() => {
    const worker = new Worker(new URL('./parseWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { entries: rawEntries, fileName, sheetCount, error } = e.data as {
        entries: Record<string, PickerDayRaw>;
        fileName: string;
        sheetCount: number;
        fileIndex: number;
        fileCount: number;
        error?: string;
      };

      if (!error) {
        const now = new Date();
        const entries: Record<string, PickerDayData> = {};
        for (const [key, val] of Object.entries(rawEntries)) {
          entries[key] = { ...val, date: new Date(val.dateISO), loadedAt: now };
        }
        const cur = pickerDataRef.current;
        let added = 0, replaced = 0;
        for (const key of Object.keys(entries)) {
          if (cur[key]) replaced++; else added++;
        }
        setPickerData(prev => ({ ...prev, ...entries }));
        setLastUpdated(now);
        setFileHistory(h => [...h, { fileName, loadedAt: now, tabsLoaded: sheetCount, recordsAdded: added, recordsReplaced: replaced }]);
      }

      pendingRef.current.done++;
      if (pendingRef.current.done >= pendingRef.current.total) {
        setParseStatus(null);
      } else {
        setParseStatus({ pending: pendingRef.current.total - pendingRef.current.done, label: 'Parsing…' });
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const handleFiles = useCallback((files: FileList) => {
    const fileArr = Array.from(files);
    pendingRef.current = { total: fileArr.length, done: 0 };
    setParseStatus({ pending: fileArr.length, label: 'Reading file…' });

    fileArr.forEach((file, fileIndex) => {
      const reader = new FileReader();
      reader.onload = e => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer || !workerRef.current) return;
        setParseStatus({ pending: pendingRef.current.total - pendingRef.current.done, label: `Parsing ${file.name}…` });
        // Transfer the buffer (zero-copy) to the worker
        workerRef.current.postMessage(
          { buffer, fileName: file.name, fileIndex, fileCount: fileArr.length },
          [buffer],
        );
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
    <div style={{ minHeight: '100vh', fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", color: TEXT, fontSize: 13 }}>
      <Header lastUpdated={lastUpdated} onClear={handleClear} onToggleHistory={() => setShowHistory(v => !v)} hasData={hasData} dateRange={dateRange} />
      {showHistory && hasData && <FileHistoryPanel history={fileHistory} />}

      {parseStatus && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'rgba(18,18,28,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ width: 18, height: 18, border: `2px solid ${AMBER}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: TEXT }}>{parseStatus.label}</span>
        </div>
      )}

      {!hasData && !parseStatus ? (
        <DropZone onFiles={handleFiles} isDragging={isDragging} setIsDragging={setIsDragging} />
      ) : !hasData && parseStatus ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 60px)', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${AMBER}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ color: DIM, fontSize: 14 }}>{parseStatus.label}</div>
        </div>
      ) : (
        <>
          <TabBar activeTab={activeTab} setActiveTab={setActiveTab} gapCount={allGapFlags.length} />
          <DropZone onFiles={handleFiles} isDragging={isDragging} setIsDragging={setIsDragging} compact />

          {activeTab === 'overview'      && <OverviewTab allStats={allStats} allDates={allDates} pickerNames={pickerNames} allGapFlags={allGapFlags} pickerData={pickerData} />}
          {activeTab === 'score'         && <ScoreTab allStats={allStats} allGapFlags={allGapFlags} pickerNames={pickerNames} pickerData={pickerData} />}
          {activeTab === 'weekly'        && <WeeklyTab allStats={allStats} pickerNames={pickerNames} />}
          {activeTab === 'compare'       && <CompareTab allStats={allStats} pickerNames={pickerNames} />}
          {activeTab === 'picker-detail' && <PickerDetailTab allStats={allStats} pickerNames={pickerNames} allDates={allDates} externalPicker={jumpPicker} pickerData={pickerData} />}
          {activeTab === 'gap-flags'     && <GapFlagsTab allGapFlags={allGapFlags} setActiveTab={setActiveTab} onPickerJump={setJumpPicker} pickerData={pickerData} />}
        </>
      )}
    </div>
  );
}
