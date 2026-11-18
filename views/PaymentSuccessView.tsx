import React, { useMemo } from 'react';
import { formatPrice } from './MenuView';

/** Comprobante del pago recién hecho. Se guarda al aprobarse el pago (App.tsx) y se muestra en /payment-success. */
export interface PaymentReceipt {
  /** true: el pago quedó registrado en el sistema. false: MP lo aprobó pero todavía no se pudo confirmar. */
  ok: boolean;
  amount: number;
  method: string;
  /** Id de la operación en Mercado Pago. */
  reference?: string | null;
  guestName?: string | null;
  restaurantName?: string | null;
  tableNumber?: string | number | null;
  paidAt: string;
}

export const RECEIPT_STORAGE_KEY = 'splitme_payment_receipt';

const METHOD_LABELS: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  cash: 'Efectivo',
  efectivo: 'Efectivo',
};

interface Props {
  receipt: PaymentReceipt;
  onContinue: () => void;
}

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-white/15 last:border-b-0">
    <span className="text-sm text-white/70 whitespace-nowrap">{label}</span>
    <span className="text-sm font-bold text-right break-all">{value}</span>
  </div>
);

const PaymentSuccessView: React.FC<Props> = ({ receipt, onContinue }) => {
  const when = useMemo(() => {
    const d = new Date(receipt.paidAt);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }, [receipt.paidAt]);

  const reference = receipt.reference
    ? receipt.reference.startsWith('sandbox_') ? 'Pago de prueba (sandbox)' : `#${receipt.reference}`
    : null;
  const ok = receipt.ok;

  return (
    <div
      className={`fixed inset-0 z-[90] overflow-y-auto text-white ${ok ? 'bg-gradient-to-b from-emerald-500 to-emerald-800' : 'bg-gradient-to-b from-amber-500 to-amber-700'}`}
      role="status"
    >
      <div className="max-w-md mx-auto min-h-full flex flex-col px-6 pt-14 pb-8">
        <div className="flex flex-col items-center text-center">
          <div className="size-24 rounded-full bg-white/20 ring-4 ring-white/40 flex items-center justify-center shadow-2xl">
            <span className="material-symbols-outlined text-white filled" style={{ fontSize: '64px', fontVariationSettings: "'wght' 600" }}>
              {ok ? 'check_circle' : 'schedule'}
            </span>
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight">{ok ? '¡Pago exitoso!' : 'Pago aprobado'}</h1>
          <p className="mt-2 text-white/80 text-sm leading-snug">
            {ok
              ? 'Tu pago se registró correctamente.'
              : 'Mercado Pago aprobó tu pago, pero todavía no pudimos confirmarlo en el sistema. No lo repitas: avisale a tu mesero.'}
          </p>
          <p className="mt-6 text-5xl font-black tracking-tight">${formatPrice(receipt.amount)}</p>
        </div>

        <div className="mt-8 rounded-3xl bg-black/20 backdrop-blur px-5 py-2 shadow-xl">
          {receipt.restaurantName && <Row label="Restaurante" value={receipt.restaurantName} />}
          {receipt.tableNumber != null && receipt.tableNumber !== '' && <Row label="Mesa" value={receipt.tableNumber} />}
          {receipt.guestName && <Row label="Comensal" value={receipt.guestName} />}
          <Row label="Método de pago" value={METHOD_LABELS[receipt.method.toLowerCase()] || receipt.method} />
          {when && <Row label="Fecha y hora" value={when} />}
          {reference && <Row label="N.º de operación" value={reference} />}
          <Row label="Estado" value={ok ? 'Aprobado' : 'Aprobado · pendiente de confirmar'} />
        </div>

        <div className="mt-auto pt-8">
          <button
            onClick={onContinue}
            className="w-full h-14 rounded-full bg-white text-emerald-800 font-black text-lg shadow-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            Continuar
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <p className="mt-3 text-center text-xs text-white/70">Después podés dejar propina y calificar tu experiencia.</p>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccessView;
