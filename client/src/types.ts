export type Status = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export const STATUSES: Status[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export interface Order {
  id: number;
  customerName: string;
  product: string;
  total: number;
  status: Status;
  createdAt: string;
}