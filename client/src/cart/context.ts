import { createContext } from 'react';
import type { Product } from '../types';

export const SHIPPING = 5;

export interface CartLine {
  product: Product;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
}

export const CartContext = createContext<CartState | null>(null);