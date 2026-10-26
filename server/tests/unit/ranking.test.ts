import { describe, expect, it } from 'vitest';
import { emptySignals, rankProducts } from '../../src/ranking';
import type { Candidate, Signals } from '../../src/ranking';

const cand = (id: number, category: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  category,
  stock: 5,
  createdAt: id * 1000,
  ...over,
});
const signals = (over: Partial<Signals> = {}): Signals => ({ ...emptySignals(), ...over });
const ids = (ranked: { id: number }[]) => ranked.map((r) => r.id);

describe('new customers and guests', () => {
  it('ranks by popularity, then newest, then id', () => {
    const popularity = new Map([[3, 10], [2, 5]]);
    const ranked = rankProducts([cand(1, 'A'), cand(2, 'A'), cand(3, 'B')], signals({ popularity }), { limit: 3 });
    expect(ids(ranked)).toEqual([3, 2, 1]);
    expect(ranked.every((r) => r.reason.type === 'popular')).toBe(true);
  });

  it('shows the newest products first when nothing has sold yet', () => {
    const ranked = rankProducts([cand(1, 'A'), cand(2, 'B'), cand(3, 'C')], signals(), { limit: 3 });
    expect(ids(ranked)).toEqual([3, 2, 1]);
  });

  it('is deterministic', () => {
    const input = [cand(1, 'A'), cand(2, 'A'), cand(3, 'B')];
    const s = signals({ purchasedCategories: new Map([['A', 1]]) });
    expect(rankProducts(input, s, { limit: 3 })).toEqual(rankProducts(input, s, { limit: 3 }));
  });
});

describe('eligibility', () => {
  it('drops out-of-stock and excluded products', () => {
    const ranked = rankProducts(
      [cand(1, 'A', { stock: 0 }), cand(2, 'A'), cand(3, 'A')],
      signals({ excludeIds: new Set([2]) }),
      { limit: 5 },
    );
    expect(ids(ranked)).toEqual([3]);
  });

  it('returns nothing when there is nothing to show', () => {
    expect(rankProducts([], signals(), { limit: 5 })).toEqual([]);
    expect(rankProducts([cand(1, 'A')], signals(), { limit: 0 })).toEqual([]);
  });
});

describe('signals', () => {
  it('ranks purchases above views, and both above nothing', () => {
    const s = signals({
      purchasedCategories: new Map([['Keyboards', 4]]),
      viewedCategories: new Map([['Mice', 4]]),
    });
    const ranked = rankProducts([cand(1, 'Keyboards'), cand(2, 'Mice'), cand(3, 'Other')], s, { limit: 3 });
    expect(ids(ranked)).toEqual([1, 2, 3]);
    expect(ranked[0].reason.type).toBe('ordered_category');
    expect(ranked[1].reason.type).toBe('viewed_category');
    expect(ranked[2].reason.type).toBe('popular');
  });

  it('puts "bought together" first and explains it with the source product', () => {
    const s = signals({
      coPurchases: new Map([[10, { count: 2, via: 'Wireless Keyboard' }]]),
      purchasedCategories: new Map([['A', 1]]),
    });
    const ranked = rankProducts([cand(10, 'B'), cand(11, 'A')], s, { limit: 2 });
    expect(ids(ranked)).toEqual([10, 11]);
    expect(ranked[0].reason).toEqual({ type: 'bought_together', label: 'Often bought with Wireless Keyboard' });
  });

  it('uses the category of the current product on product pages', () => {
    const ranked = rankProducts([cand(1, 'A'), cand(2, 'B')], signals({ contextCategory: 'A' }), { limit: 2 });
    expect(ids(ranked)).toEqual([1, 2]);
    expect(ranked[0].reason).toEqual({ type: 'similar', label: 'More in A' });
  });

  it('gives different customers different results', () => {
    const input = [cand(1, 'A'), cand(2, 'B')];
    const forA = rankProducts(input, signals({ purchasedCategories: new Map([['A', 1]]) }), { limit: 2 });
    const forB = rankProducts(input, signals({ purchasedCategories: new Map([['B', 1]]) }), { limit: 2 });
    expect(ids(forA)).toEqual([1, 2]);
    expect(ids(forB)).toEqual([2, 1]);
  });

  it('does not depend on the scale of the numbers', () => {
    const input = [cand(1, 'A'), cand(2, 'B'), cand(3, 'C')];
    const small = rankProducts(input, signals({ purchasedCategories: new Map([['A', 1], ['B', 0.5]]) }), { limit: 3 });
    const large = rankProducts(input, signals({ purchasedCategories: new Map([['A', 10], ['B', 5]]) }), { limit: 3 });
    expect(small).toEqual(large);
  });

  it('normalizes co-purchases among products that can actually be shown', () => {
    const s = signals({
      coPurchases: new Map([[1, { count: 4, via: 'X' }], [2, { count: 2, via: 'X' }]]),
    });
    const all = rankProducts([cand(1, 'A'), cand(2, 'A')], s, { limit: 2 });
    expect(all.map((r) => r.score)).toEqual([3, 1.5]);

    const withoutFirst = rankProducts([cand(1, 'A', { stock: 0 }), cand(2, 'A')], s, { limit: 2 });
    expect(withoutFirst[0].score).toBe(3);
  });
});

describe('diversity', () => {
  const same = [1, 2, 3, 4, 5].map((id) => cand(id, 'A'));
  const s = () => signals({ purchasedCategories: new Map([['A', 1]]) });

  it('limits how many products come from one category', () => {
    const ranked = rankProducts([...same, cand(6, 'B'), cand(7, 'B')], s(), { limit: 4, maxPerCategory: 2 });
    expect(ranked).toHaveLength(4);
    expect(ranked.filter((r) => r.id <= 5)).toHaveLength(2);
  });

  it('still fills the list when there is only one category', () => {
    const ranked = rankProducts(same, s(), { limit: 4, maxPerCategory: 2 });
    expect(ids(ranked)).toEqual([5, 4, 3, 2]);
  });
});