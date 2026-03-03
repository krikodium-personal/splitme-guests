-- Script para arreglar las políticas RLS de la tabla orders
-- Ejecutar este script en el SQL Editor de Supabase
-- El error "new row violates row-level security policy" ocurre porque no hay política que permita INSERT

-- Habilitar RLS si no está habilitado
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes que puedan estar bloqueando el acceso
DROP POLICY IF EXISTS "orders_select_policy" ON orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
DROP POLICY IF EXISTS "orders_update_policy" ON orders;
DROP POLICY IF EXISTS "Allow public read access" ON orders;
DROP POLICY IF EXISTS "Allow authenticated read access" ON orders;
DROP POLICY IF EXISTS "Allow public insert access" ON orders;
DROP POLICY IF EXISTS "Allow public update access" ON orders;

-- Política para SELECT (lectura)
CREATE POLICY "Allow read access to orders"
ON orders
FOR SELECT
USING (true);

-- Política para INSERT (crear nuevas órdenes) - REQUERIDO para que comensales creen órdenes
CREATE POLICY "Allow insert access to orders"
ON orders
FOR INSERT
WITH CHECK (true);

-- Política para UPDATE (actualizar órdenes existentes)
CREATE POLICY "Allow update access to orders"
ON orders
FOR UPDATE
USING (true)
WITH CHECK (true);
