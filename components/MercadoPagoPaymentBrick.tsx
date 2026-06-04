import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Payment, initMercadoPago } from '@mercadopago/sdk-react';
import { supabase } from '../lib/supabase';

type MercadoPagoPaymentBrickProps = {
  restaurantId: string;
  orderId: string;
  guestId: string;
  amount: number;
  description?: string;
  onApproved: (paymentId: string | number) => void;
  onError: (message: string) => void;
  onPending?: () => void;
};

let mpInitPublicKey: string | null = null;

function ensureMpInit(publicKey: string) {
  if (mpInitPublicKey === publicKey) return;
  initMercadoPago(publicKey, { locale: 'es-AR' });
  mpInitPublicKey = publicKey;
}

function detectMpSdkBlocked(): boolean {
  return typeof window !== 'undefined' && !(window as any).MercadoPago;
}

const MercadoPagoPaymentBrick: React.FC<MercadoPagoPaymentBrickProps> = ({
  restaurantId,
  orderId,
  guestId,
  amount,
  description = 'Pago SplitMe',
  onApproved,
  onError,
  onPending,
}) => {
  const [loading, setLoading] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(
    import.meta.env.VITE_MERCADOPAGO_PLATFORM_PUBLIC_KEY?.trim() || null,
  );
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const idempotencyRef = useRef(crypto.randomUUID());
  const onErrorRef = useRef(onError);
  const fallbackPublicKeyRef = useRef(
    import.meta.env.VITE_MERCADOPAGO_PLATFORM_PUBLIC_KEY?.trim() || null,
  );
  const configSessionRef = useRef<string | null>(null);

  onErrorRef.current = onError;

  useEffect(() => {
    const sessionKey = `${restaurantId}|${orderId}|${guestId}|${amount}`;
    if (configSessionRef.current === sessionKey) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        if (detectMpSdkBlocked()) {
          onErrorRef.current(
            'No se pudo cargar Mercado Pago. Desactivá bloqueadores de anuncios o probá en otra ventana.',
          );
          return;
        }

        const { data, error } = await supabase.functions.invoke('mercadopago-create-brick-config', {
          body: {
            restaurant_id: restaurantId,
            order_id: orderId,
            guest_id: guestId,
            amount,
            description,
          },
        });

        if (cancelled) return;
        if (error || data?.error) {
          throw new Error(data?.error || error?.message || 'No se pudo preparar el checkout');
        }

        const pk = data.public_key || fallbackPublicKeyRef.current;
        if (!pk) throw new Error('Public key de SplitMe no configurada');
        if (!data.preference_id) throw new Error('No se recibió preference_id');

        ensureMpInit(pk);
        configSessionRef.current = sessionKey;
        setPublicKey(pk);
        setPreferenceId(data.preference_id);
      } catch (err: any) {
        if (!cancelled) onErrorRef.current(err?.message || 'Error al iniciar Mercado Pago');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId, orderId, guestId, amount, description]);

  const initialization = useMemo(() => ({
    amount: parseFloat(amount.toFixed(2)),
    preferenceId: preferenceId || undefined,
    marketplace: true,
  }), [amount, preferenceId]);

  // MP no acepta ticket: 'none' (solo pagofacil/rapipago). Para excluir cupones, omitir ticket.
  const customization = useMemo(() => ({
    paymentMethods: {
      creditCard: 'all' as const,
      debitCard: 'all' as const,
      mercadoPago: 'all' as const,
    },
  }), []);

  const onSubmit = useCallback(async ({ formData }: { formData: Record<string, unknown> }) => {
    const { data, error } = await supabase.functions.invoke('mercadopago-create-payment', {
      body: {
        restaurant_id: restaurantId,
        order_id: orderId,
        guest_id: guestId,
        amount,
        idempotency_key: idempotencyRef.current,
        form_data: formData,
      },
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'No se pudo procesar el pago');
    }

    if (data.status === 'approved') {
      onApproved(data.id);
      return;
    }
    if (data.status === 'in_process' || data.status === 'pending') {
      onPending?.();
      return;
    }

    throw new Error(data.status_detail || `Pago ${data.status || 'rechazado'}`);
  }, [restaurantId, orderId, guestId, amount, onApproved, onPending]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-text-secondary">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p className="text-sm font-medium">Preparando pago seguro…</p>
      </div>
    );
  }

  if (!publicKey || !preferenceId) return null;

  return (
    <div className="w-full max-w-lg mx-auto" key={preferenceId}>
      <Payment
        initialization={initialization}
        customization={customization}
        onSubmit={onSubmit}
        onReady={() => {}}
        onError={(err) => onErrorRef.current(err?.message || 'Error en el formulario de pago')}
      />
    </div>
  );
};

export default MercadoPagoPaymentBrick;
