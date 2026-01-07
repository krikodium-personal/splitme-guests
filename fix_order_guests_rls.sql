-- Script para arreglar las políticas RLS de order_guests
-- Ejecutar este script en el SQL Editor de Supabase

-- Primero, verificar si RLS está habilitado
ALTER TABLE order_guests ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes que puedan estar bloqueando el acceso
DROP POLICY IF EXISTS "order_guests_select_policy" ON order_guests;
DROP POLICY IF EXISTS "order_guests_insert_policy" ON order_guests;
DROP POLICY IF EXISTS "order_guests_update_policy" ON order_guests;
DROP POLICY IF EXISTS "Allow public read access" ON order_guests;
DROP POLICY IF EXISTS "Allow authenticated read access" ON order_guests;

-- Crear política para permitir SELECT (lectura) basada en order_id
-- Esto permite que cualquier usuario (incluyendo anónimos) pueda leer los guests de una orden
CREATE POLICY "Allow read access to order guests"
ON order_guests
FOR SELECT
USING (true); -- Permitir lectura de todos los registros

-- Política para INSERT (crear nuevos guests)
CREATE POLICY "Allow insert access to order guests"
ON order_guests
FOR INSERT
WITH CHECK (true); -- Permitir inserción de nuevos registros

-- Política para UPDATE (actualizar guests existentes)
CREATE POLICY "Allow update access to order guests"
ON order_guests
FOR UPDATE
USING (true) -- Permitir actualización de todos los registros
WITH CHECK (true);

-- Si quieres una política más restrictiva basada en la orden, descomenta y ajusta:
-- CREATE POLICY "Allow read access to order guests by order"
-- ON order_guests
-- FOR SELECT
-- USING (
--   EXISTS (
--     SELECT 1 FROM orders
--     WHERE orders.id = order_guests.order_id
--   )
-- );

