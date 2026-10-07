import { describe, expect, it } from 'vitest';
import { initials, itemsSummary, money } from './format';

describe('format helpers', () => {
  it('formats money with two decimals', () => {
    expect(money(5)).toBe('$5.00');
    expect(money(19.999)).toBe('$20.00');
  });

  it('builds initials from a name', () => {
    expect(initials('Lina Haddad')).toBe('LH');
    expect(initials('omar')).toBe('O');
  });

  it('summarizes order items', () => {
    const item = (productName: string) => ({ productId: 1, productName, unitPrice: 1, quantity: 1 });
    expect(itemsSummary([])).toBe('');
    expect(itemsSummary([item('Mouse')])).toBe('Mouse');
    expect(itemsSummary([item('Mouse'), item('Hub')])).toBe('Mouse +1 more');
  });
});