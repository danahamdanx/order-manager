import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 300;

const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex');

// مقارنة بوقت ثابت، عشان ما حدا يخمّن التوقيع من سرعة الرد
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// نفس المفتاح بس مع بادئة مختلفة لكل استخدام (wh. و cs.)، فتوقيع ما بينفع مكان توقيع ثاني
export function signWebhook(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmac(secret, `wh.${timestamp}.${rawBody}`)}`;
}

export function verifyWebhook(
  secret: string,
  rawBody: string,
  header: string | undefined,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((part): [string, string] => {
      const [key, ...value] = part.split('=');
      return [key, value.join('=')];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isInteger(timestamp) || typeof signature !== 'string') return false;
  // رسالة قديمة بنرفضها حتى لو توقيعها صح (حماية من إعادة الإرسال replay)
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) return false;
  return safeEqual(signature, hmac(secret, `wh.${timestamp}.${rawBody}`));
}

// الـ clientSecret بيحمل المرجع والمبلغ ووقت الانتهاء، وموقّع. فالبوابة ما بتحتاج تخزّن شي
export function createClientSecret(secret: string, data: { ref: string; amount: number }, ttlSeconds = 1800): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString(
    'base64url',
  );
  return `${payload}.${hmac(secret, `cs.${payload}`)}`;
}

export function readClientSecret(secret: string, value: unknown): { ref: string; amount: number } | null {
  if (typeof value !== 'string') return null;
  const [payload, signature, ...rest] = value.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  if (!safeEqual(signature, hmac(secret, `cs.${payload}`))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.ref !== 'string' || typeof data.amount !== 'number' || typeof data.exp !== 'number') return null;
    if (data.exp < Date.now() / 1000) return null;
    return { ref: data.ref, amount: data.amount };
  } catch {
    return null;
  }
}