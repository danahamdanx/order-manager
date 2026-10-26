export interface Candidate {
  id: number;
  category: string;
  stock: number;
  createdAt: number; // milliseconds
}

export interface CoPurchase {
  count: number; // كم مرة انباعوا مع منتجات الزبون
  via: string; // اسم منتج الزبون الأقوى ارتباطًا
}

export interface Signals {
  purchasedCategories: Map<string, number>;
  viewedCategories: Map<string, number>;
  coPurchases: Map<number, CoPurchase>;
  popularity: Map<number, number>;
  contextCategory: string | null;
  excludeIds: Set<number>;
}

export type ReasonType = 'bought_together' | 'ordered_category' | 'viewed_category' | 'similar' | 'popular';

export interface Ranked {
  id: number;
  score: number;
  reason: { type: ReasonType; label: string };
}

export interface RankOptions {
  limit: number;
  maxPerCategory?: number;
}

export const WEIGHTS = {
  coPurchase: 3,
  purchasedCategory: 2,
  viewedCategory: 1.5,
  context: 1,
  popularity: 0.5,
} as const;

export const emptySignals = (): Signals => ({
  purchasedCategories: new Map(),
  viewedCategories: new Map(),
  coPurchases: new Map(),
  popularity: new Map(),
  contextCategory: null,
  excludeIds: new Set(),
});

const maxOf = (values: Iterable<number>) => {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  return max;
};

// كل إشارة بتتحول لرقم بين 0 و1، فالأوزان بتتحكم بالأهمية مش حجم الأرقام
const norm = (value: number | undefined, max: number) => (value && max > 0 ? value / max : 0);

export function rankProducts(candidates: Candidate[], signals: Signals, options: RankOptions): Ranked[] {
  const { limit, maxPerCategory = 3 } = options;
  const eligible = candidates.filter((c) => c.stock > 0 && !signals.excludeIds.has(c.id));
  if (eligible.length === 0 || limit <= 0) return [];

  const maxBought = maxOf(signals.purchasedCategories.values());
  const maxViewed = maxOf(signals.viewedCategories.values());
  const maxCo = maxOf(eligible.map((c) => signals.coPurchases.get(c.id)?.count ?? 0));
  const maxPop = maxOf(eligible.map((c) => signals.popularity.get(c.id) ?? 0));

  const scored = eligible.map((c) => {
    const co = signals.coPurchases.get(c.id);
    const parts = [
      { type: 'bought_together' as const, value: norm(co?.count, maxCo) * WEIGHTS.coPurchase },
      { type: 'ordered_category' as const, value: norm(signals.purchasedCategories.get(c.category), maxBought) * WEIGHTS.purchasedCategory },
      { type: 'viewed_category' as const, value: norm(signals.viewedCategories.get(c.category), maxViewed) * WEIGHTS.viewedCategory },
      { type: 'similar' as const, value: (signals.contextCategory === c.category ? 1 : 0) * WEIGHTS.context },
    ];
    const popularity = signals.popularity.get(c.id) ?? 0;
    const total = parts.reduce((sum, p) => sum + p.value, 0) + norm(popularity, maxPop) * WEIGHTS.popularity;

    // السبب = أقوى إشارة (وعند التعادل بتفوز الأولى بالترتيب). وبدون إشارات: الأكثر مبيعًا
    const best = parts.reduce((a, b) => (b.value > a.value ? b : a));
    const labels: Record<Exclude<ReasonType, 'popular'>, string> = {
      bought_together: `Often bought with ${co?.via ?? 'your orders'}`,
      ordered_category: `Because you ordered ${c.category}`,
      viewed_category: `Because you viewed ${c.category}`,
      similar: `More in ${c.category}`,
    };
    const reason =
      best.value > 0
        ? { type: best.type, label: labels[best.type] }
        : { type: 'popular' as const, label: 'Popular right now' };

    return { candidate: c, popularity, score: Math.round(total * 1e9) / 1e9, reason };
  });

  // ترتيب ثابت (deterministic): النقاط، ثم الأكثر مبيعًا، ثم الأحدث، ثم الـ id
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.popularity - a.popularity ||
      b.candidate.createdAt - a.candidate.createdAt ||
      a.candidate.id - b.candidate.id,
  );

  // تنويع: حد أقصى لكل تصنيف. وإذا ما كفت المنتجات بنكمّل من اللي أجّلناهم
  const picked: typeof scored = [];
  const deferred: typeof scored = [];
  const perCategory = new Map<string, number>();
  for (const item of scored) {
    if (picked.length >= limit) break;
    const used = perCategory.get(item.candidate.category) ?? 0;
    if (used >= maxPerCategory) {
      deferred.push(item);
      continue;
    }
    perCategory.set(item.candidate.category, used + 1);
    picked.push(item);
  }
  for (const item of deferred) {
    if (picked.length >= limit) break;
    picked.push(item);
  }

  return picked.map((item) => ({ id: item.candidate.id, score: item.score, reason: item.reason }));
}