import { useEffect } from 'react';
import { api } from '../api';

const DELAY_MS = 2000;
const WINDOW_MS = 30 * 60 * 1000; // نفس فترة الزيارة عند السيرفر

// ذاكرة التاب: بتوفر طلبات إذا حدّثتي الصفحة. (السيرفر هو اللي بيقرر فعليًا)
function alreadySent(productId: number): boolean {
  try {
    const at = Number(sessionStorage.getItem(`viewed:${productId}`));
    return Number.isFinite(at) && at > 0 && Date.now() - at < WINDOW_MS;
  } catch {
    return false; // التخزين ممكن يكون ممنوع
  }
}

function remember(productId: number) {
  try {
    sessionStorage.setItem(`viewed:${productId}`, String(Date.now()));
  } catch {
    // مش مشكلة
  }
}

// بتسجل مشاهدة المنتج بعد ما يقعد الزبون ثانيتين بالصفحة (اللي بيطلع فورًا ما بينحسب).
// فشل التسجيل ما بيأثر على الصفحة أبدًا
export function useTrackView(productId: number | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || productId === undefined || alreadySent(productId)) return;

    const timer = setTimeout(() => {
      remember(productId);
      api.post(`/products/${productId}/view`).catch(() => {
        // إحصائيات بس
      });
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [productId, enabled]);
}