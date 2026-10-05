import type { OrderItem } from '../types';

export const money = (n: number) => `$${n.toFixed(2)}`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

const AVATARS = [
  { bg: '#CECBF6', fg: '#3C3489' },
  { bg: '#B5D4F4', fg: '#0C447C' },
  { bg: '#F5C4B3', fg: '#712B13' },
  { bg: '#FAC775', fg: '#633806' },
  { bg: '#C0DD97', fg: '#27500A' },
];
export const avatarColors = (id: number) => AVATARS[id % AVATARS.length];

export const itemsSummary = (items: OrderItem[]) =>
  items.length === 0 ? '' : `${items[0].productName}${items.length > 1 ? ` +${items.length - 1} more` : ''}`;