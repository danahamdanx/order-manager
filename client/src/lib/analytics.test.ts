import { describe, expect, it } from 'vitest';
import {
  autoGranularity,
  daysInRange,
  formatBucket,
  formatMoneyShort,
  localISO,
  resolveRange,
  shiftDays,
  validateRange,
} from './analytics';

const today = '2026-10-26';

describe('dates', () => {
  it('formats the local day', () => {
    expect(localISO(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(localISO(new Date(2026, 0, 31))).toBe('2026-01-31');
  });

  it('shifts days across month, year and leap boundaries', () => {
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts days inclusively', () => {
    expect(daysInRange('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysInRange('2026-10-01', '2026-10-30')).toBe(30);
  });

  it('picks daily for up to 62 days and weekly after that', () => {
    expect(autoGranularity(62)).toBe('day');
    expect(autoGranularity(63)).toBe('week');
  });
});

describe('resolveRange', () => {
  it('turns a preset into dates ending today', () => {
    expect(resolveRange({ range: '30', from: '', to: '', g: '' }, today)).toEqual({
      from: '2026-09-27',
      to: today,
      granularity: undefined,
    });
    expect(resolveRange({ range: '7', from: '', to: '', g: 'week' }, today)).toMatchObject({ from: '2026-10-20', granularity: 'week' });
  });

  it('uses the custom dates, filling in what is missing', () => {
    expect(resolveRange({ range: 'custom', from: '2026-10-01', to: '2026-10-10', g: '' }, today)).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-10',
    });
    expect(resolveRange({ range: 'custom', from: '', to: '2026-10-10', g: '' }, today).from).toBe('2026-09-11');
  });
});

describe('validateRange', () => {
  it('accepts a normal range', () => {
    expect(validateRange('2026-10-01', '2026-10-26', today)).toBeNull();
  });

  it('explains what is wrong', () => {
    expect(validateRange('nope', today, today)).toMatch(/valid dates/);
    expect(validateRange('2026-10-10', '2026-10-01', today)).toMatch(/on or before/);
    expect(validateRange('2026-10-01', '2026-10-27', today)).toMatch(/future/);
    expect(validateRange('2025-01-01', today, today)).toMatch(/12 months/);
    expect(validateRange('2026-06-01', today, today, 'day')).toMatch(/92 days/);
    expect(validateRange('2026-06-01', today, today, 'week')).toBeNull();
  });
});

describe('formatting', () => {
  it('labels days and weeks', () => {
    expect(formatBucket('2026-10-05', 'day')).toBe('Oct 5');
    expect(formatBucket('2026-10-05', 'week', true)).toBe('Week of Oct 5');
    expect(formatBucket('2026-10-05', 'day', true)).toContain('2026');
  });

  it('shortens money for chart axes', () => {
    expect(formatMoneyShort(0)).toBe('$0');
    expect(formatMoneyShort(950)).toBe('$950');
    expect(formatMoneyShort(1500)).toBe('$1.5k');
    expect(formatMoneyShort(12000)).toBe('$12k');
  });
});