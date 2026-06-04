# Mercado Pago — Marketplace + Payment Brick (SplitMe)

Integración **Marketplace (Split Payments)** con **Checkout Bricks**. El 100% del pago va al restaurante (`application_fee = 0` / `marketplace_fee = 0`).

## Arquitectura

| Capa | Responsabilidad |
|------|-----------------|
| **App plataforma (SplitMe)** | `client_id`, `client_secret`, public key, OAuth redirect |
| **Restaurante (OAuth)** | Autoriza cobros; tokens guardados cifrados en `payment_configs` |
| **Guests (frontend)** | Payment Brick con public key de SplitMe |
| **Edge Functions** | Preferencia, creación de pago, webhook, refresh de tokens |

## Variables de entorno (Supabase secrets)

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `MERCADOPAGO_CLIENT_ID` | Sí | App Marketplace SplitMe (genera `marketplace: MP-MKT-{client_id}` en preferencias) |
| `MERCADOPAGO_CLIENT_SECRET` | Sí | Solo backend |
| `MERCADOPAGO_OAUTH_REDIRECT_URI` | Sí | URL callback edge function |
| `MERCADOPAGO_OAUTH_STATE_SECRET` | Sí | HMAC para `state` OAuth |
| `MERCADOPAGO_PLATFORM_PUBLIC_KEY` | Sí | Public key plataforma (Payment Brick) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Recomendada | Validación `x-signature` |
| `MERCADOPAGO_TOKEN_ENCRYPTION_KEY` | Recomendada | Base64 de 32 bytes AES-GCM |
| `MERCADOPAGO_ADMIN_RETURN_URL` | No | Redirect post-OAuth (admin Settings) |
| `MERCADOPAGO_OAUTH_TEST_MODE` | No | `true` → OAuth sandbox |
| `MERCADOPAGO_SANDBOX_BUYER_EMAIL` | No | Opcional; el panel de cuentas de prueba **no expone email** (solo User ID, TESTUSER, contraseña, código). |
| `MERCADOPAGO_CRON_SECRET` | No | Bearer para job refresh tokens |

## Frontend (guests / Vercel)

| Variable | Descripción |
|----------|-------------|
| `VITE_MERCADOPAGO_PLATFORM_PUBLIC_KEY` | Opcional si la devuelve `mercadopago-create-brick-config` |
| `VITE_SUPABASE_URL` | URL proyecto |
| `VITE_SUPABASE_ANON_KEY` | Anon key |

## Edge Functions

| Función | Rol |
|---------|-----|
| `mercadopago-oauth-start` | PKCE + redirect autorización (JWT admin) |
| `mercadopago-oauth-callback` | Intercambia code, persiste tokens cifrados |
| `mercadopago-create-brick-config` | Preferencia + public key para Brick |
| `mercadopago-create-payment` | `POST /v1/payments` con token vendedor + `application_fee: 0` |
| `mercadopago-webhook` | Notificaciones MP (firma + idempotencia) |
| `mercadopago-refresh-tokens` | Job refresh proactivo (cron) |

## Onboarding restaurante

1. Admin → Settings → Pagos → **Conectar Mercado Pago**
2. Restaurante autoriza en MP (OAuth Authorization Code + PKCE, `scope=offline_access`)
3. Tokens en `payment_configs` (nunca expuestos al frontend)

## Pago comensal

1. Guests → Individual Share → Mercado Pago
2. Payment Brick in-app (`marketplace: true`)
3. Backend crea pago con token del restaurante
4. Webhook concilia por `external_reference` (`orderId|guestId`)

## Cron refresh tokens

Programar POST diario a:

```
https://<project>.supabase.co/functions/v1/mercadopago-refresh-tokens
Authorization: Bearer <MERCADOPAGO_CRON_SECRET>
```

## Pruebas

- [Make test purchase (Brick)](https://www.mercadopago.com.ar/developers/en/docs/checkout-bricks/integration-test/test-payment-flow): credenciales **TEST** de la app + tarjetas de prueba + email cualquiera (≠ tu login MP).
- [Test accounts](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/test/accounts): MP aclara que **Checkout Bricks no soportan cuentas de prueba del panel** para integrar; el flujo Brick usa credenciales TEST, no el login TESTUSER del panel.
- Marketplace + OAuth del restaurante: si el vendedor conectado es usuario de prueba (`user_account` del panel), un **2034** puede ser límite de MP, no un bug de email en SplitMe.
- Habilitar PKCE en la app MP (Developers → editar app)

## Docs oficiales

- [Split Payments](https://www.mercadopago.com.ar/developers/en/docs/split-payments/landing)
- [OAuth + PKCE](https://www.mercadopago.com.ar/developers/en/docs/checkout-api-payments/additional-content/security/oauth/creation)
- [Payment Brick](https://www.mercadopago.com.ar/developers/en/docs/checkout-bricks/payment-brick/introduction)
- [Refresh token](https://www.mercadopago.com.ar/developers/en/docs/oauth/renewal)
