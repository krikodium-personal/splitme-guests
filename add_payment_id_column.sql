-- Script para agregar la columna payment_id a order_guests
-- Esta columna almacena el ID del registro en la tabla payments para mantener la relación

-- Verificar si la columna ya existe antes de agregarla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'order_guests' 
        AND column_name = 'payment_id'
    ) THEN
        ALTER TABLE order_guests
        ADD COLUMN payment_id UUID REFERENCES payments(id);
        
        RAISE NOTICE 'Columna payment_id agregada exitosamente a order_guests';
    ELSE
        RAISE NOTICE 'La columna payment_id ya existe en order_guests';
    END IF;
END $$;

