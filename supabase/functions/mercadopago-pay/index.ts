// Puerta de entrada de los pagos de Mercado Pago: evita cobrar dos veces la misma división.
// Verifica en el servidor que la división (cargo) o el comensal no estén pagados y recién entonces reenvía el pedido
// a mercadopago-create-payment, que es el que crea el pago en Mercado Pago.
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
    const raw = await req.text();
    const body = JSON.parse(raw || "{}");
    const orderId = String(body.order_id ?? "").trim();
    const guestId = String(body.guest_id ?? "").trim();
    const chargeId = String(body.charge_id ?? "").trim();
    if (!orderId || !guestId) return json({ error: "Parámetros de pago incompletos" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let alreadyPaid = false;
    if (chargeId) {
      // División con cargo propio: pagada si el cargo está pagado o ya hay un pago aprobado para ese cargo
      const { data: charge } = await admin.from("order_guest_charges").select("status").eq("id", chargeId).maybeSingle();
      if (charge?.status === "paid") alreadyPaid = true;
      if (!alreadyPaid) {
        const { data: pay } = await admin.from("payments").select("id").eq("charge_id", chargeId).eq("status", "approved").limit(1).maybeSingle();
        if (pay?.id) alreadyPaid = true;
      }
    } else {
      // División del comensal sin cargo: pagada si el comensal figura pagado
      const { data: guest } = await admin.from("order_guests").select("paid").eq("id", guestId).eq("order_id", orderId).maybeSingle();
      if (guest?.paid === true) alreadyPaid = true;
    }

    if (alreadyPaid) {
      return json({ error: "Esta división ya está pagada. No se puede cobrar dos veces.", code: "already_paid" }, 409);
    }

    // Reenvía el pedido tal cual a la función que crea el pago
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "")}/functions/v1/mercadopago-create-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("Authorization") ?? "",
        apikey: req.headers.get("apikey") ?? "",
      },
      body: raw,
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") ?? "application/json" } });
  } catch (err) {
    console.error("[mercadopago-pay]", err);
    return json({ error: err instanceof Error ? err.message : "Error interno" }, 500);
  }
});
