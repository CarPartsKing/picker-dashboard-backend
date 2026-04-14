// Daily Digest — full-page preview mockup
// Uses static sample data to demonstrate all sections

const BG      = '#060D1F';
const CARD    = '#0D1B35';
const BORDER  = 'rgba(255,255,255,0.08)';
const BRAND   = '#E8192C';
const AMBER   = '#38BDF8';
const GREEN   = '#30D158';
const RED     = '#FF453A';
const YELLOW  = '#FFD60A';
const DIM     = 'rgba(255,255,255,0.38)';
const TEXT    = '#F5F5F7';

// ── sample data ──────────────────────────────────────────────────────────────
const TODAY_DATE    = 'Monday, Apr 14';
const REFRESH_TIME  = 'Updated 2:20 AM';

const TOTAL_LINES   = 1521;
const TOTAL_ORDERS  = 1016;
const ACTIVE_PICKERS = 11;

// Goal attainment: pickers hitting ≥6 orders/hr
const GOAL_HIT   = 8;
const GOAL_TOTAL = 11;
const GOAL_PCT   = Math.round((GOAL_HIT / GOAL_TOTAL) * 100); // 72% → green

// Team stats + sparklines (last 7 days)
const LPH_HISTORY   = [38.1, 41.0, 37.5, 44.2, 40.8, 43.1, 41.5];
const OPH_HISTORY   = [24.2, 26.1, 23.8, 27.9, 25.7, 27.3, 26.1];
const LF_HISTORY    = [14, 18, 11, 22, 16, 20, 24];

const TEAM_LPH_TODAY  = 41.5;
const TEAM_LPH_PREV   = 43.1;
const TEAM_OPH_TODAY  = 26.1;
const TEAM_OPH_PREV   = 27.3;
const LF_TODAY        = 24;
const LF_7D_AVG       = 17.9;

// Top performer
const TOP_PICKER     = 'Arielle';
const TOP_LPH        = 134.0;
const TOP_LINES      = 401;
const TOP_VS_TEAM    = '+222%';

// Needs attention (>25% below personal 7d avg)
const ATTENTION = [
  { name: 'Taylor', todayLph: 31.4, avgLph: 52.3, gap: '-40%' },
  { name: 'Davion', todayLph: 30.0, avgLph: 41.8, gap: '-28%' },
];

// LF spike — today's LF is >50% above 7d avg → show card
const LF_SPIKE = LF_TODAY > LF_7D_AVG * 1.5; // 24 > 26.85? No — let's force it for demo
const SHOW_LF_SPIKE = true; // demo: show the amber card
const LF_SPIKE_PCT  = Math.round(((LF_TODAY - LF_7D_AVG) / LF_7D_AVG) * 100);

// High severity gap flags (≥120 min today)
const GAP_FLAGS = [
  { picker: 'Taylor',  from: '8:14 AM', to: '10:58 AM', mins: 164 },
  { picker: 'Nay',     from: '1:03 PM', to: '3:06 PM',  mins: 123 },
];

