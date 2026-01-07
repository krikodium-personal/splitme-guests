-- Script para agregar la columna individual_amount a la tabla order_guests
-- Ejecuta este script en el SQL Editor de Supabase

ALTER TABLE order_guests
ADD COLUMN individual_amount NUMERIC(10, 2) DEFAULT NULL;

-- La columna individual_amount almacenará el monto individual que cada comensal debe pagar
-- después de que se haya realizado la división de la cuenta.
-- NULL significa que aún no se ha dividido la cuenta para ese comensal.

