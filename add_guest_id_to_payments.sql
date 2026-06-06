-- Agrega trazabilidad por comensal a cada pago registrado.
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES order_guests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_payments_guest_id ON payments(guest_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_guest ON payments(order_id, guest_id);

UPDATE payments p
SET guest_id = og.id
FROM order_guests og
WHERE og.payment_id = p.id
  AND p.guest_id IS NULL;
