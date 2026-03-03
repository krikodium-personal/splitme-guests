-- Script completo para arreglar RLS y permitir que comensales creen órdenes
-- Ejecutar en el SQL Editor de Supabase (Dashboard > SQL Editor > New query)
-- Resuelve: "new row violates row-level security policy for table orders"
-- Usa nombres únicos (guests_*) para evitar conflictos con políticas existentes

-- ========== ORDERS ==========
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_anon_select" ON orders;
DROP POLICY IF EXISTS "orders_anon_insert" ON orders;
DROP POLICY IF EXISTS "orders_anon_update" ON orders;

CREATE POLICY "orders_anon_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_anon_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_anon_update" ON orders FOR UPDATE USING (true) WITH CHECK (true);

-- ========== ORDER_GUESTS ==========
ALTER TABLE order_guests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_guests_anon_select" ON order_guests;
DROP POLICY IF EXISTS "order_guests_anon_insert" ON order_guests;
DROP POLICY IF EXISTS "order_guests_anon_update" ON order_guests;

CREATE POLICY "order_guests_anon_select" ON order_guests FOR SELECT USING (true);
CREATE POLICY "order_guests_anon_insert" ON order_guests FOR INSERT WITH CHECK (true);
CREATE POLICY "order_guests_anon_update" ON order_guests FOR UPDATE USING (true) WITH CHECK (true);

-- ========== ORDER_BATCHES ==========
ALTER TABLE order_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_batches_anon_select" ON order_batches;
DROP POLICY IF EXISTS "order_batches_anon_insert" ON order_batches;
DROP POLICY IF EXISTS "order_batches_anon_update" ON order_batches;

CREATE POLICY "order_batches_anon_select" ON order_batches FOR SELECT USING (true);
CREATE POLICY "order_batches_anon_insert" ON order_batches FOR INSERT WITH CHECK (true);
CREATE POLICY "order_batches_anon_update" ON order_batches FOR UPDATE USING (true) WITH CHECK (true);

-- ========== TABLES (mesas) ==========
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tables_anon_select" ON tables;
DROP POLICY IF EXISTS "tables_anon_update" ON tables;

CREATE POLICY "tables_anon_select" ON tables FOR SELECT USING (true);
CREATE POLICY "tables_anon_update" ON tables FOR UPDATE USING (true) WITH CHECK (true);
