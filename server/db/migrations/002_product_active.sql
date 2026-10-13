ALTER TABLE products ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX idx_products_active ON products (active);