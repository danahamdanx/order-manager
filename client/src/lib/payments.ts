import { api, API_URL, ApiError } from '../api';
import type { Payment } from '../types';
import { digitsOnly } from './card';
import type { CardFields } from './card';

// البوابة خدمة منفصلة: بالإنتاج بتكون على دومين ثاني، وبنحدده من هون
export const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? `${API_URL.replace(/\/api\/?$/, '')}/mock-gateway/v1`;

export type PaymentStep = 'creating' | 'confirming' | 'verifying';

export const STEP_LABELS: Record<PaymentStep, string> = {
  creating: 'Preparing your payment…',
  confirming: 'Contacting your bank…',
  verifying: 'Confirming your payment…',
};

const FAILURE_MESSAGES: Record<string, string> = {
  card_declined: 'Your card was declined.',
  insufficient_funds: 'Your card has insufficient funds.',
  incorrect_cvc: 'The security code is incorrect.',
  processing_error: 'A processing error occurred. Please try again.',
  not_a_test_card: 'This is a demo store. Use a test card such as 4242 4242 4242 4242.',
  amount_mismatch: 'The payment amount did not match the order. Please try again.',
  order_cancelled: 'The order was cancelled.',
};

export const failureMessage = (reason: string | null) =>
  (reason && FAILURE_MESSAGES[reason]) || 'The payment could not be completed.';

export type PaymentOutcome =
  | { kind: 'succeeded'; payment: Payment }
  | { kind: 'failed'; payment: Payment; message: string }
  | { kind: 'invalid'; message: string } // البوابة رفضت الإدخال، والدفعة لسا مفتوحة
  | { kind: 'pending'; message: string }; // لسا ما وصل التأكيد

export function outcomeNotice(outcome: PaymentOutcome | null): string {
  if (!outcome) return 'The payment could not be started. You can try again below.';
  if (outcome.kind === 'failed' || outcome.kind === 'invalid') return `${outcome.message} You can try again below.`;
  if (outcome.kind === 'pending') return 'We are still waiting for the payment confirmation. Check back in a minute.';
  return '';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// السيرفر هو المرجع: بنسأله لحد ما الدفعة تنحسم (أو ننتظر ~10 ثواني)
async function waitForResult(id: number): Promise<Payment> {
  let latest = await api.get<Payment>(`/payments/${id}`);
  for (let i = 0; i < 12 && latest.status === 'requires_payment'; i++) {
    await sleep(800);
    latest = await api.get<Payment>(`/payments/${id}`);
  }
  return latest;
}

function settle(payment: Payment): PaymentOutcome {
  if (payment.status === 'succeeded') return { kind: 'succeeded', payment };
  if (payment.status === 'failed') return { kind: 'failed', payment, message: failureMessage(payment.failureReason) };
  if (payment.status === 'refunded') return { kind: 'failed', payment, message: 'This payment was refunded.' };
  return { kind: 'pending', message: 'We are still waiting for the payment confirmation.' };
}

export async function payForOrder(
  orderId: number,
  card: CardFields,
  idempotencyKey: string,
  onStep: (step: PaymentStep) => void,
): Promise<PaymentOutcome> {
  onStep('creating');
  const intent = await api.post<Payment>('/payments', { orderId }, { 'Idempotency-Key': idempotencyKey });
  if (intent.status !== 'requires_payment' || !intent.clientSecret) return settle(intent);

  onStep('confirming');
  let res: Response;
  try {
    // رقم البطاقة بيروح للبوابة مباشرة. ولاحظي: بدون الـ token تبعنا (Authorization)
    res = await fetch(`${GATEWAY_URL}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientSecret: intent.clientSecret,
        card: { number: digitsOnly(card.number), expiry: card.expiry, cvc: card.cvc },
      }),
    });
  } catch {
    throw new ApiError('Cannot reach the payment service.', 0);
  }

  if (res.status === 422) {
    const body = await res.json().catch(() => null);
    return { kind: 'invalid', message: body?.message ?? 'Check your card details.' };
  }
  if (!res.ok) throw new ApiError('The payment service is unavailable. Please try again.', res.status);

  onStep('verifying');
  return settle(await waitForResult(intent.id));
}