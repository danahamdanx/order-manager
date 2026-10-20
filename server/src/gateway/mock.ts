import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { GATEWAY_SECRET } from './config.js';
import { createClientSecret, readClientSecret, signWebhook } from './signing.js';
import type { GatewayEvent, PaymentGateway } from './types.js';

// الجزء اللي بيستخدمه سيرفرنا: نفس الأسلوب اللي بتستخدمه أي بوابة (إنشاء نية دفع)
export class MockGateway implements PaymentGateway {
  async createIntent(): Promise<{ ref: string }> {
    return { ref: `pi_${randomBytes(12).toString('hex')}` };
  }

  async getClientSecret(ref: string, amount: number): Promise<string> {
    return createClientSecret(GATEWAY_SECRET, { ref, amount });
  }
}

// ---- من هون وتحت: "الخدمة الخارجية" نفسها ----

// بس هالأرقام بتنقبل. أي رقم ثاني (ممكن يكون بطاقة حقيقية) بيترفض
const TEST_CARDS: Record<string, { brand: string; failure?: string }> = {
  '4242424242424242': { brand: 'visa' },
  '5555555555554444': { brand: 'mastercard' },
  '378282246310005': { brand: 'amex' },
  '4000000000000002': { brand: 'visa', failure: 'card_declined' },
  '4000000000009995': { brand: 'visa', failure: 'insufficient_funds' },
  '4000000000000127': { brand: 'visa', failure: 'incorrect_cvc' },
  '4000000000000119': { brand: 'visa', failure: 'processing_error' },
};

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// أخطاء الإدخال: الدفعة ما بتفشل، المستخدم بيصلح وبيعيد
export function validateCardInput(card: unknown, now = new Date()): { code: string; message: string } | null {
  const c = (card ?? {}) as Record<string, unknown>;
  const digits = typeof c.number === 'string' ? c.number.replace(/\s/g, '') : '';
  if (!/^\d{12,19}$/.test(digits) || !luhnValid(digits)) {
    return { code: 'incorrect_number', message: 'The card number is incorrect.' };
  }

  const match = typeof c.expiry === 'string' ? /^(\d{2})\/(\d{2})$/.exec(c.expiry) : null;
  const month = match ? Number(match[1]) : 0;
  const year = match ? 2000 + Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) return { code: 'invalid_expiry', message: 'The expiry date is invalid.' };
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return { code: 'expired_card', message: 'The card has expired.' };
  }

  if (typeof c.cvc !== 'string' || !/^\d{3,4}$/.test(c.cvc)) {
    return { code: 'invalid_cvc', message: 'The security code is invalid.' };
  }
  return null;
}

export function evaluateCard(digits: string): {
  status: 'succeeded' | 'failed';
  reason: string | null;
  brand: string;
  last4: string | null;
} {
  const known = TEST_CARDS[digits];
  // بطاقة مش تجريبية: ما منخزن عنها شي، ولا حتى آخر 4 أرقام
  if (!known) return { status: 'failed', reason: 'not_a_test_card', brand: 'other', last4: null };
  return {
    status: known.failure ? 'failed' : 'succeeded',
    reason: known.failure ?? null,
    brand: known.brand,
    last4: digits.slice(-4),
  };
}

type Deliver = (rawBody: string, signature: string) => Promise<unknown>;

// الـ deliver بيجي من برّا (بدل ما نستورد payments.ts) عشان ما يصير تداخل بين الملفات
export function createMockGatewayRouter(deliver: Deliver) {
  const router = Router();

  router.post('/confirm', async (req, res) => {
    const { clientSecret, card } = req.body ?? {};

    const intent = readClientSecret(GATEWAY_SECRET, clientSecret);
    if (!intent) {
      return res
        .status(400)
        .json({ error: 'invalid_client_secret', message: 'The payment session is invalid or has expired.' });
    }

    const problem = validateCardInput(card);
    if (problem) return res.status(422).json({ error: problem.code, message: problem.message });

    // تأخير بسيط عشان تشوفي حالات "جاري الدفع" بالواجهة
    const delay = Number(process.env.MOCK_GATEWAY_DELAY_MS ?? 800);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    const result = evaluateCard(String(card.number).replace(/\s/g, ''));
    const event: GatewayEvent = {
      id: `evt_${randomBytes(8).toString('hex')}`,
      type: result.status === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        ref: intent.ref,
        amount: intent.amount,
        cardBrand: result.brand,
        cardLast4: result.last4,
        failureReason: result.reason,
      },
    };

    // البوابة بتبعت النتيجة لسيرفرنا برسالة موقّعة، تمامًا مثل بوابة حقيقية
    const rawBody = JSON.stringify(event);
    await deliver(rawBody, signWebhook(GATEWAY_SECRET, rawBody));

    res.json({ status: result.status });
  });

  return router;
}