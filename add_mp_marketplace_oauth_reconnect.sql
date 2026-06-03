-- Marketplace OAuth: flag cuando el restaurante debe reconectar MP
ALTER TABLE payment_configs
  ADD COLUMN IF NOT EXISTS oauth_requires_reconnect BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN payment_configs.oauth_requires_reconnect IS
  'true si el refresh_token falló o expiró; el restaurante debe repetir OAuth en Admin';
