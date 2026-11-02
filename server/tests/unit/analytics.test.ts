import { describe, expect, it } from 'vitest';
import {
  addDays,
  averageOrderValue,
  daysBetween,
  isTzName,
  parseDate,
  parseRange,
  pctChange,
  previousRange,
  summarize,
} from '../../src/analytics';

const today = '2026-10-26';

describe('dates', () => {
  it('accepts real calendar dates only', () => {
    expect(parseDate('2026-10-26')).not.toBeNull();
    expect(parseDate('2024-02-29')).not.toBeNull();
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', 'abc', '', '2026-10-26T00:00:00Z', '2025-02-29']) {
      expect(parseDate(bad), bad).toBeNull();
    }
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts days inclusively', () => {
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(1);
    expect(daysBetween('2026-10-01', '2026-10-30')).toBe(30);
  });

  it('checks time zone names', () => {
    for (const ok of ['UTC', 'Asia/Jerusalem', 'America/Argentina/Buenos_Aires', 'Etc/GMT+3']) expect(isTzName(ok), ok).toBe(true);
    for (const bad of ['', 'a b', "UTC'; DROP TABLE orders", 'x'.repeat(65), 42, undefined]) expect(isTzName(bad)).toBe(false);
  });
});

describe('parseRange', () => {
  it('defaults to the last 30 days, daily, in UTC', () => {
    const { range } = parseRange({}, today);
    expect(range).toEqual({ from: '2026-09-27', to: today, granularity: 'day', tz: 'UTC', days: 30 });
  });

  it('ends the default window at "to" when only "to" is given', () => {
    expect(parseRange({ to: '2026-10-10' }, today).range).toMatchObject({ from: '2026-09-11', to: '2026-10-10' });
  });

  it('switches to weekly automatically for long ranges', () => {
    expect(parseRange({ from: addDays(today, -61), to: today }, today).range?.granularity).toBe('day'); // 62 يوم
    expect(parseRange({ from: addDays(today, -62), to: today }, today).range?.granularity).toBe('week'); // 63 يوم
  });

  it('enforces the size limits', () => {
    expect(parseRange({ from: addDays(today, -365), to: today }, today).range?.days).toBe(366);
    expect(parseRange({ from: addDays(today, -366), to: today }, today).error).toMatch(/at most 366/);
    expect(parseRange({ from: addDays(today, -91), to: today, granularity: 'day' }, today).range?.days).toBe(92);
    expect(parseRange({ from: addDays(today, -92), to: today, granularity: 'day' }, today).error).toMatch(/weekly/);
  });

  it('rejects bad input', () => {
    const bad: Record<string, unknown>[] = [
      { from: '2026-02-30' },
      { from: 'nope' },
      { to: '2026-1-1' },
      { from: '2026-10-10', to: '2026-10-01' },
      { to: '2026-10-27' },
      { granularity: 'month' },
      { tz: 'bad zone!' },
      { tz: ['UTC'] },
      { from: ['2026-10-01'] },
    ];
    for (const query of bad) expect(parseRange(query, today).error, JSON.stringify(query)).toBeDefined();
  });
});

describe('previousRange', () => {
  it('returns the period right before, with the same length', () => {
    expect(previousRange('2026-10-01', '2026-10-10')).toEqual({ from: '2026-09-21', to: '2026-09-30' });
    expect(previousRange('2026-10-05', '2026-10-05')).toEqual({ from: '2026-10-04', to: '2026-10-04' });
  });
});

describe('summarize', () => {
  it('adds money exactly, using cents', () => {
    const totals = summarize([
      { orders: 1, paidOrders: 1, revenue: 0.1, newCustomers: 0 },
      { orders: 2, paidOrders: 1, revenue: 0.2, newCustomers: 1 },
    ]);
    expect(totals).toEqual({ revenue: 0.3, orders: 3, paidOrders: 2, aov: 0.15, newCustomers: 1 });
  });

  it('has no average order value without paid orders', () => {
    expect(summarize([])).toEqual({ revenue: 0, orders: 0, paidOrders: 0, aov: null, newCustomers: 0 });
    expect(averageOrderValue(100, 0)).toBeNull();
    expect(averageOrderValue(100, 3)).toBe(33.33);
  });
});

describe('pctChange', () => {
  it('computes the change with one decimal', () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(1, 3)).toBe(-66.7);
  });

  it('has no percentage when there is nothing to compare with', () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
    expect(pctChange(null, 10)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
  });
});