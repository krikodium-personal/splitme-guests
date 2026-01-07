-- Script para renombrar columnas de payment_configs para compatibilidad con múltiples medios de pago

-- Renombrar columnas
ALTER TABLE payment_configs
RENAME COLUMN mp_user_id TO user_account;

ALTER TABLE payment_configs
RENAME COLUMN access_token TO token_cbu;

ALTER TABLE payment_configs
RENAME COLUMN public_key TO key_alias;

-- Nota: Estos nuevos nombres son genéricos y pueden usarse para diferentes proveedores:
-- - user_account: Puede ser user_id de MercadoPago, número de cuenta bancaria, etc.
-- - token_cbu: Puede ser access_token de MercadoPago, CBU para transferencias, etc.
-- - key_alias: Puede ser public_key de MercadoPago, alias bancario, etc.

