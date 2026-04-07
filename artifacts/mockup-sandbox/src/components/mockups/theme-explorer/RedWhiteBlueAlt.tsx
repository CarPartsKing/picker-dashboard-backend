export function RedWhiteBlueAlt() {
  const BG      = '#060D1F';
  const CARD    = 'rgba(255,255,255,0.05)';
  const BORDER  = 'rgba(255,255,255,0.10)';
  const RED     = '#E8192C';
  const BLUE    = '#0369A1';
  const BLUE_LT = '#38BDF8';
  const WHITE   = '#FFFFFF';
  const DIM     = 'rgba(255,255,255,0.42)';
  const GREEN   = '#22C55E';
  const MONO    = { fontFamily: "'SF Mono', 'Fira Code', monospace" };

  const pickers = [
    { name: 'Alex Johnson',  lph: 142.4, lines: 8820, orders: 412, days: 18, meets: true,  diff: +18.2 },
    { name: 'Sam Clarke',    lph: 138.1, lines: 7340, orders: 380, days: 16, meets: true,  diff: +13.9 },
    { name: 'Jordan Lee',    lph: 124.2, lines: 6100, orders: 310, days: 14, meets: true,  diff: +0.0  },
    { name: 'Casey Morgan',  lph: 118.7, lines: 5890, orders: 298, days: 15, meets: false, diff: -5.5  },
    { name: 'Riley Smith',   lph: 103.4, lines: 4200, orders: 218, days: 12, meets: false, diff: -20.8 },
    { name: 'Taylor Brooks', lph:  96.0, lines: 3800, orders: 196, days: 11, meets: false, diff: -28.2 },
  ];

  const COLORS = [RED, BLUE_LT, '#A855F7', '#F59E0B', '#10B981', '#EC4899'];
  const BENCHMARK = 124.2;

  const tabs = ['Overview', 'Picker Detail', 'Weekly', 'Compare', 'Score', 'Gap Flags'];
  const activeTab = 'Overview';

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, sans-serif", color: WHITE, fontSize: 13 }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ height: 52, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'rgba(6,13,31,0.96)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo mark */}
          <div style={{ width: 28, height: 28, borderRadius: 7, background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: WHITE, letterSpacing: '-0.02em' }}>P</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
            Pick<span style={{ color: RED }}>Track</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 11, color: DIM }}>Apr 2026 · 6 pickers</span>
          <div style={{ background: `${RED}20`, border: `1px solid ${RED}55`, borderRadius: 6, padding: '4px 12px', fontSize: 11, color: RED, fontWeight: 600 }}>Clear Data</div>
        </div>
      </div>

      {/* ── Tab Bar ───────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 2, padding: '0 20px', background: 'rgba(6,13,31,0.7)', overflowX: 'auto' }}>
        {tabs.map(t => {
          const isActive = t === activeTab;
          return (
            <div key={t} style={{ padding: '12px 16px', fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? WHITE : DIM, borderBottom: isActive ? `2px solid ${RED}` : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.01em', transition: 'color 0.15s' }}>
              {t}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '24px', maxWidth: 1300, margin: '0 auto' }}>

        {/* ── Summary Cards ─────────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 14 }}>Latest Date — Mon 7 Apr 2026</div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {[
              { label: 'Lines Today',    value: '4,820',  color: WHITE  },
              { label: 'Orders Today',   value: '248',    color: WHITE  },
              { label: 'Team Avg L/Hr',  value: '121.7',  color: BLUE_LT },
              { label: 'Total Lines',    value: '36,150', color: WHITE  },
              { label: 'Total Orders',   value: '1,814',  color: WHITE  },
              { label: 'Gap Flags',      value: '3',      color: RED    },
            ].map(c => (
              <div key={c.label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color, ...MONO }}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Team Snapshot ─────────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 6 }}>Team Snapshot — Avg Lines / Hr</div>
          <div style={{ fontSize: 11, color: DIM, marginBottom: 14 }}>
            Team benchmark: <span style={{ color: WHITE, fontWeight: 600, ...MONO }}>{BENCHMARK.toFixed(1)} L/Hr</span>
            <span style={{ marginLeft: 8, color: DIM }}>(mean of all pickers)</span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {pickers.map((p, i) => {
              const bc  = p.meets ? GREEN : RED;
              const lbl = p.meets ? '✓ Meets' : '✗ Below';
              return (
                <div key={p.name} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${COLORS[i]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: DIM }}>{p.days}d logged</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: bc, background: `${bc}18`, border: `1px solid ${bc}44`, borderRadius: 6, padding: '2px 7px' }}>{lbl}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: BLUE_LT, ...MONO }}>{p.lph.toFixed(1)}</div>
                  <div style={{ fontSize: 10, color: bc, marginTop: 3 }}>
                    {p.diff >= 0 ? `+${p.diff.toFixed(1)} above benchmark` : `${p.diff.toFixed(1)} below benchmark`}
                  </div>
                  <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>{p.lines.toLocaleString()} lines · {p.orders} orders</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Score Leaderboard Preview ──────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, color: DIM, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 14 }}>Score Leaderboard</div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {[
              { name: 'Alex Johnson',  score: 84, band: 'Strong',   col: BLUE_LT, meets: true,  diff: +18.2 },
              { name: 'Sam Clarke',    score: 79, band: 'Strong',   col: BLUE_LT, meets: true,  diff: +13.9 },
              { name: 'Jordan Lee',    score: 71, band: 'Developing', col: '#A855F7', meets: true,  diff: 0.0 },
              { name: 'Casey Morgan',  score: 64, band: 'Developing', col: '#A855F7', meets: false, diff: -5.5 },
              { name: 'Riley Smith',   score: 51, band: 'Needs Support', col: RED,  meets: false, diff: -20.8 },
              { name: 'Taylor Brooks', score: 44, band: 'Needs Support', col: RED,  meets: false, diff: -28.2 },
            ].map((s, i) => (
              <div key={s.name} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: DIM }}>#{i + 1}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: s.col, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{s.band}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.col, ...MONO, lineHeight: 1 }}>{s.score}</div>
                <div style={{ fontSize: 9, color: DIM, marginTop: 2 }}>/ 100</div>
                <div style={{ marginTop: 10, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${s.score}%`, background: s.col, borderRadius: 2 }} />
                </div>
                {(() => {
                  const bc = s.meets ? GREEN : RED;
                  return (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: bc, background: `${bc}18`, border: `1px solid ${bc}44`, borderRadius: 5, padding: '2px 6px' }}>
                        {s.meets ? '✓ Meets' : '✗ Below'}
                      </span>
                      <span style={{ fontSize: 9, color: DIM }}>{s.diff >= 0 ? '+' : ''}{s.diff.toFixed(1)}</span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
