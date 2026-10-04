import type { Role } from '../types';

export const homeFor = (role: Role) => (role === 'customer' ? '/shop' : '/admin');