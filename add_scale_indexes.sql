-- Índices para consultas hot-path de splitme-guests (App.tsx + pagos).
-- Idempotente: IF NOT EXISTS. Verificar pg_indexes en prod antes de re-ejecutar.

-- 1. Carrito (consulta más frecuente)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

-- 2. Batches por orden + ordenamiento
CREATE INDEX IF NOT EXISTS idx_order_batches_order_id_batch
  ON public.order_batches (order_id, batch_number);

-- 3. Comensales por orden + ordenamiento
CREATE INDEX IF NOT EXISTS idx_order_guests_order_id_position
  ON public.order_guests (order_id, position);

-- 4. Orden activa de una mesa
CREATE INDEX IF NOT EXISTS idx_orders_table_id_created_at
  ON public.orders (table_id, created_at DESC);

-- 5. Resolver mesa en bootstrap QR
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id_table_number
  ON public.tables (restaurant_id, table_number);

-- 6–8. Carga de menú por restaurante
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id_sort
  ON public.menu_items (restaurant_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_categories_restaurant_id_sort
  ON public.categories (restaurant_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_menu_section_headers_restaurant_sort
  ON public.menu_section_headers (restaurant_id, sort_order);

-- 9. Entrada por access_code (no-op si ya existe UNIQUE en access_code)
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_access_code
  ON public.restaurants (access_code);

-- 10. Contar ítems por batch (solo filas con batch asignado)
CREATE INDEX IF NOT EXISTS idx_order_items_batch_id
  ON public.order_items (batch_id)
  WHERE batch_id IS NOT NULL;

COMMENT ON INDEX idx_order_items_order_id IS
  'Hot path: fetchOrderItemsFromDB + realtime cart-sync en App.tsx';
COMMENT ON INDEX idx_order_batches_order_id_batch IS
  'Hot path: order_batches por order_id con ORDER BY batch_number';
COMMENT ON INDEX idx_order_guests_order_id_position IS
  'Hot path: order_guests por order_id con ORDER BY position';
