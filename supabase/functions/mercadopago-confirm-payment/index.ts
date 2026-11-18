// Confirma un pago aprobado de Mercado Pago desde el cliente (comensal anónimo) sin darle permiso de escritura
// sobre `payments`. El registro real lo hace siempre el servidor:
//  1) Pago real: lo registra el webhook (mercadopago-webhook) cuando MP lo notifica. Esta función solo mira si ya está.
//  2) Pago simulado de sandbox (id "sandbox_…", que MP nunca notifica): se registra acá, pero solo si el restaurante
//     está en modo prueba (payment_configs.oauth_test_mode = true). En producción nunca se acepta un pago sin MP.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id ?? "").trim();
    const guestId = String(body.guest_id ?? "").trim();
    const chargeId = String(body.charge_id ?? "").trim();
    const mpId = String(body.mp_transaction_id ?? "").trim();
    const amount = Number(body.amount);
    if (!orderId || !guestId || !mpId || !Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Parámetros incompletos" }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ¿Ya lo registró el webhook (o una llamada anterior)?
    const { data: existing } = await admin.from("payments").select("id").eq("mp_transaction_id", mpId).maybeSingle();
    if (existing?.id) return json({ ok: true, payment_id: existing.id, recorded_by: "existing" });

    // Solo los pagos simulados de sandbox se registran desde acá
    if (!mpId.startsWith("sandbox_")) return json({ ok: false, pending: true });

    const { data: order } = await admin.from("orders").select("restaurant_id").eq("id", orderId).maybeSingle();
    if (!order?.restaurant_id) return json({ error: "Pedido inexistente" }, 404);

    const { data: config } = await admin
      .from("payment_configs")
      .select("oauth_test_mode")
      .eq("restaurant_id", order.restaurant_id)
      .eq("provider", "mercadopago")
      .maybeSingle();
    if (config?.oauth_test_mode !== true) return json({ ok: false, pending: true });

    // El comensal tiene que pertenecer a ese pedido
    const { data: guest } = await admin.from("order_guests").select("id").eq("id", guestId).eq("order_id", orderId).maybeSingle();
    if (!guest) return json({ error: "Comensal inexistente en el pedido" }, 404);

    const payload: Record<string, unknown> = {
      order_id: orderId,
      guest_id: guestId,
      charge_id: chargeId || null,
      amount,
      payment_method: "mercadopago",
      mp_transaction_id: mpId,
      status: "approved",
    };
    let { data: payment, error: payErr } = await admin.from("payments").insert(payload).select("id").single();
    if (payErr && payErr.code === "PGRST204") {
      const { guest_id: _g, charge_id: _c, ...legacy } = payload;
      ({ data: payment, error: payErr } = await admin.from("payments").insert(legacy).select("id").single());
    }
    if (payErr || !payment?.id) return json({ error: payErr?.message ?? "No se pudo registrar el pago" }, 500);

    if (chargeId) {
      const { error } = await admin
        .from("order_guest_charges")
        .update({ status: "paid", payment_method: "mercadopago", payment_id: payment.id, paid_at: new Date().toISOString() })
        .eq("id", chargeId);
      if (error) return json({ error: error.message }, 500);
    } else {
      let { error } = await admin
        .from("order_guests")
        .update({ paid: true, payment_method: "mercadopago", payment_id: payment.id })
        .eq("id", guestId);
      if (error && error.code === "PGRST204") {
        ({ error } = await admin.from("order_guests").update({ paid: true, payment_method: "mercadopago" }).eq("id", guestId));
      }
      if (error) return json({ error: error.message }, 500);
    }

    return json({ ok: true, payment_id: payment.id, recorded_by: "confirm-sandbox" });
  } catch (err) {
    console.error("[mercadopago-confirm-payment]", err);
    return json({ error: err instanceof Error ? err.message : "Error interno" }, 500);
  }
});
