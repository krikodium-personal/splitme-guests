import { decryptSecret } from "../_shared/mp-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valida x-signature según documentación de Webhooks de Mercado Pago */
async function verifyMercadoPagoSignature(req: Request, secret: string): Promise<boolean> {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !secret) return false;

  const url = new URL(req.url);
  let dataId = url.searchParams.get("data.id") ?? "";
  if (dataId && /[a-z]/i.test(dataId)) {
    dataId = dataId.toLowerCase();
  }

  let ts = "";
  let hash = "";
  for (const part of xSignature.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") ts = value;
    if (key === "v1") hash = value;
  }
  if (!hash) return false;

  const manifestParts: string[] = [];
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`);
  if (ts) manifestParts.push(`ts:${ts}`);
  const manifest = manifestParts.join(";") + ";";

  const computed = await hmacSha256Hex(secret, manifest);
  return computed === hash;
}

function parseExternalReference(ref: string | null | undefined): { orderId: string; guestId: string } | null {
  if (!ref) return null;
  const [orderId, guestId] = ref.split("|");
  if (!orderId || !guestId) return null;
  return { orderId, guestId };
}

async function resolveConfigByRestaurant(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string,
): Promise<{ accessToken: string; restaurantId: string } | null> {
  const { data: cfg } = await supabase
    .from("payment_configs")
    .select("token_cbu, token_cbu_test, restaurant_id, oauth_test_mode")
    .eq("provider", "mercadopago")
    .eq("is_active", true)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!cfg) return null;
  const rawToken = cfg.oauth_test_mode ? cfg.token_cbu_test : cfg.token_cbu;
  const accessToken = await decryptSecret(rawToken ?? cfg.token_cbu);
  if (!accessToken) return null;
  return { accessToken, restaurantId: cfg.restaurant_id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Mercado Pago espera 200/201 rápido (<22s)
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const globalWebhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);

    if (!globalWebhookSecret) {
      console.error("[mercadopago-webhook] MERCADOPAGO_WEBHOOK_SECRET no configurado");
      return new Response(JSON.stringify({ error: "Webhook no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signatureValid = await verifyMercadoPagoSignature(req, globalWebhookSecret);
    if (!signatureValid) {
      console.warn("[mercadopago-webhook] Firma inválida");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const topic = (body.type as string) ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
    const paymentIdFromQuery = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const paymentIdFromBody = (body.data as { id?: string | number } | undefined)?.id;
    const paymentId = String(paymentIdFromBody ?? paymentIdFromQuery ?? "");

    // Solo procesamos pagos (Checkout Pro)
    if (topic && topic !== "payment" && !paymentId) {
      return new Response(JSON.stringify({ ok: true, skipped: topic }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ ok: true, message: "No payment id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MP envía restaurant_id en metadata — úsalo para lookup directo sin iterar todos los configs.
    const bodyMetadata = (body.data as { metadata?: Record<string, unknown> } | undefined)?.metadata;
    const restaurantIdFromBodyMeta = typeof bodyMetadata?.restaurant_id === "string"
      ? bodyMetadata.restaurant_id
      : null;

    // Extraer orderId del external_reference del body si viene (algunos eventos lo incluyen).
    const externalRefFromBody = typeof (body.data as { external_reference?: string } | undefined)?.external_reference === "string"
      ? parseExternalReference((body.data as { external_reference?: string }).external_reference)
      : null;

    let restaurantIdForLookup = restaurantIdFromBodyMeta;

    if (!restaurantIdForLookup && externalRefFromBody?.orderId) {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("restaurant_id")
        .eq("id", externalRefFromBody.orderId)
        .maybeSingle();
      restaurantIdForLookup = orderRow?.restaurant_id ?? null;
    }

    let mpAuth: { accessToken: string; restaurantId: string } | null = null;

    if (restaurantIdForLookup) {
      mpAuth = await resolveConfigByRestaurant(supabase, restaurantIdForLookup);
    }

    if (!mpAuth) {
      console.error("[mercadopago-webhook] No access token for payment", paymentId);
      return new Response(JSON.stringify({ error: "No MP config" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { accessToken, restaurantId: restaurantIdFromConfig } = mpAuth;

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mpRes.ok) {
      console.error("[mercadopago-webhook] MP API error", mpRes.status, await mpRes.text());
      return new Response(JSON.stringify({ ok: true, message: "Payment not found yet" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await mpRes.json();
    const status = payment.status as string;
    const externalRef = parseExternalReference(payment.external_reference as string);

    if (!externalRef) {
      console.warn("[mercadopago-webhook] external_reference inválida:", payment.external_reference);
      return new Response(JSON.stringify({ ok: true, skipped: "bad external_reference" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { orderId, guestId } = externalRef;
    const amount = Number(payment.transaction_amount ?? 0);
    const metadata = payment.metadata as Record<string, unknown> | undefined;
    const restaurantIdFromMetadata = typeof metadata?.restaurant_id === "string" ? metadata.restaurant_id : null;

    const { data: orderRow } = await supabase
      .from("orders")
      .select("restaurant_id")
      .eq("id", orderId)
      .maybeSingle();

    const restaurantId = orderRow?.restaurant_id ?? restaurantIdFromMetadata ?? restaurantIdFromConfig;

    if (status === "approved") {
      const { data: existingGuest } = await supabase
        .from("order_guests")
        .select("paid, payment_id")
        .eq("id", guestId)
        .maybeSingle();

      if (existingGuest?.paid === true) {
        return new Response(JSON.stringify({ ok: true, idempotent: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("mp_transaction_id", String(paymentId))
        .maybeSingle();

      let paymentRecordId = existingPayment?.id;

      if (!paymentRecordId) {
        const { data: newPayment, error: payErr } = await supabase
          .from("payments")
          .insert({
            order_id: orderId,
            amount,
            payment_method: "mercadopago",
            mp_transaction_id: String(paymentId),
            status: "approved",
          })
          .select("id")
          .single();

        if (payErr) {
          console.error("[mercadopago-webhook] Error insert payments:", payErr);
          return new Response(JSON.stringify({ error: payErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        paymentRecordId = newPayment.id;
      }

      const guestPayload: Record<string, unknown> = {
        paid: true,
        payment_method: "mercadopago",
      };
      if (paymentRecordId) guestPayload.payment_id = paymentRecordId;

      const { error: guestErr } = await supabase
        .from("order_guests")
        .update(guestPayload)
        .eq("id", guestId);

      if (guestErr) {
        console.error("[mercadopago-webhook] Error update order_guests:", guestErr);
        return new Response(JSON.stringify({ error: guestErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[mercadopago-webhook] Pago aprobado:", { orderId, guestId, paymentId, amount, restaurantId });
    } else if (status === "rejected" || status === "cancelled") {
      console.log("[mercadopago-webhook] Pago no aprobado:", { paymentId, status });
    }

    return new Response(JSON.stringify({ ok: true, status }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[mercadopago-webhook] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
