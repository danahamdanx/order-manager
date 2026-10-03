import type { Order } from './types';

const API_URL = 'http://localhost:4000/api';

export class ApiError extends Error {
  details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.details = details;
  }
}

export async function fetchOrders(
  params: { status: string; search: string },
  signal?: AbortSignal,
): Promise<Order[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);

  const res = await fetch(`${API_URL}/orders?${query}`, { signal });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export type OrderUpdate = Partial<Pick<Order, 'customerName' | 'product' | 'total' | 'status'>>;

export async function updateOrder(id: number, data: OrderUpdate): Promise<Order> {
  const res = await fetch(`${API_URL}/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, body?.details ?? []);
  }
  return body;
}