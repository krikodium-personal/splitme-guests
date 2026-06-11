import React, { useMemo } from 'react';
import { Guest } from '../types';
import { formatPrice } from './MenuView';
import { getGuestColor, getInitials } from './GuestInfoView';

interface SplitStatusViewProps {
  onBack: () => void;
  onContinuePayment: () => void;
  onNewSplit: () => void;
  onGoToMenu: () => void;
  onChangeSplit: () => void;
  guests: Guest[];
  splitData: any[] | null;
}

const getPaymentMethodLabel = (method?: string | null) => {
  if (!method) return '';
  switch (method.toLowerCase()) {
    case 'mercadopago':
      return 'Mercado Pago';
    case 'transferencia':
    case 'transfer':
      return 'Transferencia';
    case 'efectivo':
    case 'cash':
      return 'Efectivo';
    default:
      return method;
  }
};

const SplitStatusView: React.FC<SplitStatusViewProps> = ({ onBack, onContinuePayment, onNewSplit, onGoToMenu, onChangeSplit, guests, splitData }) => {
  const diners = useMemo(() => {
    return (splitData || [])
      .map((share) => {
        const guest = guests.find(g => g.id === share.id || g.id === share.guest_id);
        const amount = Number(share.total ?? share.amount ?? share.subtotal ?? 0) || 0;
        const paid = share.paid === true || share.status === 'paid';
        return {
          ...guest,
          ...share,
          id: share.id || share.guest_id,
          name: guest?.name || share.name || 'Comensal',
          amount,
          paid,
          paymentMethod: share.payment_method || guest?.payment_method || null,
        };
      })
      .filter(diner => diner.amount > 0);
  }, [guests, splitData]);

  const totalAssigned = diners.reduce((sum, diner) => sum + diner.amount, 0);
  const totalPaid = diners.reduce((sum, diner) => sum + (diner.paid ? diner.amount : 0), 0);
  const pendingTotal = Math.max(0, totalAssigned - totalPaid);
  const paidCount = diners.filter(diner => diner.paid).length;
  const hasPendingPayments = pendingTotal > 0.01;
  const allDinersPaid = diners.length > 0 && paidCount === diners.length && !hasPendingPayments;

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-36 bg-background-dark text-white font-display antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background-dark/90 px-4 py-4 backdrop-blur-md border-b border-white/5">
        <button onClick={onBack} className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold leading-tight">División registrada</h1>
        <div className="size-10" />
      </header>

      <main className="flex-1 px-4 pt-8">
        <section className="text-center mb-8">
          <p className="text-primary text-[10px] font-black uppercase tracking-[0.35em] mb-3">Saldo pendiente</p>
          <h2 className="text-5xl font-black tracking-tighter tabular-nums">${formatPrice(pendingTotal)}</h2>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-text-secondary">
            {paidCount} de {diners.length} comensales pagaron
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl bg-surface-dark border border-white/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-2">Dividido</p>
            <p className="text-xl font-black tabular-nums">${formatPrice(totalAssigned)}</p>
          </div>
          <div className="rounded-2xl bg-surface-dark border border-white/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-2">Pagado</p>
            <p className="text-xl font-black text-primary tabular-nums">${formatPrice(totalPaid)}</p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Detalle por comensal</h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary">{diners.length} registros</span>
          </div>

          {diners.length > 0 ? diners.map((diner) => {
            const methodLabel = getPaymentMethodLabel(diner.paymentMethod);
            return (
              <article key={diner.charge_id || diner.id} className={`rounded-2xl border p-4 ${diner.paid ? 'bg-primary/10 border-primary/50' : 'bg-surface-dark border-amber-500/40'}`}>
                <div className="flex items-center gap-3">
                  <div className={`size-12 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${getGuestColor(diner.id || diner.name)}`}>
                    {getInitials(diner.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black truncate">{diner.name}</p>
                    <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${diner.paid ? 'text-primary' : 'text-amber-400'}`}>
                      {diner.paid ? 'Pago realizado' : 'Falta pagar'}
                      {methodLabel ? ` · ${methodLabel}` : ''}
                    </p>
                  </div>
                  <p className="text-lg font-black tabular-nums shrink-0">${formatPrice(diner.amount)}</p>
                </div>
              </article>
            );
          }) : (
            <div className="rounded-2xl bg-surface-dark border border-white/5 p-8 text-center text-text-secondary">
              <span className="material-symbols-outlined text-4xl mb-3">receipt_long</span>
              <p className="font-bold">Todavía no hay una división registrada.</p>
            </div>
          )}
        </section>
      </main>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-background-dark border-t border-white/5 z-20 space-y-3 shadow-2xl">
        {hasPendingPayments ? (
          <button onClick={onContinuePayment} className="w-full h-14 rounded-2xl font-black flex items-center justify-center gap-2 bg-primary text-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined font-black">payments</span>
            <span>Continuar con pagos</span>
          </button>
        ) : allDinersPaid ? (
          <button onClick={onGoToMenu} className="w-full h-14 rounded-2xl font-black flex items-center justify-center gap-2 bg-primary text-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined font-black">restaurant_menu</span>
            <span>Volver al menú</span>
          </button>
        ) : (
          <button onClick={onNewSplit} className="w-full h-14 rounded-2xl font-black flex items-center justify-center gap-2 bg-primary text-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined font-black">call_split</span>
            <span>Dividir nuevos cargos</span>
          </button>
        )}
        {hasPendingPayments && (
          <button onClick={onChangeSplit} className="w-full py-2 text-center text-sm font-black text-primary active:scale-[0.98] transition-all">
            ¿Querés cambiar la forma de dividir la cuenta?
          </button>
        )}
      </div>
    </div>
  );
};

export default SplitStatusView;
