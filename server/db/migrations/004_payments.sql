ALTER TABLE orders
ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    payment_status IN (
        'unpaid',
        'paid',
        'failed',
        'refunded'
    )
);

CREATE TABLE payments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL CHECK (
        status IN (
            'requires_payment',
            'succeeded',
            'failed',
            'refunded'
        )
    ),
    method TEXT NOT NULL CHECK (method IN ('card', 'legacy')),
    card_brand TEXT,
    card_last4 TEXT CHECK (card_last4 ~ '^[0-9]{4}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order ON payments (order_id);

-- الطلبات اللي تقدمت عن pending قبل نظام الدفع بنعتبرها مدفوعة (method = legacy)
INSERT INTO
    payments (
        order_id,
        amount,
        status,
        method
    )
SELECT id, total, 'succeeded', 'legacy'
FROM orders
WHERE
    status IN (
        'processing',
        'shipped',
        'delivered'
    );

UPDATE orders
SET
    payment_status = 'paid'
WHERE
    status IN (
        'processing',
        'shipped',
        'delivered'
    );