import { describe, expect, it } from 'vitest';
import { capRows, escapeCell, toCsv } from '../../src/csv';
import { parseThreshold } from '../../src/analytics';
import { parseCsv } from '../csv-parse';

describe('escapeCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(escapeCell('hello')).toBe('hello');
    expect(escapeCell(42)).toBe('42');
    expect(escapeCell(0)).toBe('0');
    expect(escapeCell(-5)).toBe('-5'); // رقم فعلًا، مش نص
    expect(escapeCell('دانا حمدان')).toBe('دانا حمدان');
  });

  it('turns empty values into empty cells', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
    expect(escapeCell(Number.NaN)).toBe('');
    expect(escapeCell('')).toBe('');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCell(' padded ')).toBe('" padded "');
  });

  it('formats booleans and dates', () => {
    expect(escapeCell(true)).toBe('true');
    expect(escapeCell(new Date('2026-10-26T12:00:00Z'))).toBe('2026-10-26T12:00:00.000Z');
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(escapeCell('=1+1')).toBe("'=1+1");
    expect(escapeCell('+1')).toBe("'+1");
    expect(escapeCell('-1')).toBe("'-1");
    expect(escapeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCell('\tcmd')).toBe("'\tcmd");
    expect(escapeCell('=HYPERLINK("http://evil.test","x")')).toBe(`"'=HYPERLINK(""http://evil.test"",""x"")"`);
    expect(escapeCell('a=b')).toBe('a=b'); // = بنص الكلمة مش بالبداية
  });
});

describe('toCsv', () => {
  it('uses CRLF line endings, including the last line', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, 'y']])).toBe('a,b\r\n1,x\r\n2,y\r\n');
  });

  it('survives a round trip through a CSV reader', () => {
    const values = ['plain', 'a,b', 'say "hi"', 'line1\nline2', ' spaced ', 'دانا', '', 'x\r\ny'];
    const parsed = parseCsv(toCsv(['h'], values.map((v) => [v])));
    expect(parsed.slice(1).map((r) => r[0])).toEqual(values);
  });
});

describe('capRows', () => {
  it('flags when rows were cut', () => {
    expect(capRows([1, 2, 3], 5)).toEqual({ rows: [1, 2, 3], truncated: false });
    expect(capRows([1, 2, 3, 4, 5, 6], 5)).toEqual({ rows: [1, 2, 3, 4, 5], truncated: true });
  });
});

describe('parseThreshold', () => {
  it('defaults to 5 and accepts 0 to 1000', () => {
    expect(parseThreshold(undefined)).toBe(5);
    expect(parseThreshold('')).toBe(5);
    expect(parseThreshold('0')).toBe(0);
    expect(parseThreshold('1000')).toBe(1000);
  });

  it('rejects everything else', () => {
    for (const bad of ['-1', '1001', '5.5', 'abc', '99999', ['5'], 5]) expect(parseThreshold(bad), String(bad)).toBeNull();
  });
});