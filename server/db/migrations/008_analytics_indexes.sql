CREATE INDEX idx_orders_created_at ON orders (created_at);

CREATE INDEX idx_users_customer_created ON users (created_at)
WHERE
    role = 'customer';