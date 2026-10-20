import { useCallback, useRef, useState } from 'react';
import type { Payment } from '../types';
import type { CardFields } from './card';
import { payForOrder } from './payments';
import type { PaymentOutcome, PaymentStep } from './payments';

export type PaymentUiState =
  | { phase: 'idle' }
  | { phase: 'working'; step: PaymentStep }
  | { phase: 'succeeded'; payment: Payment }
  | { phase: 'failed'; message: string }
  | { phase: 'error'; message: string }
  | { phase: 'pending'; message: string };

export function usePayment() {
  const [state, setState] = useState<PaymentUiState>({ phase: 'idle' });
  // نفس المفتاح بنستخدمه لحد ما تنحسم النتيجة (نجاح أو فشل). بعدها كل محاولة بمفتاح جديد
  const keyRef = useRef<string | null>(null);

  const pay = useCallback(async (orderId: number, card: CardFields): Promise<PaymentOutcome | null> => {
    keyRef.current ??= crypto.randomUUID();
    setState({ phase: 'working', step: 'creating' });
    try {
      const outcome = await payForOrder(orderId, card, keyRef.current, (step) => setState({ phase: 'working', step }));
      if (outcome.kind === 'succeeded') {
        keyRef.current = null;
        setState({ phase: 'succeeded', payment: outcome.payment });
      } else if (outcome.kind === 'failed') {
        keyRef.current = null;
        setState({ phase: 'failed', message: outcome.message });
      } else if (outcome.kind === 'invalid') {
        setState({ phase: 'error', message: outcome.message });
      } else {
        setState({ phase: 'pending', message: outcome.message });
      }
      return outcome;
    } catch (err) {
      // مشكلة اتصال: بنحتفظ بالمفتاح، فالإعادة ما بتعمل دفعة ثانية
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Something went wrong' });
      return null;
    }
  }, []);

  return { state, pay };
}