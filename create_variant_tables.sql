-- Tablas para variantes de productos (opcional)
-- Ejecutar solo si variant_groups y variant_options no existen

-- variant_groups: grupos de variantes (ej. "Tamaño", "Tipo de leche")
CREATE TABLE IF NOT EXISTS variant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  selection text NOT NULL DEFAULT 'individual' CHECK (selection IN ('individual', 'multiple')),
  max_selection integer,
  required boolean NOT NULL DEFAULT false,
  sort_order integer DEFAULT 0
);

-- variant_options: opciones dentro de cada grupo (ej. "Grande", "Mediano")
CREATE TABLE IF NOT EXISTS variant_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_group_id uuid NOT NULL REFERENCES variant_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_type text NOT NULL CHECK (price_type IN ('replace', 'add')),
  price_amount decimal(10,2) NOT NULL DEFAULT 0,
  sort_order integer DEFAULT 0
);

-- Índices para las relaciones
CREATE INDEX IF NOT EXISTS idx_variant_groups_menu_item ON variant_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_variant_options_group ON variant_options(variant_group_id);

-- RLS (ajustar según tu política)
ALTER TABLE variant_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_options ENABLE ROW LEVEL SECURITY;
