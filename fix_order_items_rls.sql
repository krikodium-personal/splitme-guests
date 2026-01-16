-- Script para arreglar las políticas RLS de order_items
-- Ejecutar este script en el SQL Editor de Supabase

-- Primero, verificar si RLS está habilitado
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes que puedan estar bloqueando el acceso
DROP POLICY IF EXISTS "order_items_select_policy" ON order_items;
DROP POLICY IF EXISTS "order_items_insert_policy" ON order_items;
DROP POLICY IF EXISTS "order_items_update_policy" ON order_items;
DROP POLICY IF EXISTS "Allow public read access" ON order_items;
DROP POLICY IF EXISTS "Allow authenticated read access" ON order_items;
DROP POLICY IF EXISTS "Allow public update access" ON order_items;

-- Crear política para permitir SELECT (lectura) basada en order_id
-- Esto permite que cualquier usuario (incluyendo anónimos) pueda leer los items de una orden
CREATE POLICY "Allow read access to order items"
ON order_items
FOR SELECT
USING (true); -- Permitir lectura de todos los registros

-- Política para INSERT (crear nuevos items)
CREATE POLICY "Allow insert access to order items"
ON order_items
FOR INSERT
WITH CHECK (true); -- Permitir inserción de nuevos registros

-- Política para UPDATE (actualizar items existentes)
-- IMPORTANTE: Esta política permite actualizar cualquier campo, incluyendo extras y removed_ingredients
CREATE POLICY "Allow update access to order items"
ON order_items
FOR UPDATE
USING (true) -- Permitir actualización de todos los registros
WITH CHECK (true);

-- Política para DELETE (eliminar items)
CREATE POLICY "Allow delete access to order items"
ON order_items
FOR DELETE
USING (true); -- Permitir eliminación de registros

-- Si quieres una política más restrictiva basada en la orden, descomenta y ajusta:
-- CREATE POLICY "Allow update access to order items by order"
-- ON order_items
-- FOR UPDATE
-- USING (
--   EXISTS (
--     SELECT 1 FROM orders
--     WHERE orders.id = order_items.order_id
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM orders
--     WHERE orders.id = order_items.order_id
--   )
-- );
