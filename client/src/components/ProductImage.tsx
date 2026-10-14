import { useState } from 'react';
import { imageUrl } from '../lib/images';
import type { Imageable } from '../types';
import { ProductTile } from './ProductTile';

interface Props {
  product: Imageable;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

// الصورة إذا موجودة، وإلا الأيقونة الملونة (وكمان إذا فشل تحميل الصورة)
export function ProductImage({ product, size = 'md' }: Props) {
  const url = product.imageVersion ? imageUrl(product.id, product.imageVersion) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) return <ProductTile product={product} size={size} />;
  return (
    <img
      className={`pimg pimg-${size}`}
      src={url}
      alt={product.name}
      loading="lazy"
      onError={() => setFailedUrl(url)}
    />
  );
}