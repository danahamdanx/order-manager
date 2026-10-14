CREATE TABLE categories (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- ننقل التصنيفات الموجودة، وبنربط كل منتج فيها، وبعدين بنشيل العمود القديم
INSERT INTO categories (name) SELECT DISTINCT category FROM products;

ALTER TABLE products
ADD COLUMN category_id INTEGER REFERENCES categories (id);

UPDATE products p
SET
    category_id = c.id
FROM categories c
WHERE
    c.name = p.category;

ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE products DROP COLUMN category;

ALTER TABLE products
ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX idx_products_category ON products (category_id);

CREATE TABLE product_images (
    product_id INTEGER PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (
        content_type IN (
            'image/jpeg',
            'image/png',
            'image/webp'
        )
    ),
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);