import React from 'react';
import { formatPrice } from './MenuView';

interface CashPaymentViewProps {
  onBack: () => void;
  amount: number;
  guestName?: string;
}

const CashPaymentView: React.FC<CashPaymentViewProps> = ({ onBack, amount, guestName }) => {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark text-white font-display antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background-dark/90 px-4 py-4 backdrop-blur-md border-b border-white/5">
        <button onClick={onBack} className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold leading-tight">Pago en Efectivo</h1>
        <div className="size-10"></div>
      </header>

      <div className="flex flex-col items-center justify-center pt-12 pb-8 px-5 animate-fade-in-up">
        <div className="size-24 rounded-full bg-primary/20 flex items-center justify-center mb-6 ring-2 ring-primary/30">
          <span className="material-symbols-outlined text-primary text-6xl" style={{ fontVariationSettings: "'wght' 600" }}>payments</span>
        </div>
        
        <h2 className="text-3xl font-black tracking-tight text-center mb-4">Avisar al Mesero</h2>
        
        <div className="bg-surface-dark rounded-3xl p-6 border border-white/5 w-full mb-6">
          <div className="flex flex-col items-center text-center">
            <p className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-3">Monto a Pagar</p>
            <p className="text-5xl font-black text-primary tabular-nums mb-4">${formatPrice(amount)}</p>
            {guestName && (
              <p className="text-text-secondary text-sm font-medium">Comensal: {guestName}</p>
            )}
          </div>
        </div>

        <div className="bg-primary/10 rounded-2xl p-6 border border-primary/20 w-full">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined text-primary text-2xl font-black">restaurant</span>
            <div className="flex-1">
              <p className="text-white font-black text-base leading-relaxed mb-2">
                Realiza el pago al mesero.
              </p>
              <p className="text-text-secondary text-sm leading-relaxed">
                Una vez confirmado tu pago, el mesero marcará tu parte como pagada.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-40">
        <div className="bg-surface-dark rounded-2xl p-5 border border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
            <p className="text-white font-bold text-sm">¿Cómo funciona?</p>
          </div>
          <ul className="space-y-2 text-text-secondary text-sm pl-9">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Solicita al mesero pagar tu parte de la cuenta</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Entrega el monto exacto: ${formatPrice(amount)}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>El mesero confirmará el pago en el sistema</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Tu estado se actualizará automáticamente</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CashPaymentView;

