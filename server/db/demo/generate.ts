import { evaluateDiscount, fromCents, toCents } from '../../src/discounts.js';
import {
  BUNDLES,
  DEMO_ADDRESS_PREFIX,
  DEMO_EMAIL_DOMAIN,
  EXISTING_CUSTOMERS,
  FIRST_NAMES,
  LAST_NAMES,
  PERSONA_POOLS,
  STREETS,
  demoCodes,
} from './data.js';
import type { DemoCode, Persona } from './data.js';
import { createRandom } from './random.js';
import type { Rng } from './random.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
const SHIPPING = 5;
const PERSONAS: Persona[] = ['gamer', 'creator', 'remote', 'office'];

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
type PaymentPlan = 'paid' | 'paid_after_retry' | 'refunded' | 'unpaid' | 'failed';

export interface DemoProduct {
  id: number;
  name: string;
  price: number;
}
export interface PlanCustomer {
  key: string;
  email: string;
  name: string;
  persona: Persona;
  existing: boolean;
  createdAt: Date;
}
export interface DemoItem {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
}
export interface DemoPayment {
  status: 'succeeded' | 'failed' | 'refunded';
  amount: number;
  cardBrand: string;
  cardLast4: string;
  failureReason: string | null;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
  ref: string;
}
export interface DemoOrder {
  customerKey: string;
  createdAt: Date;
  status: OrderStatus;
  paymentStatus: 'unpaid' | 'paid' | 'failed' | 'refunded';
  address: string;
  items: DemoItem[];
  subtotal: number;
  discount: number;
  discountCode: string | null;
  shipping: number;
  total: number;
  payments: DemoPayment[];
}
export interface DemoView {
  customerKey: string;
  productId: number;
  viewCount: number;
  firstViewedAt: Date;
  lastViewedAt: Date;
}
export interface DemoPlan {
  customers: PlanCustomer[];
  orders: DemoOrder[];
  views: DemoView[];
}
export interface GenerateInput {
  products: DemoProduct[];
  now: Date;
  seed?: number;
  customerCount?: number;
}

type Table<T> = readonly (readonly [T, number])[];

// الطلب القديم غالبًا مستلم، والطلب الجديد غالبًا لسا بالانتظار
const OLD: Table<OrderStatus> = [['delivered', 84], ['cancelled', 12], ['shipped', 4]];
const MID: Table<OrderStatus> = [['delivered', 45], ['shipped', 30], ['processing', 10], ['cancelled', 10], ['pending', 5]];
const RECENT: Table<OrderStatus> = [['shipped', 25], ['processing', 35], ['pending', 25], ['delivered', 5], ['cancelled', 10]];
const FRESH: Table<OrderStatus> = [['pending', 55], ['processing', 30], ['shipped', 10], ['cancelled', 5]];
const PENDING_PLANS: Table<PaymentPlan> = [['paid', 50], ['unpaid', 30], ['failed', 20]];
const CANCELLED_PLANS: Table<PaymentPlan> = [['refunded', 50], ['unpaid', 30], ['failed', 20]];
const PAYMENT_STATUS: Record<PaymentPlan, DemoOrder['paymentStatus']> = {
  paid: 'paid',
  paid_after_retry: 'paid',
  refunded: 'refunded',
  unpaid: 'unpaid',
  failed: 'failed',
};

// أرقام بطاقات الاختبار الحقيقية بالبوابة التجريبية
const SUCCESS_CARDS = [['visa', '4242'], ['mastercard', '4444'], ['amex', '0005']] as const;
const FAILURE_CARDS = [
  ['visa', '0002', 'card_declined'],
  ['visa', '9995', 'insufficient_funds'],
  ['visa', '0127', 'incorrect_cvc'],
  ['visa', '0119', 'processing_error'],
] as const;

function pickStatus(rng: Rng, ageDays: number): OrderStatus {
  return rng.weighted(ageDays > 21 ? OLD : ageDays > 7 ? MID : ageDays > 2 ? RECENT : FRESH);
}

function pickPaymentPlan(rng: Rng, status: OrderStatus): PaymentPlan {
  if (status === 'cancelled') return rng.weighted(CANCELLED_PLANS);
  if (status === 'pending') return rng.weighted(PENDING_PLANS);
  // الطلب اللي تقدم عن pending لازم يكون مدفوع. وبعضها دفعته فشلت أول مرة ونجحت بعدين
  return rng.chance(0.12) ? 'paid_after_retry' : 'paid';
}

