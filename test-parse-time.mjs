// Extracted from parseUtils.ts for testing (no TypeScript / XLSX needed)

function parseTime(val) {
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
  const isPm = /pm/i.test(str);
  const isAm = /am/i.test(str);
  const sep = str.includes(';') ? ';' : str.includes(':') ? ':' : null;
  if (sep) {
    const [hs, ms] = str.split(sep);
    let h = parseInt(hs, 10);
    const m = parseInt(ms, 10);
    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 12 && m >= 0 && m <= 59 && (isPm || isAm)) {
      if (isPm && h !== 12) h += 12;
      if (isAm && h === 12) h = 0;
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

function fmt(minutes) {
  if (minutes === null) return 'null';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m (${minutes} min)`;
}

const cases = [
  { input: '1230',  expectH: 12, expectM: 30,  label: '"1230"' },
  { input: '12:30', expectH: 12, expectM: 30,  label: '"12:30"' },
  { input: '759',   expectH: 7,  expectM: 59,  label: '"759"' },
  { input: '7:59',  expectH: 7,  expectM: 59,  label: '"7:59"' },
  { input: '1232',  expectH: 12, expectM: 32,  label: '"1232"' },
  { input: '700',   expectH: 7,  expectM: 0,   label: '"700"' },
  { input: '7;59',  expectH: 7,  expectM: 59,  label: '"7;59"' },
  // Excel decimal: 0.5 = noon = 720 min
  { input: 0.5,     expectH: 12, expectM: 0,   label: 'Excel 0.5 (noon)' },
  // Excel decimal: 7:59 = (7*60+59)/(24*60) ≈ 0.33264
  { input: (7*60+59)/(24*60), expectH: 7, expectM: 59, label: 'Excel 0.33264 (7:59)' },
  // AM/PM preservation tests
  { input: '12:30 PM', expectH: 12, expectM: 30, label: '"12:30 PM" (noon)' },
  { input: '12:30 AM', expectH: 0,  expectM: 30, label: '"12:30 AM" (midnight)' },
  { input: '1:00 PM',  expectH: 13, expectM: 0,  label: '"1:00 PM"' },
];

let pass = 0, fail = 0;
for (const { input, expectH, expectM, label } of cases) {
  const result = parseTime(input);
  const expected = expectH * 60 + expectM;
  const ok = result === expected;
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) pass++; else fail++;
  console.log(`${status}  ${label.padEnd(28)} → ${fmt(result)}  (expected ${fmt(expected)})`);
}
console.log(`\n${pass} passed, ${fail} failed`);
