// Run: pnpm --filter @workspace/picker-dashboard run test
// (or `node --test src/parseUtils.test.ts` from artifacts/picker-dashboard).
// Uses Node's built-in test runner and type stripping, so no extra packages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  normalizeName,
  parseSheet,
  parseTabDate,
  parseTime,
  resolveShiftTimes,
  toDateStr,
} from './parseUtils.ts';

const hm = (h: number, m: number) => h * 60 + m;

test('parseTime reads the formats pickers type', () => {
  assert.equal(parseTime(759), hm(7, 59));
  assert.equal(parseTime(1202), hm(12, 2));
  assert.equal(parseTime('6;23'), hm(6, 23));
  assert.equal(parseTime('5:09'), hm(5, 9)); // AM/PM is decided later by resolveShiftTimes
  assert.equal(parseTime('1:05 PM'), hm(13, 5));
  assert.equal(parseTime(0.5), hm(12, 0)); // Excel day fraction
  assert.equal(parseTime('5 pm'), hm(17, 0));
  assert.equal(parseTime('`7:45'), hm(7, 45));
  assert.equal(parseTime(7560), hm(7, 56)); // keypad slip: trailing 0
  assert.equal(parseTime(''), null);
  assert.equal(parseTime('lunch'), null);
});

test('resolveShiftTimes applies the 6 AM to ~8 PM shift', () => {
  // Afternoon-only picker: everything before 6:00 is PM.
  assert.deepEqual(resolveShiftTimes([hm(1, 7), hm(4, 45), hm(8, 0)]), [hm(13, 7), hm(16, 45), hm(20, 0)]);
  // Morning start keeps AM; 6:00-8:30 turns PM once the day has passed noon.
  assert.deepEqual(
    resolveShiftTimes([hm(6, 30), hm(7, 45), hm(12, 30), hm(2, 0), hm(6, 15), hm(7, 50)]),
    [hm(6, 30), hm(7, 45), hm(12, 30), hm(14, 0), hm(18, 15), hm(19, 50)],
  );
  // Morning only stays AM.
  assert.deepEqual(resolveShiftTimes([hm(6, 10), hm(7, 0), hm(8, 20)]), [hm(6, 10), hm(7, 0), hm(8, 20)]);
  // After noon, 8:31-11:59 is still AM (nobody works past ~8:30 PM).
  assert.deepEqual(resolveShiftTimes([hm(13, 0), hm(9, 15)]), [hm(13, 0), hm(9, 15)]);
  // Nulls pass through and don't reset the day.
  assert.deepEqual(resolveShiftTimes([hm(12, 5), null, hm(7, 0)]), [hm(12, 5), null, hm(19, 0)]);
});

test('normalizeName merges typing variants and confirmed aliases', () => {
  assert.equal(normalizeName('ANTHONY'), 'Anthony');
  assert.equal(normalizeName('0ssie'), 'Ossie');
  assert.equal(normalizeName('Andy!'), 'Andy');
  assert.equal(normalizeName('Eric  356025562'), 'Eric');
  assert.equal(normalizeName('Anthony a'), 'Anthonya');
  assert.equal(normalizeName('Jaypitt'), 'Jay Pitt');
  assert.equal(normalizeName('Nas'), 'Nasir');
  assert.equal(normalizeName('Taureen'), 'Taurean');
  assert.equal(normalizeName('MJ'), 'MJ'); // short all-caps initials kept
  // Different people must stay different.
  assert.notEqual(normalizeName('Anthonyd'), normalizeName('Anthonya'));
  assert.notEqual(normalizeName('Sherri'), normalizeName('Shari'));
});

test('parseTabDate reads tab names', () => {
  assert.equal(toDateStr(parseTabDate('412026')!), '2026-04-01');
  assert.equal(toDateStr(parseTabDate('4102026')!), '2026-04-10');
  assert.equal(toDateStr(parseTabDate('9252026')!), '2026-09-25');
  assert.equal(parseTabDate('Summary'), null);
});

function sheetOf(rows: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

test('parseSheet applies the shift rule and flags LF/RP/SO', () => {
  const ws = sheetOf([
    ['Darrell', null, null],
    [1001, 5, '1:07'],
    [1002, 4, 'LF245'],
    [1003, 3, 'RP'],
    [1004, 2, '8:00'],
  ]);
  const day = parseSheet(ws, '9212026')['Darrell|2026-09-21'];
  assert.ok(day);
  assert.deepEqual(day.orders.map(o => o.timeMinutes), [hm(13, 7), hm(14, 45), null, hm(20, 0)]);
  assert.equal(day.orders[1].isLookFor, true);
  assert.equal(day.orders[2].isRP, true);
});

test('parseSheet combines two columns with the same name instead of dropping one', () => {
  const ws = sheetOf([
    ['Anthony', null, null, 'ANTHONY', null, null],
    [1001, 5, '7:00', 2001, 5, '9:00'],
    [1002, 5, '7:30', 2002, 5, '9:30'],
  ]);
  const result = parseSheet(ws, '9252026');
  assert.deepEqual(Object.keys(result), ['Anthony|2026-09-25']);
  assert.equal(result['Anthony|2026-09-25'].orders.length, 4);
});
