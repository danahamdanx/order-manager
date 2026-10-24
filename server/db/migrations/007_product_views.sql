CREATE TABLE product_views (
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count > 0),
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

-- أحدث المنتجات اللي شافها زبون معين (الاستعلام الأساسي للتوصيات)
CREATE INDEX idx_product_views_user_recent ON product_views (user_id, last_viewed_at DESC);
-- للحذف المتسلسل عند حذف منتج، ولإحصائيات المنتج
CREATE INDEX idx_product_views_product ON product_views (product_id);