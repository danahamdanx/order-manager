// أعمدة المنتج اللي بيعرضها المتجر. مشتركة بين قائمة المنتجات والتوصيات
export const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.description, c.name AS category, p.price, p.stock, p.icon, p.color, p.active,
         p.created_at AS "createdAt",
         (SELECT EXTRACT(EPOCH FROM i.updated_at)::bigint FROM product_images i
           WHERE i.product_id = p.id) AS "imageVersion"
  FROM products p JOIN categories c ON c.id = p.category_id`;