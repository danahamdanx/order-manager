import { queryOne } from './db.js';

// "زيارة" وحدة = 30 دقيقة. المشاهدات المتكررة خلالها ما بتنحسب
export const VIEW_WINDOW_MINUTES = 30;

// بترجع true إذا انحسبت مشاهدة جديدة.
// الجملة ذرية: أول مشاهدة بتنعمل INSERT، وبعدها UPDATE بس إذا مرّت فترة الزيارة.
// إذا الشرط WHERE ما انطبق ما بيرجع شي، يعني ما انحسبت
export async function recordView(userId: number, productId: number): Promise<boolean> {
  const row = await queryOne<{ view_count: number }>(
    `INSERT INTO product_views (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO UPDATE
       SET view_count = product_views.view_count + 1, last_viewed_at = now()
       WHERE product_views.last_viewed_at < now() - make_interval(mins => $3)
     RETURNING view_count`,
    [userId, productId, VIEW_WINDOW_MINUTES],
  );
  return row !== undefined;
}