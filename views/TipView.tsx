import React, { useState, useMemo } from 'react';
import { OrderItem, MenuItem } from '../types';
import { formatPrice } from './MenuView';

interface TipViewProps {
  onNext: () => void;
  onSkip?: () => void;
  cart: OrderItem[];
  menuItems: MenuItem[];
  /** Monto pagado por el comensal actual (individual). Si no se pasa, se calcula desde cart filtrando por currentGuestId. */
  guestPaidAmount?: number | null;
  /** ID del comensal actual para fallback cuando guestPaidAmount no está disponible. */
  currentGuestId?: string | null;
  waiter?: any;
  restaurant?: any;
}

const TipView: React.FC<TipViewProps> = ({ onNext, onSkip, cart, menuItems, guestPaidAmount, currentGuestId, waiter }) => {
  const [tipPercentage, setTipPercentage] = useState<number>(10);

  const orderTotal = useMemo(() => {
    if (guestPaidAmount != null && guestPaidAmount > 0) return guestPaidAmount;
    const itemsToSum = currentGuestId ? cart.filter(i => i.guestId === currentGuestId) : cart;
    return itemsToSum.reduce((sum, item) => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      const unitPrice = item.unitPrice ?? (menuItem?.price ?? 0);
      return sum + unitPrice * item.quantity;
    }, 0);
  }, [cart, menuItems, guestPaidAmount, currentGuestId]);

  const tipAmount = useMemo(() => (orderTotal * tipPercentage) / 100, [orderTotal, tipPercentage]);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => alert('¡Copiado al portapapeles!'))
        .catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        alert('¡Copiado al portapapeles!');
      } catch (e) {}
      document.body.removeChild(ta);
    }
  };

  const waiterAlias = waiter?.alias_tip || waiter?.alias || '';
  const waiterCbu = waiter?.cbu_tip || waiter?.cbu || '';

  return (
    <div className="flex flex-col flex-1 h-screen bg-background-dark text-white overflow-y-auto no-scrollbar">
      <nav className="sticky top-0 z-50 flex items-center justify-between p-4 bg-background-dark/95 backdrop-blur-md border-b border-white/5">
        <div className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer" onClick={onSkip || onNext}>
          <span className="material-symbols-outlined">close</span>
        </div>
        <h1 className="text-sm font-black uppercase tracking-[0.2em] text-text-secondary">Propina</h1>
        {onSkip && (
          <button onClick={onSkip} className="text-gray-400 text-sm font-bold hover:text-primary transition-colors">Omitir</button>
        )}
      </nav>

      <main className="flex-1 px-5 pb-32">
        <div className="py-8 text-center animate-fade-in-up">
          <h2 className="text-2xl font-black leading-tight mb-2 tracking-tight">¿Querés dejar propina?</h2>
          <p className="text-text-secondary text-sm">Tu gesto hace la diferencia para quien te atendió.</p>
        </div>

        {/* Selector de porcentaje */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary">tips_and_updates</span>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">Elegí el monto</h3>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[
              { label: 'Ninguna', value: 0 },
              { label: '5%', value: 5 },
              { label: '10%', value: 10, badge: 'Sugerida' },
              { label: '15%', value: 15 },
              { label: '20%', value: 20 },
            ].map((t) => (
              <button
                key={t.label}
                onClick={() => setTipPercentage(t.value)}
                className={`relative flex h-14 flex-col items-center justify-center rounded-2xl border transition-all active:scale-95 ${
                  tipPercentage === t.value
                    ? 'bg-primary border-primary text-black font-black shadow-lg shadow-primary/20'
                    : 'bg-surface-dark border-white/5 text-white/40 font-bold hover:border-white/20'
                }`}
              >
                <span className="text-[11px] uppercase tracking-tighter">{t.label}</span>
                {t.badge && (
                  <div className="absolute -top-2 rounded-full bg-white px-2 py-0.5 text-[7px] font-black text-black shadow-lg uppercase tracking-tighter">
                    {t.badge}
                  </div>
                )}
              </button>
            ))}
          </div>
          {tipPercentage > 0 && (
            <div className="bg-surface-dark rounded-2xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-text-secondary text-sm font-medium">Total pagado por vos</span>
                <span className="font-bold price-amount">${formatPrice(orderTotal)}</span>
              </div>
              <div className="flex justify-between items-center mb-3 pb-3 border-b border-white/10">
                <span className="text-text-secondary text-sm font-medium">Propina ({tipPercentage}%)</span>
                <span className="font-bold price-amount text-primary">${formatPrice(tipAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white font-black uppercase text-[10px] tracking-widest">Total con propina</span>
                <span className="text-xl font-black text-primary price-amount">${formatPrice(orderTotal + tipAmount)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Datos del mesero para transferencia o efectivo */}
        {waiter && tipPercentage > 0 && (
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2 mb-4 px-1">
              <span className="material-symbols-outlined text-primary">person</span>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
                Datos de {waiter?.nickname || waiter?.full_name || 'tu mesero'}
              </h3>
            </div>
            <div className="bg-surface-dark rounded-[2rem] p-6 border border-white/5 flex flex-col items-center gap-5 shadow-lg">
              <div className="relative shrink-0">
                <img
                  alt={waiter?.nickname || 'Mesero'}
                  className="size-20 rounded-full object-cover border-4 border-primary/30 relative z-10"
                  src={waiter?.profile_photo_url || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyiwOtsINFh8RspVDg_Wx4QKXthNxCS7ZJlDSZvL6ADwFD3WRUpKHGhrscxV9dcR7w7guM4E-iFCNXx-tDgHs1BrbfGjolJoASehM-SEc4Pe6bKEx7zjcF4WAcON7mbdWJCepEdMPkBZ36lB_4tPTsJeNzTNqRNGKgusVb3U_X0WGEAgij6Y48HIunhj_BC8lxMdsB5ublmAltnyYerUKa_NkT8aybLFkaaRkQGQ_irdtS2ZQwrNGNj6b1ZrWY1HRClBeExJL615bG'}
                />
              </div>
              <div className="w-full space-y-3">
                {waiterAlias && (
                  <div className="bg-background-dark/50 rounded-2xl p-4 border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-text-secondary text-[10px] font-black uppercase tracking-widest">Alias (transferencia)</p>
                      <button
                        onClick={() => copyToClipboard(waiterAlias)}
                        className="text-primary text-[10px] font-black uppercase tracking-wider hover:opacity-80"
                      >
                        Copiar
                      </button>
                    </div>
                    <p className="text-lg font-black break-all">{waiterAlias}</p>
                  </div>
                )}
                {waiterCbu && !waiterAlias && (
                  <div className="bg-background-dark/50 rounded-2xl p-4 border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-text-secondary text-[10px] font-black uppercase tracking-widest">CBU</p>
                      <button
                        onClick={() => copyToClipboard(waiterCbu)}
                        className="text-primary text-[10px] font-black uppercase tracking-wider hover:opacity-80"
                      >
                        Copiar
                      </button>
                    </div>
                    <p className="text-lg font-black break-all">{waiterCbu}</p>
                  </div>
                )}
                {(!waiterAlias && !waiterCbu) && (
                  <p className="text-text-secondary text-sm text-center py-2">
                    Podés dejar la propina en efectivo directamente a {waiter?.nickname || waiter?.full_name || 'tu mesero'}.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-8 z-20">
        <button
          onClick={onNext}
          className="w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-primary text-black shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl"
        >
          <span>Continuar</span>
          <span className="material-symbols-outlined font-black">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};

export default TipView;
