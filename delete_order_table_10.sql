-- Script para eliminar la orden de la mesa 10 y todos sus datos relacionados
-- Ejecutar este script en el SQL Editor de Supabase
-- 
-- IMPORTANTE: Este script elimina permanentemente todos los datos relacionados con la orden de la mesa 10
-- Asegúrate de hacer un backup antes de ejecutar si es necesario

-- Paso 1: Buscar la orden de la mesa 10
-- Primero verificamos qué orden existe para la mesa 10
DO $$
DECLARE
    table_id_var uuid;
    order_id_var uuid;
    deleted_reviews integer;
    deleted_items integer;
    deleted_batches integer;
    deleted_guests integer;
    deleted_orders integer;
BEGIN
    -- Buscar el table_id de la mesa 10
    SELECT id INTO table_id_var
    FROM tables
    WHERE table_number = '10'
    LIMIT 1;

    IF table_id_var IS NULL THEN
        RAISE NOTICE 'No se encontró la mesa 10';
        RETURN;
    END IF;

    RAISE NOTICE 'Mesa 10 encontrada con ID: %', table_id_var;

    -- Buscar la orden asociada a esta mesa
    SELECT id INTO order_id_var
    FROM orders
    WHERE table_id = table_id_var
    LIMIT 1;

    IF order_id_var IS NULL THEN
        RAISE NOTICE 'No se encontró ninguna orden para la mesa 10';
        RETURN;
    END IF;

    RAISE NOTICE 'Orden encontrada con ID: %', order_id_var;

    -- Paso 2: Eliminar reviews asociadas a la orden
    DELETE FROM reviews WHERE order_id = order_id_var;
    GET DIAGNOSTICS deleted_reviews = ROW_COUNT;
    RAISE NOTICE 'Reviews eliminadas: %', deleted_reviews;

    -- Paso 3: Eliminar order_items asociados a la orden
    DELETE FROM order_items WHERE order_id = order_id_var;
    GET DIAGNOSTICS deleted_items = ROW_COUNT;
    RAISE NOTICE 'Order items eliminados: %', deleted_items;

    -- Paso 4: Eliminar order_batches asociados a la orden
    DELETE FROM order_batches WHERE order_id = order_id_var;
    GET DIAGNOSTICS deleted_batches = ROW_COUNT;
    RAISE NOTICE 'Order batches eliminados: %', deleted_batches;

    -- Paso 5: Eliminar order_guests asociados a la orden
    DELETE FROM order_guests WHERE order_id = order_id_var;
    GET DIAGNOSTICS deleted_guests = ROW_COUNT;
    RAISE NOTICE 'Order guests eliminados: %', deleted_guests;

    -- Paso 6: Finalmente, eliminar la orden
    DELETE FROM orders WHERE id = order_id_var;
    GET DIAGNOSTICS deleted_orders = ROW_COUNT;
    RAISE NOTICE 'Orden eliminada: %', deleted_orders;

    RAISE NOTICE 'Proceso completado exitosamente para la mesa 10';
END $$;

-- Verificación: Confirmar que la orden fue eliminada
SELECT 
    t.table_number,
    o.id as order_id,
    o.status,
    o.created_at
FROM tables t
LEFT JOIN orders o ON o.table_id = t.id
WHERE t.table_number = '10';
