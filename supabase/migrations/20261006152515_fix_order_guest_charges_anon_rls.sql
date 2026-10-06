-- Guests (anon) perdieron acceso a order_guest_charges cuando se habilitó RLS con
-- policies solo para authenticated (hardening manual ~2026-08-14/18).
-- Restaura el flujo de división con policies acotadas. Marcar cargos como pagados
-- sigue reservado a staff (authenticated) y al webhook de MP (service_role).

ALTER TABLE public.order_guest_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guests can read charges" ON public.order_guest_charges;
CREATE POLICY "Guests can read charges"
  ON public.order_guest_charges
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Guests can create pending charges on open orders" ON public.order_guest_charges;
CREATE POLICY "Guests can create pending charges on open orders"
  ON public.order_guest_charges
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'pending'
    AND payment_id IS NULL
    AND paid_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.order_guests og ON og.order_id = o.id
      WHERE o.id = order_guest_charges.order_id
        AND og.id = order_guest_charges.guest_id
        AND upper(coalesce(o.status, 'ABIERTO')) NOT IN ('PAGADO', 'CERRADO', 'CANCELADO')
    )
  );

DROP POLICY IF EXISTS "Guests can update pending charges" ON public.order_guest_charges;
CREATE POLICY "Guests can update pending charges"
  ON public.order_guest_charges
  FOR UPDATE
  TO anon
  USING (status = 'pending' AND payment_id IS NULL)
  WITH CHECK (status = 'pending' AND payment_id IS NULL AND paid_at IS NULL);

DROP POLICY IF EXISTS "Guests can delete pending charges on open orders" ON public.order_guest_charges;
CREATE POLICY "Guests can delete pending charges on open orders"
  ON public.order_guest_charges
  FOR DELETE
  TO anon
  USING (
    status = 'pending'
    AND payment_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_guest_charges.order_id
        AND upper(coalesce(o.status, 'ABIERTO')) NOT IN ('PAGADO', 'CERRADO', 'CANCELADO')
    )
  );

-- El guest app solo actualiza payment_method; el resto de columnas no es editable por anon.
REVOKE UPDATE ON public.order_guest_charges FROM anon;
GRANT UPDATE (payment_method) ON public.order_guest_charges TO anon;
GRANT SELECT, INSERT, DELETE ON public.order_guest_charges TO anon;
