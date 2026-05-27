-- Clave secreta de Webhooks de Mercado Pago (generada en Tus integraciones > Webhooks)
ALTER TABLE payment_configs
ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

COMMENT ON COLUMN payment_configs.webhook_secret IS 'Secret signature de Webhooks MP para validar x-signature';
