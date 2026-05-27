-- RLS para menu_section_headers (lectura pública para comensales)
-- Ejecutar en Supabase SQL Editor si la tabla bloquea lecturas

ALTER TABLE menu_section_headers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read menu_section_headers" ON menu_section_headers;

CREATE POLICY "Allow read menu_section_headers"
ON menu_section_headers FOR SELECT USING (true);
