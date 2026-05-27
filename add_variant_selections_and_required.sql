-- Migración: variant_selections en order_items y required en variant_groups
-- Ejecutar en el SQL Editor de Supabase

-- 1. Agregar columna required a variant_groups (default false para retrocompatibilidad)
ALTER TABLE variant_groups 
ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false;

-- 2. Agregar columna variant_selections a order_items (array de UUIDs de variant_options)
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS variant_selections jsonb DEFAULT '[]'::jsonb;

-- Comentarios para documentación
COMMENT ON COLUMN variant_groups.required IS 'Si true, el usuario debe seleccionar una opción antes de agregar al carrito (ej. Tamaño)';
COMMENT ON COLUMN order_items.variant_selections IS 'Array de IDs de variant_options seleccionados, ej: ["uuid1","uuid2"]';
