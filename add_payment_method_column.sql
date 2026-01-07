-- Script para agregar columna payment_method a order_guests

-- Agregar columna payment_method
ALTER TABLE order_guests
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- La columna puede ser NULL para comensales que aún no han seleccionado/pagado
-- Los valores posibles son: 'mercadopago', 'transferencia', 'efectivo'

