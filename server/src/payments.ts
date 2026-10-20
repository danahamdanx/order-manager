import { queryOne, withTransaction } from './db.js';
import type { PaymentStatus, Role, Status } from './db.js';
import { HttpError } from './errors.js';
import { GATEWAY_SECRET } from './gateway/config.js';
import { gateway } from './gateway/index.js';
import { verifyWebhook } from './gateway/signing.js';
import type { GatewayEvent } from './gateway/types.js';

export type PaymentState = 'requires_payment' | 'succeeded' | 'failed' | 'refunded';

export interface PaymentRow {
  id: number;
  orderId: number;
  amount: number;
  status: PaymentState;
  cardBrand: string | null;
  cardLast4: string | null;
  failureReason: string | null;
  gatewayRef: string | null;
  createdAt: Date;
}

const COLUMNS = `id, order_id AS "orderId", amount, status, card_brand AS "cardBrand", card_last4 AS "cardLast4",
  failure_reason AS "failureReason", gateway_ref AS "gatewayRef", created_at AS "createdAt"`;

// الرد للمتصفح: بدون المرجع الداخلي، ومع الـ clientSecret بس لصاحب الدفعة وطالما هي مفتوحة
export async function paymentResponse(p: PaymentRow, withSecret: boolean) {
  const { gatewayRef, ...rest } = p;
  const clientSecret =
    withSecret && p.status === 'requires_payment' && gatewayRef
      ? await gateway.getClientSecret(gatewayRef, p.amount)
      : undefined;
  return { ...rest, ...(clientSecret && { clientSecret }) };
}

export async function getPayment(id: number, user: { user_id: number; role: Role }) {
  const staff = user.role !== 'customer';
  const payment = staff
    ? await queryOne<PaymentRow>(`SELECT ${COLUMNS} FROM payments WHERE id = $1`, [id])
    : await queryOne<PaymentRow>(
        `SELECT ${COLUMNS} FROM payments WHERE id = $1 AND order_id IN (SELECT id FROM orders WHERE user_id = $2)`,
        [id, user.user_id],
      );
  if (!payment) throw new HttpError(404, 'Payment not found');
  return paymentResponse(payment, !staff);
}

// بداية محاولة دفع. المبلغ دايمًا من قاعدة البيانات
export async function startPayment(
  userId: number,
  orderId: number,
  key: string,
): Promise<{ payment: PaymentRow; created: boolean }> {
  return withTransaction(async (client) => {
    // قفل الطلب: كل محاولات الدفع لنفس الطلب بتمر وحدة ورا وحدة
    const found = await client.query<{ status: Status; paymentStatus: PaymentStatus; total: number }>(
      `SELECT status, payment_status AS "paymentStatus", total FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId],
    );
    const order = found.rows[0];
    if (!order) throw new HttpError(404, 'Order not found');

    // نفس المفتاح = نفس الدفعة (إعادة الإرسال ما بتعمل دفعة جديدة)
    const replay = await client.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE order_id = $1 AND idempotency_key = $2`,
      [orderId, key],
    );
    if (replay.rows[0]) return { payment: replay.rows[0], created: false };

    if (order.status === 'cancelled') throw new HttpError(409, 'A cancelled order cannot be paid');
    if (order.paymentStatus === 'paid') throw new HttpError(409, 'This order is already paid');
    if (order.paymentStatus === 'refunded') throw new HttpError(409, 'This order was refunded');

    // في دفعة مفتوحة؟ بنكمل عليها بدل ما نعمل ثانية (مثلًا تابين مفتوحين)
    const open = await client.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE order_id = $1 AND status = 'requires_payment'`,
      [orderId],
    );
    if (open.rows[0]) return { payment: open.rows[0], created: false };

    const { ref } = await gateway.createIntent({ amount: order.total, orderId });
    const inserted = await client.query<PaymentRow>(
      `INSERT INTO payments (order_id, amount, status, method, gateway_ref, idempotency_key)
       VALUES ($1, $2, 'requires_payment', 'card', $3, $4) RETURNING ${COLUMNS}`,
      [orderId, order.total, ref, key],
    );
    return { payment: inserted.rows[0], created: true };
  });
}

// استقبال رسالة البوابة (webhook): التوقيع أول شي، وبعدين التحديث داخل transaction
export async function processGatewayEvent(
  rawBody: string,
  signature: string | undefined,
): Promise<{ received: true; note?: string }> {
  if (!verifyWebhook(GATEWAY_SECRET, rawBody, signature)) {
    throw new HttpError(400, 'Invalid webhook signature');
  }

  let event: GatewayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'Invalid webhook body');
  }
  const data = event?.data;
  const validType = event?.type === 'payment.succeeded' || event?.type === 'payment.failed';
  if (!validType || typeof data?.ref !== 'string' || typeof data?.amount !== 'number') {
    throw new HttpError(400, 'Invalid webhook event');
  }
  const last4 = data.cardLast4 == null ? null : String(data.cardLast4);
  if (last4 !== null && !/^\d{4}$/.test(last4)) throw new HttpError(400, 'Invalid webhook event');
  const brand = typeof data.cardBrand === 'string' ? data.cardBrand.slice(0, 20) : null;

  return withTransaction(async (client) => {
    const peek = await client.query<{ orderId: number }>(
      `SELECT order_id AS "orderId" FROM payments WHERE gateway_ref = $1`,
      [data.ref],
    );
    if (!peek.rows[0]) return { received: true, note: 'unknown payment' };
    const orderId = peek.rows[0].orderId;

    // الترتيب: الطلب أول ثم الدفعة (نفس باقي الكود)، عشان ما يصير deadlock
    const orderRes = await client.query<{ status: Status; paymentStatus: PaymentStatus }>(
      `SELECT status, payment_status AS "paymentStatus" FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = orderRes.rows[0];
    const paymentRes = await client.query<{ id: number; amount: number; status: PaymentState }>(
      `SELECT id, amount, status FROM payments WHERE gateway_ref = $1 FOR UPDATE`,
      [data.ref],
    );
    const payment = paymentRes.rows[0];

    // نفس الرسالة وصلت مرتين، أو الدفعة انحسمت قبل: بنتجاهل
    if (payment.status !== 'requires_payment') return { received: true, note: 'already processed' };

    const settle = (status: PaymentState, reason: string | null) =>
      client.query(
        `UPDATE payments SET status = $1, card_brand = $2, card_last4 = $3, failure_reason = $4, updated_at = now()
         WHERE id = $5`,
        [status, brand, last4, reason, payment.id],
      );
    const markOrderFailed = () =>
      client.query(
        `UPDATE orders SET payment_status = 'failed'
         WHERE id = $1 AND status <> 'cancelled' AND payment_status IN ('unpaid', 'failed')`,
        [orderId],
      );

    if (event.type === 'payment.succeeded') {
      const amountMatches = Math.round(data.amount * 100) === Math.round(payment.amount * 100);
      if (!amountMatches) {
        // المبلغ اللي أكدته البوابة مختلف عن اللي بنتوقعه: ما منصدق
        await settle('failed', 'amount_mismatch');
        await markOrderFailed();
      } else if (order.status === 'cancelled' || order.paymentStatus === 'paid') {
        await settle('refunded', null);
      } else {
        await settle('succeeded', null);
        await client.query(`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [orderId]);
      }
    } else {
      await settle('failed', data.failureReason ?? 'card_declined');
      await markOrderFailed();
    }
    return { received: true };
  });
}