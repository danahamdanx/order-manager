import { describe, expect, it } from 'vitest';
import { BUNDLES, DEMO_PRODUCTS, PERSONA_POOLS, demoCodes, slugify } from '../../db/demo/data';
import { generateDemo } from '../../db/demo/generate';
import type { DemoOrder } from '../../db/demo/generate';
import { toCents } from '../../src/discounts';
import { PRODUCT_COLORS } from '../../src/validation';

const products = DEMO_PRODUCTS.map((p, i) => ({ id: i + 1, name: p.name, price: p.price }));
const now = new Date('2026-10-26T12:00:00Z');
const DAY = 86_400_000;
const plan = generateDemo({ products, now });
// عينة كبيرة للفحوصات الإحصائية (عشان الأحداث النادرة تظهر بالتأكيد)
const big = generateDemo({ products, now, customerCount: 80, seed: 99 });

const firstOrderOf = (orders: DemoOrder[]) => {
  const first = new Map<string, DemoOrder>();
  for (const o of orders) {
    const current = first.get(o.customerKey);
    if (!current || o.createdAt < current.createdAt) first.set(o.customerKey, o);
  }
  return first;
};

describe('catalog data', () => {
  it('has unique names and slugs, valid prices and colors', () => {
    expect(new Set(DEMO_PRODUCTS.map((p) => p.name.toLowerCase())).size).toBe(DEMO_PRODUCTS.length);
    expect(new Set(DEMO_PRODUCTS.map((p) => slugify(p.name))).size).toBe(DEMO_PRODUCTS.length);
    for (const p of DEMO_PRODUCTS) {
      expect(p.price).toBeGreaterThan(0);
      expect(Math.round(p.price * 100) / 100).toBe(p.price);
      expect(p.stock).toBeGreaterThanOrEqual(0);
      expect((PRODUCT_COLORS as readonly string[]).includes(p.color), p.name).toBe(true);
    }
  });

  it('turns names into file-friendly slugs', () => {
    expect(slugify('Monitor 24"')).toBe('monitor-24');
    expect(slugify('Monitor 27" 4K')).toBe('monitor-27-4k');
    expect(slugify('USB-C Hub')).toBe('usb-c-hub');
  });

  it('only references products that exist', () => {
    const names = new Set(DEMO_PRODUCTS.map((p) => p.name));
    for (const pool of Object.values(PERSONA_POOLS)) for (const [name] of pool) expect(names.has(name), name).toBe(true);
    for (const bundle of BUNDLES) for (const name of bundle) expect(names.has(name), name).toBe(true);
  });
});

