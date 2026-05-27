-- Migración: selection en variant_groups y description en variant_options
-- Ejecutar en el SQL Editor de Supabase

-- 1. Agregar columna selection a variant_groups ('individual' | 'multiple')
ALTER TABLE variant_groups 
ADD COLUMN IF NOT EXISTS selection text NOT NULL DEFAULT 'individual' 
CHECK (selection IN ('individual', 'multiple'));

-- 2. Agregar columna description a variant_options
ALTER TABLE variant_options 
ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN variant_groups.selection IS 'individual=lista con radio buttons, multiple=dropdown';
COMMENT ON COLUMN variant_options.description IS 'Texto descriptivo de la opción';
