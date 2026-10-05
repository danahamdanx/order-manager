export const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export type Role = 'admin' | 'staff' | 'customer';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  icon: string;
  color: string;
}

export interface OrderItem {
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface Order {
  id: number;
  userId: number;
  customerName: string;
  customerEmail: string;
  status: Status;
  total: number;
  shipping: number;
  address: string;
  createdAt: string;
  items: OrderItem[];
}

export interface Stats {
  totalOrders: number;
  revenue: number;
  customers: number;
  byStatus: Record<Status, number>;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  ordersCount: number;
  totalSpent: number;
}

export interface CustomerDetail {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  orders: Order[];
}