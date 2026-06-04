import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Payment, initMercadoPago } from '@mercadopago/sdk-react';
import {
  detectBrickEnvMismatch,
  formatMpPaymentError,
  type MpPaymentErrorBody,
} from '../lib/mercadopago-errors';
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

const mpInitRef = { publicKey: '' as string };

/** @see @mercadopago/sdk-react README — initMercadoPago('YOUR_PUBLIC_KEY') antes del Brick */
function ensureMpInit(publicKey: string) {
  if (mpInitRef.publicKey === publicKey) return;
  initMercadoPago(publicKey, { locale: 'es-AR' });
  mpInitRef.publicKey = publicKey;
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
  const [envWarning, setEnvWarning] = useState<string | null>(null);
  const [isSandbox, setIsSandbox] = useState(false);
  const idempotencyRef = useRef(crypto.randomUUID());
  const onErrorRef = useRef(onError);
  const fallbackPublicKeyRef = useRef(
    import.meta.env.VITE_MERCADOPAGO_PLATFORM_PUBLIC_KEY?.trim() || null,
  );
  const configSessionRef = useRef<string | null>(null);

  onErrorRef.current = onError;

  useEffect(() => {
    const sessionKey = `${restaurantId}|${orderId}|${guestId}|${amount}`;

    if (!restaurantId) return;

    if (configSessionRef.current === sessionKey) {
      setLoading(false);
      return;
    }

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
        setIsSandbox(data.oauth_test_mode === true || data.checkout_env === 'sandbox');

        const sellerPrefix = data.seller_token_prefix as string | undefined;
        const mismatchFromServer = data.env_mismatch as string | null | undefined;
        setEnvWarning(
          sellerPrefix ? detectBrickEnvMismatch(pk, sellerPrefix) : null,
        );

        if (import.meta.env.DEV) {
          console.info('[MercadoPago] Checkout env:', {
            checkout_env: data.checkout_env,
            token_source: data.token_source,
            seller_token_prefix: sellerPrefix,
            platform_public_key_prefix: data.platform_public_key_prefix,
            oauth_test_mode: data.oauth_test_mode,
            seller_user_id: data.seller_user_id,
            env_mismatch: mismatchFromServer,
          });
        }
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
        preference_id: preferenceId,
        idempotency_key: idempotencyRef.current,
        form_data: formData,
      },
    });

    if (error || data?.error) {
      throw new Error(await resolveMpInvokeError(error, data));
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
  }, [restaurantId, orderId, guestId, amount, preferenceId, onApproved, onPending]);

async function resolveMpInvokeError(
  error: unknown,
  data: MpPaymentErrorBody | null,
): Promise<string> {
  if (data?.error) return formatMpPaymentError(data);

  const ctx = (error as { context?: Response })?.context;
  if (ctx) {
    try {
      const body = (await ctx.json()) as MpPaymentErrorBody;
      if (body?.error) return formatMpPaymentError(body);
    } catch {
      /* ignore */
    }
  }

  return (error as Error)?.message || 'No se pudo procesar el pago';
}

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
    <div className="w-full max-w-lg mx-auto space-y-4" key={preferenceId}>
      {envWarning && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 leading-snug"
        >
          {envWarning}
        </div>
      )}
      <Payment
        initialization={initialization}
        customization={customization}
        onSubmit={onSubmit}
        onReady={() => {}}
        onError={(err) => onErrorRef.current(err?.message || 'Error en el formulario de pago')}
      />
      {isSandbox && <TestCardPanel />}
    </div>
  );
};

const TEST_CARDS = [
  { label: 'Mastercard', number: '5031 7557 3453 0604', cvv: '123', expiry: '11/30' },
  { label: 'Visa crédito', number: '4509 9535 6623 3704', cvv: '123', expiry: '11/30' },
  { label: 'Amex', number: '3711 803032 57522', cvv: '1234', expiry: '11/30' },
  { label: 'Mastercard débito', number: '5287 3383 1025 3304', cvv: '123', expiry: '11/30' },
  { label: 'Visa débito', number: '4002 7686 9439 5619', cvv: '123', expiry: '11/30' },
];

const TEST_RESULTS = [
  { name: 'APRO', desc: 'Aprobado' },
  { name: 'OTHE', desc: 'Rechazado (error general)' },
  { name: 'CONT', desc: 'Pendiente' },
  { name: 'CALL', desc: 'Rechazado (requiere autorización)' },
  { name: 'FUND', desc: 'Rechazado (fondos insuficientes)' },
  { name: 'SECU', desc: 'Rechazado (CVV inválido)' },
  { name: 'EXPI', desc: 'Rechazado (vencimiento)' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text.replace(/\s/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 hover:bg-white/20 transition-colors"
    >
      {copied ? '✓' : 'copiar'}
    </button>
  );
}

function TestCardPanel() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4 text-xs">
      <p className="text-white/50 font-semibold uppercase tracking-wider text-[10px]">
        Tarjetas de prueba (sandbox)
      </p>

      <div className="space-y-2">
        {TEST_CARDS.map((c) => (
          <div key={c.number} className="flex items-center justify-between gap-2 bg-white/5 rounded-xl px-3 py-2">
            <span className="text-white/60 w-32 shrink-0">{c.label}</span>
            <span className="font-mono text-white/90 tabular-nums">{c.number}</span>
            <CopyButton text={c.number} />
            <span className="text-white/40 shrink-0">CVV {c.cvv} · {c.expiry}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 pt-3 space-y-1">
        <p className="text-white/50 mb-2">Nombre del titular → resultado:</p>
        <div className="grid grid-cols-2 gap-1">
          {TEST_RESULTS.map((r) => (
            <div key={r.name} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
              <span className="font-mono font-bold text-white/80">{r.name}</span>
              <span className="text-white/40 truncate">{r.desc}</span>
              <CopyButton text={r.name} />
            </div>
          ))}
        </div>
        <p className="text-white/30 pt-1">DNI de prueba: <span className="font-mono">12345678</span></p>
      </div>
    </div>
  );
}

export default MercadoPagoPaymentBrick;
