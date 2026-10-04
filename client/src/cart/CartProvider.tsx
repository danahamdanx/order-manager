import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Product } from '../types';
import { CartContext } from './context';
import type { CartLine, CartState } from './context';

const KEY = 'orderdesk_cart';

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

// ما بنسمح بكمية أكبر من المخزون أو من 20 (نفس حد السيرفر)
const maxQty = (p: Product) => Math.max(0, Math.min(p.stock, 20));

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadCart);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines]);

  const add = useCallback((product: Product, quantity = 1) => {
    setLines((prev) => {
      const cap = maxQty(product);
      if (cap === 0) return prev;
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { product, quantity: Math.min(cap, l.quantity + quantity) } : l,
        );
      }
      return [...prev, { product, quantity: Math.min(cap, quantity) }];
    });
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product.id === productId ? { ...l, quantity: Math.max(1, Math.min(maxQty(l.product), quantity)) } : l,
      ),
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartState>(() => {
    const count = lines.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = Math.round(lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0) * 100) / 100;
    return { lines, count, subtotal, add, setQuantity, remove, clear };
  }, [lines, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}