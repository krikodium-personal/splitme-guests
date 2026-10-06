-- Comisión de plataforma SplitMe (take rate) sobre cobros Mercado Pago.
-- 149 = 1.49%. 0 = piloto / sin take rate. Tope 2.99%.
ALTER TABLE payment_configs
ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payment_configs
DROP CONSTRAINT IF EXISTS payment_configs_platform_fee_bps_range;

ALTER TABLE payment_configs
ADD CONSTRAINT payment_configs_platform_fee_bps_range
CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 299);

COMMENT ON COLUMN payment_configs.platform_fee_bps IS
  'Comisión SplitMe en basis points (149 = 1.49%). 0 = sin take rate. Tope 299 = 2.99%. Se aplica como marketplace_fee en la preferencia de Mercado Pago, solo en producción.';

-- Opt-in por restaurante (no activar en masa):
-- UPDATE payment_configs SET platform_fee_bps = 149 WHERE restaurant_id = '<id>' AND provider = 'mercadopago';