// ── Sparkline component ───────────────────────────────────────────────────────
function Sparkline({ data, color = AMBER, h = 28, w = 80 }: { data: number[]; color?: string; h?: number; w?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Trend arrow ───────────────────────────────────────────────────────────────
function Trend({ today, prev, suffix = '' }: { today: number; prev: number; suffix?: string }) {
  const pct = prev > 0 ? ((today - prev) / prev) * 100 : 0;
  const up  = pct > 0;
  const col = up ? GREEN : RED;
  return (
    <span style={{ fontSize: 10, color: col, fontWeight: 600, marginLeft: 4 }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%{suffix}
    </span>
  );
}

// ── Stat card with sparkline ──────────────────────────────────────────────────
function TeamStatCard({ label, value, trend, sparkData, sparkColor }: {
  label: string; value: string; trend?: React.ReactNode; sparkData: number[]; sparkColor?: string;
}) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', flex: '1 1 0', minWidth: 140 }}>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: TEXT, fontFamily: 'ui-monospace, monospace' }}>{value}</span>
        {trend}
      </div>
      <Sparkline data={sparkData} color={sparkColor ?? AMBER} h={24} w={72} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function DailyDigest() {
  const goalColor = GOAL_PCT >= 70 ? GREEN : GOAL_PCT >= 50 ? YELLOW : RED;
  const goalBg    = GOAL_PCT >= 70 ? 'rgba(48,209,88,0.08)' : GOAL_PCT >= 50 ? 'rgba(255,214,10,0.08)' : 'rgba(255,69,58,0.08)';
  const goalBorder= GOAL_PCT >= 70 ? 'rgba(48,209,88,0.35)' : GOAL_PCT >= 50 ? 'rgba(255,214,10,0.35)' : 'rgba(255,69,58,0.35)';

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '20px 20px 40px', fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", fontSize: 13, overflowY: 'auto', boxSizing: 'border-box' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Today's Digest</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{TODAY_DATE}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: DIM }}>{REFRESH_TIME}</div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>Auto-refreshes every 30 min</div>
        </div>
      </div>

      {/* Headline stat */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Total Lines Picked Today</div>
        <div style={{ fontSize: 52, fontWeight: 800, color: TEXT, fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>{TOTAL_LINES.toLocaleString()}</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: DIM }}><span style={{ color: TEXT, fontWeight: 600 }}>{TOTAL_ORDERS.toLocaleString()}</span> orders</span>
          <span style={{ fontSize: 12, color: DIM }}><span style={{ color: TEXT, fontWeight: 600 }}>{ACTIVE_PICKERS}</span> active pickers</span>
        </div>
      </div>

      {/* ── GOAL ATTAINMENT ────────────────────────────────────────────────── */}
      <div style={{ background: goalBg, border: `1px solid ${goalBorder}`, borderRadius: 14, padding: '20px 22px', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Goal Attainment — ≥6 Orders / Hr</div>
        <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>pickers hitting target today</div>
        <div style={{ fontSize: 56, fontWeight: 800, color: goalColor, fontFamily: 'ui-monospace, monospace', lineHeight: 1, marginBottom: 6 }}>
          {GOAL_HIT} <span style={{ fontSize: 32, fontWeight: 400, color: DIM }}>out of {GOAL_TOTAL}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: goalColor }}>{GOAL_PCT}% of team on target</div>
      </div>

      {/* ── TEAM PERFORMANCE ROW ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <TeamStatCard
          label="Team Avg Lines / Hr"
          value={TEAM_LPH_TODAY.toFixed(1)}
          trend={<Trend today={TEAM_LPH_TODAY} prev={TEAM_LPH_PREV} />}
          sparkData={LPH_HISTORY}
          sparkColor={AMBER}
        />
        <TeamStatCard
          label="Team Avg Orders / Hr"
          value={TEAM_OPH_TODAY.toFixed(1)}
          trend={<Trend today={TEAM_OPH_TODAY} prev={TEAM_OPH_PREV} />}
          sparkData={OPH_HISTORY}
          sparkColor={AMBER}
        />
        <TeamStatCard
          label="Total LF Orders"
          value={String(LF_TODAY)}
          trend={<Trend today={LF_TODAY} prev={LF_7D_AVG} suffix=" vs 7d" />}
          sparkData={LF_HISTORY}
          sparkColor={AMBER}
        />
      </div>

      {/* ── TOP PERFORMER ──────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(48,209,88,0.07)', border: '1px solid rgba(48,209,88,0.28)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, lineHeight: 1 }}>⭐</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Top Performer Today</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: GREEN }}>{TOP_PICKER}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: GREEN, fontFamily: 'ui-monospace, monospace' }}>{TOP_LPH} <span style={{ fontSize: 12, fontWeight: 400, color: DIM }}>L/Hr</span></div>
          <div style={{ fontSize: 11, color: DIM }}>{TOP_LINES} lines · {TOP_VS_TEAM} vs team avg</div>
        </div>
      </div>

      {/* ── NEEDS ATTENTION ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Needs Attention — &gt;25% below personal avg</div>
        {ATTENTION.length === 0 ? (
          <div style={{ background: 'rgba(48,209,88,0.07)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: GREEN }}>
            ✓ All pickers within normal range today
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {ATTENTION.map(a => (
              <div key={a.name} style={{ background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.28)', borderLeft: `3px solid ${YELLOW}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: YELLOW, minWidth: 70 }}>{a.name}</div>
                <div style={{ flex: 1, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}><span style={{ color: YELLOW, fontWeight: 700 }}>{a.todayLph}</span> <span style={{ color: DIM }}>L/Hr today</span></span>
                  <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: DIM }}>avg {a.avgLph}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: RED }}>{a.gap}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── LF SPIKE ALERT (only when triggered) ───────────────────────────── */}
      {SHOW_LF_SPIKE && (
        <div style={{ background: 'rgba(56,189,248,0.06)', border: `1px solid rgba(56,189,248,0.35)`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: AMBER, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>⚡ LF Volume Spike</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: AMBER, fontFamily: 'ui-monospace, monospace' }}>{LF_TODAY}</span>
            <span style={{ fontSize: 12, color: DIM }}>LF orders today vs 7d avg of <span style={{ color: TEXT }}>{LF_7D_AVG.toFixed(1)}</span></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>+{LF_SPIKE_PCT}% above normal</span>
          </div>
        </div>
      )}

      {/* ── HIGH SEVERITY GAP FLAGS (only when present) ────────────────────── */}
      {GAP_FLAGS.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: RED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>🚩 High Severity Gap Flags</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {GAP_FLAGS.map((g, i) => (
              <div key={i} style={{ background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.3)', borderLeft: `3px solid ${RED}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                <div style={{ fontWeight: 700, color: RED, fontSize: 14, minWidth: 70 }}>{g.picker}</div>
                <div style={{ flex: 1, fontSize: 12, color: DIM, fontFamily: 'ui-monospace, monospace' }}>{g.from} → {g.to}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: RED }}>{g.mins}m gap</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── QUICK NAV ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
        {['Full Overview', 'Weekly', 'Compare', 'Picker Detail'].map(label => (
          <button key={label} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '7px 16px', color: DIM, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
