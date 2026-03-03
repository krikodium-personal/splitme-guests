-- Script para arreglar las políticas RLS de la tabla tables
-- Ejecutar en el SQL Editor de Supabase
-- Necesario para actualizar status a OCUPADA al crear una orden

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_select_policy" ON tables;
DROP POLICY IF EXISTS "tables_update_policy" ON tables;
DROP POLICY IF EXISTS "Allow public read access" ON tables;
DROP POLICY IF EXISTS "Allow public update access" ON tables;

CREATE POLICY "Allow read access to tables"
ON tables FOR SELECT USING (true);

CREATE POLICY "Allow update access to tables"
ON tables FOR UPDATE USING (true) WITH CHECK (true);
