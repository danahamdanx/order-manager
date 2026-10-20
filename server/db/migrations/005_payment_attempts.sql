ALTER TABLE payments ADD COLUMN gateway_ref TEXT UNIQUE;

ALTER TABLE payments ADD COLUMN idempotency_key TEXT;

ALTER TABLE payments ADD COLUMN failure_reason TEXT;

ALTER TABLE payments
ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- نفس المفتاح على نفس الطلب = نفس الدفعة
ALTER TABLE payments
ADD CONSTRAINT payments_order_idempotency_unique UNIQUE (order_id, idempotency_key);

-- دفعة مفتوحة وحدة بس لكل طلب: حماية من الدفع المزدوج على مستوى القاعدة
CREATE UNIQUE INDEX one_open_payment_per_order ON payments (order_id)
WHERE
    status = 'requires_payment';