function buildPayments(rng: Rng, plan: PaymentPlan, createdAt: Date, amount: number, now: Date, ref: string): DemoPayment[] {
  const at = (minutes: number) => new Date(createdAt.getTime() + minutes * MINUTE);

  const failed = (minutes: number, n: number): DemoPayment => {
    const [brand, last4, reason] = rng.pick(FAILURE_CARDS);
    return { status: 'failed', amount, cardBrand: brand, cardLast4: last4, failureReason: reason, createdAt: at(minutes), paidAt: null, refundedAt: null, ref: `${ref}_${n}` };
  };
  const succeeded = (minutes: number, n: number, refunded: boolean): DemoPayment => {
    const [brand, last4] = rng.pick(SUCCESS_CARDS);
    const paidAt = new Date(at(minutes).getTime() + rng.int(10, 90) * 1000);
    const refundedAt = refunded
      ? new Date(Math.min(now.getTime(), paidAt.getTime() + rng.int(20, 72) * 60 * MINUTE))
      : null;
    return { status: refunded ? 'refunded' : 'succeeded', amount, cardBrand: brand, cardLast4: last4, failureReason: null, createdAt: at(minutes), paidAt, refundedAt, ref: `${ref}_${n}` };
  };

  switch (plan) {
    case 'paid':
      return [succeeded(rng.int(1, 5), 1, false)];
    case 'paid_after_retry':
      return [failed(rng.int(1, 3), 1), succeeded(rng.int(4, 9), 2, false)];
    case 'refunded':
      return [succeeded(rng.int(1, 5), 1, true)];
    case 'failed':
      return [failed(rng.int(1, 5), 1)];
    default:
      return [];
  }
}

function pickItems(
  rng: Rng,
  pool: Table<DemoProduct>,
  all: DemoProduct[],
  persona: Persona,
  byName: Map<string, DemoProduct>,
): DemoItem[] {
  const target = rng.weighted([[1, 55], [2, 33], [3, 12]] as const);
  const chosen: DemoProduct[] = [];
  const add = (p: DemoProduct | undefined) => {
    if (p && !chosen.some((c) => c.id === p.id)) chosen.push(p);
  };

  // أحيانًا بنختار "باقة" بتنباع سوا، وهيك بتتكون إشارة "اللي اشترى هيك اشترى كمان"
  if (rng.chance(0.25)) {
    const names = new Set(PERSONA_POOLS[persona].map(([name]) => name));
    const options = BUNDLES.filter((bundle) => names.has(bundle[0]) && bundle.every((name) => byName.has(name)));
    if (options.length > 0) for (const name of rng.pick(options)) add(byName.get(name));
  }
  for (let attempts = 0; chosen.length < target && attempts < 20; attempts++) {
    add(rng.chance(0.85) ? rng.weighted(pool) : rng.pick(all));
  }

  return chosen.map((product) => ({
    productId: product.id,
    name: product.name,
    unitPrice: product.price,
    quantity: rng.chance(product.price < 40 ? 0.25 : 0.1) ? 2 : 1,
  }));
}

function pickCode(
  rng: Rng,
  codes: DemoCode[],
  orderIndex: number,
  at: Date,
  subtotalCents: number,
  uses: Map<string, number>,
): DemoCode | null {
  for (const c of codes) {
    const open = (!c.from || at >= c.from) && (!c.until || at <= c.until);
    const bigEnough = subtotalCents >= toCents(c.minSubtotal);
    const firstOk = !c.firstOrderOnly || orderIndex === 0;
    const left = c.limit === null || (uses.get(c.code) ?? 0) < c.limit;
    if (open && bigEnough && firstOk && left && rng.chance(c.firstOrderOnly ? 0.6 : 0.25)) return c;
  }
  return null;
}

function buildViews(rng: Rng, customer: PlanCustomer, pool: Table<DemoProduct>, all: DemoProduct[], now: Date): DemoView[] {
  const wanted = rng.int(3, 10);
  const seen = new Set<number>();
  const views: DemoView[] = [];

  for (let i = 0; i < wanted * 3 && views.length < wanted; i++) {
    const product = rng.chance(0.8) ? rng.weighted(pool) : rng.pick(all);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);

    const viewCount = rng.weighted([[1, 50], [2, 30], [3, 15], [4, 5]] as const);
    const earliest = customer.createdAt.getTime() + 60 * MINUTE;
    const lastViewedAt = new Date(Math.max(now.getTime() - rng.int(60, 25 * 24 * 60) * MINUTE, earliest));
    const spread = (viewCount - 1) * rng.int(5, 96) * 60 * MINUTE;
    const firstViewedAt = new Date(Math.max(lastViewedAt.getTime() - spread, customer.createdAt.getTime()));
    views.push({ customerKey: customer.key, productId: product.id, viewCount, firstViewedAt, lastViewedAt });
  }
  return views;
}

