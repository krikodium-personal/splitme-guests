-- Cargos/deudas por comensal generados al confirmar una division.
-- payments es el ledger formal; esta tabla representa lo que falta pagar.
CREATE TABLE IF NOT EXISTS order_guest_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES order_guests(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  split_round_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT order_guest_charges_status_check CHECK (status IN ('pending', 'paid', 'cancelled'))
);

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES order_guests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS charge_id UUID REFERENCES order_guest_charges(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_order_guest_charges_order_id ON order_guest_charges(order_id);
CREATE INDEX IF NOT EXISTS idx_order_guest_charges_guest_id ON order_guest_charges(guest_id);
CREATE INDEX IF NOT EXISTS idx_order_guest_charges_status ON order_guest_charges(status);
CREATE INDEX IF NOT EXISTS idx_order_guest_charges_round ON order_guest_charges(split_round_id);
CREATE INDEX IF NOT EXISTS idx_payments_guest_id ON payments(guest_id);
CREATE INDEX IF NOT EXISTS idx_payments_charge_id ON payments(charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_guest ON payments(order_id, guest_id);

-- Backfill de pagos historicos que estaban asociados por order_guests.payment_id.
UPDATE payments p
SET guest_id = og.id
FROM order_guests og
WHERE og.payment_id = p.id
  AND p.guest_id IS NULL;

-- Backfill de cargos legacy todavia pendientes desde order_guests.individual_amount.
INSERT INTO order_guest_charges (
  order_id,
  guest_id,
  amount,
  status,
  payment_method,
  payment_id,
  paid_at
)
SELECT
  og.order_id,
  og.id,
  og.individual_amount,
  CASE WHEN og.paid IS TRUE THEN 'paid' ELSE 'pending' END,
  og.payment_method,
  og.payment_id,
  CASE WHEN og.paid IS TRUE THEN COALESCE(p.created_at, NOW()) ELSE NULL END
FROM order_guests og
LEFT JOIN payments p ON p.id = og.payment_id
WHERE og.individual_amount IS NOT NULL
  AND og.individual_amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM order_guest_charges c
    WHERE c.order_id = og.order_id
      AND c.guest_id = og.id
      AND c.amount = og.individual_amount
      AND COALESCE(c.payment_id::TEXT, '') = COALESCE(og.payment_id::TEXT, '')
  );

UPDATE order_guest_charges c
SET payment_id = p.id,
    status = 'paid',
    paid_at = COALESCE(c.paid_at, p.created_at)
FROM payments p
WHERE p.charge_id = c.id
  AND c.payment_id IS NULL;
