-- Script para crear la tabla waiter_notifications
-- Esta tabla almacena las solicitudes de los comensales a los meseros
-- Ejecutar este script en el SQL Editor de Supabase

-- Crear tabla waiter_notifications
CREATE TABLE IF NOT EXISTS waiter_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waiter_id UUID NOT NULL REFERENCES waiters(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'read', 'completed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_waiter_notifications_waiter_id ON waiter_notifications(waiter_id);
CREATE INDEX IF NOT EXISTS idx_waiter_notifications_order_id ON waiter_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_waiter_notifications_status ON waiter_notifications(status);
CREATE INDEX IF NOT EXISTS idx_waiter_notifications_created_at ON waiter_notifications(created_at DESC);

-- Crear trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_waiter_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_waiter_notifications_updated_at ON waiter_notifications;

CREATE TRIGGER update_waiter_notifications_updated_at 
  BEFORE UPDATE ON waiter_notifications 
  FOR EACH ROW 
  EXECUTE FUNCTION update_waiter_notifications_updated_at();

-- Habilitar RLS (Row Level Security)
ALTER TABLE waiter_notifications ENABLE ROW LEVEL SECURITY;

-- Política para permitir INSERT (cualquier usuario puede crear notificaciones)
CREATE POLICY "Allow insert waiter notifications"
ON waiter_notifications
FOR INSERT
WITH CHECK (true);

-- Política para permitir SELECT (los meseros pueden ver sus notificaciones)
CREATE POLICY "Allow select waiter notifications"
ON waiter_notifications
FOR SELECT
USING (true);

-- Política para permitir UPDATE (los meseros pueden actualizar el status)
CREATE POLICY "Allow update waiter notifications"
ON waiter_notifications
FOR UPDATE
USING (true)
WITH CHECK (true);