describe('generateDemo', () => {
  it('is deterministic for a seed and different for another one', () => {
    expect(JSON.stringify(generateDemo({ products, now }))).toBe(JSON.stringify(plan));
    expect(JSON.stringify(generateDemo({ products, now, seed: 1 }))).not.toBe(JSON.stringify(plan));
  });

  it('creates the requested customers and orders for the existing accounts', () => {
    expect(plan.customers.filter((c) => !c.existing)).toHaveLength(25);
    expect(plan.orders.length).toBeGreaterThan(40);
    expect(plan.orders.filter((o) => o.customerKey === 'lina@example.com')).toHaveLength(4);
    expect(plan.orders.filter((o) => o.customerKey === 'omar@example.com')).toHaveLength(3);
  });

  it('uses unique demo emails and creates customers before their first order', () => {
    const created = plan.customers.filter((c) => !c.existing);
    expect(new Set(created.map((c) => c.email)).size).toBe(created.length);
    const first = firstOrderOf(plan.orders);
    for (const c of created) {
      expect(c.email.endsWith('@demo.test')).toBe(true);
      expect(c.createdAt.getTime()).toBeLessThan(now.getTime());
      const order = first.get(c.key);
      if (order) expect(c.createdAt.getTime()).toBeLessThan(order.createdAt.getTime());
    }
  });

  it('keeps every order total consistent', () => {
    for (const o of big.orders) {
      const itemsCents = o.items.reduce((sum, i) => sum + toCents(i.unitPrice) * i.quantity, 0);
      expect(toCents(o.subtotal)).toBe(itemsCents);
      expect(toCents(o.discount)).toBeLessThanOrEqual(toCents(o.subtotal));
      expect(toCents(o.subtotal) - toCents(o.discount) + toCents(o.shipping)).toBe(toCents(o.total));
      expect(o.items.length).toBeGreaterThan(0);
      expect(o.address.startsWith('[demo] ')).toBe(true);
    }
  });

  it('keeps statuses and payments consistent with each other', () => {
    for (const o of big.orders) {
      const last = o.payments[o.payments.length - 1];
      if (['processing', 'shipped', 'delivered'].includes(o.status)) {
        expect(o.paymentStatus).toBe('paid');
        expect(last.status).toBe('succeeded');
      }
      if (o.status === 'cancelled') expect(o.paymentStatus).not.toBe('paid');

      if (o.paymentStatus === 'unpaid') expect(o.payments).toHaveLength(0);
      if (o.paymentStatus === 'failed') expect(o.payments.every((p) => p.status === 'failed' && p.failureReason)).toBe(true);
      if (o.paymentStatus === 'refunded') {
        expect(last.status).toBe('refunded');
        expect(last.refundedAt!.getTime()).toBeGreaterThanOrEqual(last.paidAt!.getTime());
      }
      if (o.paymentStatus === 'paid') {
        expect(last.status).toBe('succeeded');
        expect(o.payments.slice(0, -1).every((p) => p.status === 'failed')).toBe(true);
      }
      for (const p of o.payments) {
        expect(p.amount).toBe(o.total);
        expect(p.cardLast4).toMatch(/^\d{4}$/);
        expect(p.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
      }
    }
  });

  it('covers every kind of order so the dashboards have something to show', () => {
    expect(new Set(big.orders.map((o) => o.status))).toEqual(
      new Set(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
    );
    expect(big.orders.some((o) => o.payments.length === 2)).toBe(true);
    expect(big.orders.some((o) => o.paymentStatus === 'refunded')).toBe(true);
    expect(big.orders.some((o) => o.paymentStatus === 'failed')).toBe(true);
    expect(big.orders.some((o) => o.discountCode)).toBe(true);
  });

  it('keeps all dates in the past, within the last two months', () => {
    for (const o of big.orders) {
      expect(o.createdAt.getTime()).toBeLessThanOrEqual(now.getTime() - 60 * 60_000);
      expect(o.createdAt.getTime()).toBeGreaterThan(now.getTime() - 62 * DAY);
    }
  });

  it('applies discount codes only where their rules allow', () => {
    const first = firstOrderOf(big.orders);
    const flash = demoCodes(now).find((c) => c.code === 'FLASH20')!;
    let flashUses = 0;

    for (const o of big.orders) {
      if (!o.discountCode) {
        expect(o.discount).toBe(0);
        continue;
      }
      expect(o.discount).toBeGreaterThan(0);
      if (o.discountCode === 'WELCOME10') expect(first.get(o.customerKey)).toBe(o);
      if (o.discountCode === 'SAVE5') expect(o.subtotal).toBeGreaterThanOrEqual(40);
      if (o.discountCode === 'FLASH20') {
        expect(o.createdAt >= flash.from!).toBe(true);
        expect(o.createdAt <= flash.until!).toBe(true);
        if (o.status !== 'cancelled') flashUses++;
      }
      expect(['WELCOME10', 'SAVE5', 'FLASH20']).toContain(o.discountCode);
    }
    expect(flashUses).toBeLessThanOrEqual(flash.limit!);
  });

  it('records plausible product views for new customers only', () => {
    const seen = new Set<string>();
    const created = new Map(big.customers.map((c) => [c.key, c]));
    for (const v of big.views) {
      const key = `${v.customerKey}:${v.productId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);

      const customer = created.get(v.customerKey)!;
      expect(customer.existing).toBe(false);
      expect(v.viewCount).toBeGreaterThanOrEqual(1);
      expect(v.viewCount).toBeLessThanOrEqual(4);
      expect(v.firstViewedAt.getTime()).toBeLessThanOrEqual(v.lastViewedAt.getTime());
      expect(v.lastViewedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(v.lastViewedAt.getTime()).toBeGreaterThanOrEqual(now.getTime() - 25 * DAY);
      expect(v.firstViewedAt.getTime()).toBeGreaterThanOrEqual(customer.createdAt.getTime());
    }
  });

  it('makes customers buy mostly from their own persona', () => {
    const byKey = new Map(big.customers.map((c) => [c.key, c]));
    let inPool = 0;
    let total = 0;
    for (const o of big.orders) {
      const persona = byKey.get(o.customerKey)!.persona;
      const names = new Set(PERSONA_POOLS[persona].map(([name]) => name));
      for (const item of o.items) {
        total++;
        if (names.has(item.name)) inPool++;
      }
    }
    expect(inPool / total).toBeGreaterThan(0.6);
  });

  it('works with a partial catalog and an empty one', () => {
    const subset = products.filter((p) => p.name.includes('Keyboard'));
    const partial = generateDemo({ products: subset, now });
    const ids = new Set(subset.map((p) => p.id));
    expect(partial.orders.length).toBeGreaterThan(0);
    for (const o of partial.orders) for (const i of o.items) expect(ids.has(i.productId)).toBe(true);

    expect(generateDemo({ products: [], now })).toEqual({ customers: [], orders: [], views: [] });
  });
});