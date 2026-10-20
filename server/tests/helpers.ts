import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app';

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

const yy = String((new Date().getFullYear() + 2) % 100).padStart(2, '0');
export const VALID_EXPIRY = `12/${yy}`;

export const startPayment = (token: string, orderId: unknown, key: string = randomUUID()) =>
  request(app).post('/api/payments').set(auth(token)).set('Idempotency-Key', key).send({ orderId });

export const confirm = (clientSecret: string, number = '4242424242424242', expiry = VALID_EXPIRY, cvc = '123') =>
  request(app).post('/mock-gateway/v1/confirm').send({ clientSecret, card: { number, expiry, cvc } });

// الفلو الكامل مثل الواجهة: دفعة جديدة، تأكيد مع البوابة، وبعدين قراءة النتيجة من السيرفر
export async function payOrder(token: string, orderId: number, number = '4242424242424242') {
  const started = await startPayment(token, orderId);
  const confirmed = await confirm(started.body.clientSecret, number);
  const final = await request(app).get(`/api/payments/${started.body.id}`).set(auth(token));
  return { started, confirmed, payment: final.body };
}