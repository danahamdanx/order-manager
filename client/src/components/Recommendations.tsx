import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/useAuth';
import type { RecommendationsResponse } from '../types';
import { ProductCard } from './ProductCard';

interface Props {
  title: string; // العنوان لما الاقتراح مخصص للزبون
  genericTitle?: string; // العنوان لما القائمة عامة (زائر أو زبون جديد)
  productId?: number;
  limit?: number;
}

// الاقتراحات اختيارية: إذا فشل الطلب أو كانت القائمة فاضية، ما بنعرض شي ولا بنعطّل الصفحة
export function Recommendations({ title, genericTitle, productId, limit = 4 }: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [data, setData] = useState<RecommendationsResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: String(limit) });
    if (productId !== undefined) query.set('productId', String(productId));

    api
      .get<RecommendationsResponse>(`/recommendations?${query}`, controller.signal)
      .then(setData)
      .catch(() => {
        // بنتجاهل
      });
    return () => controller.abort();
  }, [productId, limit, userId]);

  if (!data || data.items.length === 0) return null;
  const heading = data.personalized ? title : (genericTitle ?? title);

  return (
    <section className="reco" aria-label={heading}>
      <h2>{heading}</h2>
      <div className="grid">
        {data.items.map((item) => (
          <ProductCard key={item.id} product={item} reason={item.reason.label} />
        ))}
      </div>
    </section>
  );
}