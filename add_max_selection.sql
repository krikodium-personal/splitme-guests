-- Migración: max_selection en variant_groups
-- Ejecutar en el SQL Editor de Supabase

ALTER TABLE variant_groups 
ADD COLUMN IF NOT EXISTS max_selection integer;

COMMENT ON COLUMN variant_groups.max_selection IS 'Límite de opciones cuando selection=multiple (ej. 2 = hasta 2 opciones)';
