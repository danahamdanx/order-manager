export interface PaymentGateway {
  // بتنشئ نية دفع عند البوابة وبترجع مرجعها
  createIntent(input: { amount: number; orderId: number }): Promise<{ ref: string }>;
  // السر اللي بيعطيه السيرفر للمتصفح عشان يأكد الدفع مباشرة مع البوابة
  getClientSecret(ref: string, amount: number): Promise<string>;
}

export interface GatewayEvent {
  id: string;
  type: 'payment.succeeded' | 'payment.failed';
  created: number;
  data: {
    ref: string;
    amount: number;
    cardBrand: string | null;
    cardLast4: string | null;
    failureReason: string | null;
  };
}