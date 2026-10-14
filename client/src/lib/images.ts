import { API_URL } from '../api';

export const imageUrl = (productId: number, version: number) => `${API_URL}/products/${productId}/image?v=${version}`;