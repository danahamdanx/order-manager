import { PRODUCT_SELECT } from './catalog.js';
import { query, queryOne } from './db.js';
import { HttpError } from './errors.js';
import { emptySignals, rankProducts } from './ranking.js';
import type { Candidate, CoPurchase, Signals } from './ranking.js';

const CANDIDATE_LIMIT = 500;
const RECENT_ORDERS = 5;
const PURCHASE_HALF_LIFE_DAYS = 60;
const VIEW_HALF_LIFE_DAYS = 14;

type ProductRow = { id: number; category: string; stock: number; createdAt: Date } & Record<string, unknown>;

export interface RecommendInput {
  userId: number | null;
  contextProductId: number | null;
  limit: number;
}

// المنتجات اللي اشتراها الزبون (طلبات غير ملغية). بنخفيها من الاقتراحات
async function purchasedProductIds(userId: number): Promise<number[]> {
  const rows = await query<{ productId: number }>(
    `SELECT DISTINCT oi.product_id AS "productId"
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 AND o.status <> 'cancelled' LIMIT 200`,
    [userId],
  );
  return rows.map((r) => r.productId);
}

// تصنيفات آخر 5 طلبات. كل بند بيحسب بالكمية، والأحدث بيوزن أكتر (نصف الوزن كل 60 يوم)
async function purchasedCategories(userId: number): Promise<Map<string, number>> {
  const rows = await query<{ category: string; score: number }>(
    `WITH recent AS (
       SELECT id, created_at FROM orders
       WHERE user_id = $1 AND status <> 'cancelled'
       ORDER BY created_at DESC, id DESC LIMIT ${RECENT_ORDERS})
     SELECT c.name AS category,
            SUM(oi.quantity * power(0.5::float8, EXTRACT(EPOCH FROM (now() - r.created_at))::float8 / 86400.0 / ${PURCHASE_HALF_LIFE_DAYS}.0))::float8 AS score
     FROM recent r
     JOIN order_items oi ON oi.order_id = r.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     GROUP BY c.name`,
    [userId],
  );
  return new Map(rows.map((r) => [r.category, r.score]));
}

// تصنيفات اللي شافه آخر 30 يوم (كل منتج بحد أقصى 3 مشاهدات، ونصف الوزن كل 14 يوم)
async function viewedCategories(userId: number): Promise<Map<string, number>> {
  const rows = await query<{ category: string; score: number }>(
    `SELECT c.name AS category,
            SUM(LEAST(v.view_count, 3) * power(0.5::float8, EXTRACT(EPOCH FROM (now() - v.last_viewed_at))::float8 / 86400.0 / ${VIEW_HALF_LIFE_DAYS}.0))::float8 AS score
     FROM product_views v
     JOIN products p ON p.id = v.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE v.user_id = $1 AND v.last_viewed_at > now() - interval '30 days'
     GROUP BY c.name`,
    [userId],
  );
  return new Map(rows.map((r) => [r.category, r.score]));
}

// "اللي اشترى هيك اشترى كمان": منتجات ظهرت بنفس الطلب مع المنتجات المصدر.
// excludeUserId: بنتجاهل طلبات الزبون نفسه عشان ما نكرر عليه مشترياته
async function coPurchases(sourceIds: number[], excludeUserId: number | null): Promise<Map<number, CoPurchase>> {
  if (sourceIds.length === 0) return new Map();
  const rows = await query<{ productId: number; count: number; via: string }>(
    `WITH pairs AS (
       SELECT b.product_id AS candidate, a.product_id AS source, COUNT(DISTINCT a.order_id)::int AS together
       FROM order_items a
       JOIN order_items b ON b.order_id = a.order_id AND b.product_id <> a.product_id
       JOIN orders o ON o.id = a.order_id
       WHERE a.product_id = ANY($1::int[]) AND o.status <> 'cancelled' AND ($2::int IS NULL OR o.user_id <> $2)
       GROUP BY b.product_id, a.product_id)
     SELECT DISTINCT ON (pairs.candidate)
            pairs.candidate AS "productId",
            (SUM(pairs.together) OVER (PARTITION BY pairs.candidate))::int AS count,
            pr.name AS via
     FROM pairs JOIN products pr ON pr.id = pairs.source
     ORDER BY pairs.candidate, pairs.together DESC, pairs.source`,
    [sourceIds, excludeUserId],
  );
  return new Map(rows.map((r) => [r.productId, { count: r.count, via: r.via }]));
}

// الأكثر مبيعًا آخر 90 يوم (طلبات غير ملغية)
async function popularity(): Promise<Map<number, number>> {
  const rows = await query<{ productId: number; units: number }>(
    `SELECT oi.product_id AS "productId", SUM(oi.quantity)::int AS units
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'cancelled' AND o.created_at > now() - interval '90 days'
     GROUP BY oi.product_id`,
  );
  return new Map(rows.map((r) => [r.productId, r.units]));
}

export async function recommend({ userId, contextProductId, limit }: RecommendInput) {
  const signals: Signals = emptySignals();

  if (contextProductId !== null) {
    const ctx = await queryOne<{ category: string }>(
      `SELECT c.name AS category FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.active = true`,
      [contextProductId],
    );
    if (!ctx) throw new HttpError(404, 'Product not found');
    signals.contextCategory = ctx.category;
    signals.excludeIds.add(contextProductId);
  }

  const [rows, pop] = await Promise.all([
    query<ProductRow>(`${PRODUCT_SELECT} WHERE p.active = true AND p.stock > 0 ORDER BY p.id LIMIT ${CANDIDATE_LIMIT}`),
    popularity(),
  ]);
  signals.popularity = pop;

  let purchasedIds: number[] = [];
  if (userId !== null) {
    const [ids, bought, viewed] = await Promise.all([
      purchasedProductIds(userId),
      purchasedCategories(userId),
      viewedCategories(userId),
    ]);
    purchasedIds = ids;
    for (const id of ids) signals.excludeIds.add(id);
    signals.purchasedCategories = bought;
    signals.viewedCategories = viewed;
  }

  // بصفحة المنتج: "اللي اشترى هالمنتج اشترى كمان". وبغيرها: من مشتريات الزبون نفسه
  signals.coPurchases =
    contextProductId !== null ? await coPurchases([contextProductId], null) : await coPurchases(purchasedIds, userId);

  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    category: r.category,
    stock: r.stock,
    createdAt: new Date(r.createdAt).getTime(),
  }));
  const ranked = rankProducts(candidates, signals, { limit });
  const byId = new Map(rows.map((r) => [r.id, r]));

  return {
    items: ranked.map((r) => ({ ...byId.get(r.id)!, reason: r.reason })),
    // "مخصص" = في معلومات عن هالزبون بالذات (مش مجرد سياق صفحة المنتج)
    personalized: signals.purchasedCategories.size > 0 || signals.viewedCategories.size > 0,
  };
}