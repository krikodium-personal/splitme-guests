-- Script para arreglar las políticas RLS de order_batches
-- Ejecutar en el SQL Editor de Supabase
-- Necesario para crear batches al crear una nueva orden

ALTER TABLE order_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_batches_select_policy" ON order_batches;
DROP POLICY IF EXISTS "order_batches_insert_policy" ON order_batches;
DROP POLICY IF EXISTS "order_batches_update_policy" ON order_batches;
DROP POLICY IF EXISTS "Allow public read access" ON order_batches;
DROP POLICY IF EXISTS "Allow public insert access" ON order_batches;
DROP POLICY IF EXISTS "Allow public update access" ON order_batches;

CREATE POLICY "Allow read access to order batches"
ON order_batches FOR SELECT USING (true);

CREATE POLICY "Allow insert access to order batches"
ON order_batches FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update access to order batches"
ON order_batches FOR UPDATE USING (true) WITH CHECK (true);
