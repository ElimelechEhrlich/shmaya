import test from 'node:test';
import assert from 'node:assert/strict';

import { formatContrealDeadline, formatContrealDateTime, todayInIsrael } from '../src/utils/formatContrealDeadline.ts';

// 7/10/2026 10:00 בישראל (UTC+3, שעון קיץ) = 07:00Z
const NOW = new Date('2026-10-07T07:00:00Z');

test('today in Israel, not UTC', () => {
  assert.equal(todayInIsrael(NOW), '2026-10-07');
  // 23:30Z on 6/10 is already 7/10 02:30 in Israel
  assert.equal(todayInIsrael(new Date('2026-10-06T23:30:00Z')), '2026-10-07');
});

test('date-only deadline keeps its exact day (no UTC shift)', () => {
  const f = formatContrealDeadline('2026-10-08', NOW)!;
  assert.equal(f.full, 'יום ה׳ 08/10/2026'); // 8/10/2026 is a Thursday
  assert.equal(f.short, 'מחר');
  assert.equal(f.tone, 'soon');
});

test('relative labels and tones', () => {
  assert.deepEqual(formatContrealDeadline('2026-10-07', NOW), { short: 'היום', full: 'יום ד׳ 07/10/2026', tone: 'today' });
  assert.equal(formatContrealDeadline('2026-10-06', NOW)!.short, 'אתמול');
  assert.equal(formatContrealDeadline('2026-10-06', NOW)!.tone, 'overdue');
  assert.equal(formatContrealDeadline('2026-09-01', NOW)!.tone, 'overdue');
  const later = formatContrealDeadline('2026-10-15', NOW)!;
  assert.equal(later.short, 'יום ה׳ 15/10');
  assert.equal(later.tone, 'normal');
});

test('other year shows the full date', () => {
  assert.equal(formatContrealDeadline('2027-01-03', NOW)!.short, 'יום א׳ 03/01/2027');
});

test('"today" flips at Israeli midnight, not UTC midnight', () => {
  // 21:30Z on 7/10 = 00:30 on 8/10 in Israel → 8/10 is "today"
  assert.equal(formatContrealDeadline('2026-10-08', new Date('2026-10-07T21:30:00Z'))!.short, 'היום');
});

test('across the winter-time change (25/10/2026) day counting stays exact', () => {
  const now = new Date('2026-10-24T09:00:00Z');
  assert.equal(formatContrealDeadline('2026-10-25', now)!.short, 'מחר');
  assert.equal(formatContrealDeadline('2026-10-26', now)!.full, 'יום ב׳ 26/10/2026');
});

test('missing or invalid values return null, never "Invalid Date"', () => {
  assert.equal(formatContrealDeadline(null, NOW), null);
  assert.equal(formatContrealDeadline('', NOW), null);
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(formatContrealDeadline('2026-02-31', NOW), null);
    assert.equal(formatContrealDeadline('08/10/2026', NOW), null);
    assert.equal(formatContrealDeadline('garbage', NOW), null);
  } finally { console.warn = warn; }
});

test('ISO timestamps are shown in Israel time', () => {
  assert.equal(formatContrealDateTime('2026-10-07T07:04:08.000Z'), 'יום ד׳ 07/10/2026, 10:04');
  // winter time (UTC+2)
  assert.equal(formatContrealDateTime('2026-12-01T22:30:00.000Z'), 'יום ד׳ 02/12/2026, 00:30');
  assert.equal(formatContrealDateTime('2026-10-08'), 'יום ה׳ 08/10/2026');
  assert.equal(formatContrealDateTime('nope'), null);
  assert.equal(formatContrealDateTime(null), null);
});
