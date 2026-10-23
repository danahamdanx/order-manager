CREATE TABLE discount_codes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  type TEXT NOT NULL CHECK (type IN ('percent', 'amount')),
  value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
  expires_at TIMESTAMPTZ,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  times_used INTEGER NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (type <> 'percent' OR value <= 100)
);
CREATE UNIQUE INDEX discount_codes_code_key ON discount_codes(code);

ALTER TABLE orders ADD COLUMN subtotal NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN discount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0);
ALTER TABLE orders ADD COLUMN discount_code_id INTEGER REFERENCES discount_codes(id);
ALTER TABLE orders ADD COLUMN discount_code TEXT;

-- الطلبات القديمة: المجموع الفرعي = المجموع - الشحن
UPDATE orders SET subtotal = total - shipping;
ALTER TABLE orders ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_totals_consistent CHECK (total = subtotal - discount + shipping);

-- وقت الدفع ووقت الاسترداد (للإيصال)
ALTER TABLE payments ADD COLUMN paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN refunded_at TIMESTAMPTZ;
UPDATE payments SET paid_at = created_at WHERE status IN ('succeeded', 'refunded');
UPDATE payments SET refunded_at = updated_at WHERE status = 'refunded';