export function generateDemo({ products, now, seed = 20261026, customerCount = 25 }: GenerateInput): DemoPlan {
  if (products.length === 0) return { customers: [], orders: [], views: [] };

  const rng = createRandom(seed);
  const byName = new Map(products.map((p) => [p.name, p]));
  const codes = demoCodes(now);
  const codeUses = new Map<string, number>(); // استخدامات الطلبات غير الملغية
  const usedEmails = new Set<string>(EXISTING_CUSTOMERS.map((c) => c.email));

  // مجموعة منتجات النمط. وإذا ما لقينا أي منتج منها بنرجع لكل المنتجات
  const poolFor = (persona: Persona): Table<DemoProduct> => {
    const entries = PERSONA_POOLS[persona].flatMap(([name, weight]) => {
      const product = byName.get(name);
      return product ? [[product, weight] as const] : [];
    });
    return entries.length > 0 ? entries : products.map((p) => [p, 1] as const);
  };

  const customers: PlanCustomer[] = [];
  const orderCounts = new Map<string, number>();

  for (const e of EXISTING_CUSTOMERS) {
    customers.push({ key: e.email, email: e.email, name: e.name, persona: e.persona, existing: true, createdAt: new Date(0) });
    orderCounts.set(e.email, e.orders);
  }
  for (let i = 0; i < customerCount; i++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const base = `${first}.${last}`.toLowerCase();
    const email = usedEmails.has(`${base}@${DEMO_EMAIL_DOMAIN}`) ? `${base}${i}@${DEMO_EMAIL_DOMAIN}` : `${base}@${DEMO_EMAIL_DOMAIN}`;
    usedEmails.add(email);
    customers.push({ key: email, email, name: `${first} ${last}`, persona: rng.pick(PERSONAS), existing: false, createdAt: new Date(0) });
    orderCounts.set(email, rng.weighted([[0, 2], [1, 5], [2, 6], [3, 5], [4, 4], [5, 2], [6, 1]] as const));
  }

  // الطلبات بتكثر بالفترة الأخيرة (شكل نمو)، وكل طلب قبل "هلأ" بساعة على الأقل
  const orderTime = () => {
    const days = Math.floor(60 * Math.pow(rng.next(), 1.4));
    return new Date(now.getTime() - days * DAY - rng.int(60, 1200) * MINUTE);
  };

  const orders: DemoOrder[] = [];
  const views: DemoView[] = [];
  let seq = 0;

  for (const customer of customers) {
    const pool = poolFor(customer.persona);
    const times = Array.from({ length: orderCounts.get(customer.key) ?? 0 }, () => orderTime()).sort(
      (a, b) => a.getTime() - b.getTime(),
    );

    times.forEach((createdAt, index) => {
      seq += 1;
      const ageDays = (now.getTime() - createdAt.getTime()) / DAY;
      const status = pickStatus(rng, ageDays);
      const items = pickItems(rng, pool, products, customer.persona, byName);
      const subtotalCents = items.reduce((sum, i) => sum + toCents(i.unitPrice) * i.quantity, 0);

      // نفس منطق الخصم الحقيقي بالسيرفر
      const code = pickCode(rng, codes, index, createdAt, subtotalCents, codeUses);
      let discountCents = 0;
      let appliedCode: string | null = null;
      if (code) {
        const check = evaluateDiscount(
          { code: code.code, type: code.type, value: code.value, expiresAt: null, usageLimit: null, timesUsed: 0, active: true },
          subtotalCents,
        );
        if (check.ok) {
          discountCents = check.discountCents;
          appliedCode = code.code;
          if (status !== 'cancelled') codeUses.set(code.code, (codeUses.get(code.code) ?? 0) + 1);
        }
      }

      const totalCents = subtotalCents - discountCents + toCents(SHIPPING);
      const plan = pickPaymentPlan(rng, status);
      orders.push({
        customerKey: customer.key,
        createdAt,
        status,
        paymentStatus: PAYMENT_STATUS[plan],
        address: `${DEMO_ADDRESS_PREFIX}${rng.int(1, 120)} ${rng.pick(STREETS)}, Nablus`,
        items,
        subtotal: fromCents(subtotalCents),
        discount: fromCents(discountCents),
        discountCode: appliedCode,
        shipping: SHIPPING,
        total: fromCents(totalCents),
        payments: buildPayments(rng, plan, createdAt, fromCents(totalCents), now, `pi_demo_${seq}`),
      });
    });

    if (!customer.existing) {
      customer.createdAt =
        times.length > 0
          ? new Date(times[0].getTime() - rng.int(1, 5) * DAY)
          : new Date(now.getTime() - rng.int(5, 60) * DAY);
      views.push(...buildViews(rng, customer, pool, products, now));
    }
  }

  orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { customers, orders, views };
}

export function summarize(plan: DemoPlan) {
  const count = <T extends string>(values: T[]) =>
    values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
  return {
    customers: plan.customers.filter((c) => !c.existing).length,
    orders: plan.orders.length,
    byStatus: count(plan.orders.map((o) => o.status)),
    byPayment: count(plan.orders.map((o) => o.paymentStatus)),
    withDiscount: plan.orders.filter((o) => o.discountCode).length,
    views: plan.views.length,
  };
}