export const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export type Role = 'admin' | 'staff' | 'customer';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';

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
  imageVersion: number | null;
  createdAt: string;
}

export interface OrderItem {
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  icon: string;
  color: string;
  imageVersion: number | null;
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
  paymentStatus: PaymentStatus;
  cardBrand: string | null;
  cardLast4: string | null;
  paymentFailure: string | null;
  subtotal: number;
  discount: number;
  discountCode: string | null;
  paidAt: string | null;
  refundedAt: string | null;
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

export const PRODUCT_COLORS = ['purple', 'blue', 'amber', 'teal', 'coral', 'pink'] as const;
export const PRODUCT_ICONS = [
  'package',
  'keyboard',
  'mouse',
  'usb',
  'device-laptop',
  'device-desktop',
  'camera',
  'headphones',
  'bulb',
  'printer',
  'router',
  'microphone',
  'device-mobile',
  'device-watch',
  'plug',
] as const;

export interface AdminProduct extends Product {
  active: boolean;
}

export type Imageable = Pick<Product, 'id' | 'name' | 'icon' | 'color' | 'imageVersion'>;

export interface Category {
  name: string;
  count: number;
}

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A to Z' },
] as const;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface Payment {
  id: number;
  orderId: number;
  amount: number;
  status: 'requires_payment' | 'succeeded' | 'failed' | 'refunded';
  failureReason: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  createdAt: string;
  clientSecret?: string;
}

export interface Quote {
  items: { productId: number; name: string; unitPrice: number; quantity: number }[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  code: string | null;
  codeError: string | null;
}

export interface DiscountCode {
  id: number;
  code: string;
  type: 'percent' | 'amount';
  value: number;
  expiresAt: string | null;
  usageLimit: number | null;
  timesUsed: number;
  active: boolean;
  status: 'active' | 'disabled' | 'expired' | 'exhausted';
  createdAt: string;
}

export interface AdminProduct extends Product {
  active: boolean;
  views?: number;
}

export interface Recommendation extends Product {
  reason: { type: string; label: string };
}

export interface RecommendationsResponse {
  items: Recommendation[];
  personalized: boolean;
}