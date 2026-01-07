-- Script para agregar tracking de pagos en order_guests y crear tabla payments

-- 1. Crear tabla payments primero (necesaria para la foreign key)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  mp_transaction_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Agregar columnas a order_guests (después de crear payments)
ALTER TABLE order_guests
ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;

-- 3. Actualizar registros existentes para que tengan paid=false
UPDATE order_guests
SET paid = false
WHERE paid IS NULL;

-- 4. Crear índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_mp_transaction_id ON payments(mp_transaction_id);
CREATE INDEX IF NOT EXISTS idx_order_guests_payment_id ON order_guests(payment_id);
CREATE INDEX IF NOT EXISTS idx_order_guests_paid ON order_guests(paid);

-- 5. Crear trigger para actualizar updated_at en payments
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_payments_updated_at 
  BEFORE UPDATE ON payments 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

