
import React, { useState, useMemo, useEffect } from 'react';
import { Guest, OrderItem, MenuItem } from '../types';
import { formatPrice } from './MenuView';
import { supabase } from '../lib/supabase';

interface IndividualShareViewProps {
  onBack: () => void;
  onPay: (paymentData: { amount: number, method: string, tip: number }) => Promise<void>;
  onShowTransfer?: (amount: number) => void;
  onShowCash?: (amount: number, guestName: string) => void;
  onUpdatePaymentMethod?: (guestId: string, method: 'mercadopago' | 'transfer' | 'cash') => Promise<boolean>;
  cart: OrderItem[];
  menuItems: MenuItem[];
  splitData: any[] | null;
  restaurant?: any;
  guests?: Guest[];
}

const IndividualShareView: React.FC<IndividualShareViewProps> = ({ onBack, onPay, onShowTransfer, onShowCash, onUpdatePaymentMethod, cart, menuItems, splitData, restaurant, guests = [] }) => {
  const [tipPercentage, setTipPercentage] = useState<number>(15);
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'transfer' | 'cash'>('mercadopago');
  const [isProcessing, setIsProcessing] = useState(false);

  // Obtener guestId de la URL si existe, sino usar '1' como default
  const targetGuestId = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('guestId') || '1';
  }, []);

  // El comensal actual puede venir de la URL o ser el default '1'
  const myDataFromSplit = useMemo(() => {
    return splitData?.find(s => s.id === targetGuestId);
  }, [splitData, targetGuestId]);

  const myCartItems = useMemo(() => {
    return cart.filter(item => item.guestId === targetGuestId);
  }, [cart, targetGuestId]);

  // Obtener información del comensal
  const targetGuest = useMemo(() => {
    return guests.find(g => g.id === targetGuestId);
  }, [guests, targetGuestId]);

  const guestName = targetGuest?.name || 'Comensal';

  // Calcular subtotal: prioridad individualAmount desde BD, luego splitData, luego calcular desde items
  const subtotal = useMemo(() => {
    // Primero verificar si el guest tiene individualAmount guardado en BD
    if (targetGuest?.individualAmount !== null && targetGuest?.individualAmount !== undefined) {
      return targetGuest.individualAmount;
    }
    
    // Si hay splitData, usar los totales ya calculados
    if (myDataFromSplit?.total) {
      return myDataFromSplit.total;
    }
    
    // Si no hay splitData ni individualAmount, calcular desde los items del comensal
    return myCartItems.reduce((sum, item) => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      return sum + (menuItem ? Number(menuItem.price) * item.quantity : 0);
    }, 0);
  }, [targetGuest, myDataFromSplit, myCartItems, menuItems]);

  const tipAmount = useMemo(() => (subtotal * tipPercentage) / 100, [subtotal, tipPercentage]);
  const finalTotal = useMemo(() => subtotal + tipAmount, [subtotal, tipAmount]);

  const handleProcessPayment = async () => {
    if (isProcessing) return;
    
    // GUARDAR el método de pago cuando el usuario hace click en el CTA
    if (onUpdatePaymentMethod) {
      await onUpdatePaymentMethod(targetGuestId, paymentMethod);
    }
    
    // Si es transferencia, mostrar vista de transferencia con el monto final
    if (paymentMethod === 'transfer' && onShowTransfer) {
      onShowTransfer(Number(finalTotal.toFixed(2)));
      return;
    }
    
    // Si es efectivo, mostrar vista de efectivo con el monto final y nombre del comensal
    if (paymentMethod === 'cash' && onShowCash) {
      onShowCash(Number(finalTotal.toFixed(2)), guestName);
      return;
    }
    
    // Para Mercado Pago, procesar el pago normalmente
    if (paymentMethod === 'mercadopago') {
      setIsProcessing(true);
      try {
        await onPay({
          amount: Number(finalTotal.toFixed(2)),
          method: paymentMethod,
          tip: Number(tipAmount.toFixed(2))
        });
      } catch (error) {
        console.error("Error al iniciar pago:", error);
        alert("Hubo un error al conectar con Mercado Pago. Intenta nuevamente.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Obtener el texto del CTA según el método de pago
  const getCTAButtonText = () => {
    switch (paymentMethod) {
      case 'transfer':
        return 'Ver instrucciones';
      case 'cash':
        return 'Avisar al mesero';
      default:
        return 'Pagar Ahora';
    }
  };

  const tips = [
    { label: 'Ninguna', value: 0 },
    { label: '10%', value: 10 },
    { label: '15%', value: 15, badge: 'Sugerida' },
    { label: '20%', value: 20 },
    { label: 'Custom', value: 25 },
  ];

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-40 bg-background-dark text-white font-display antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background-dark/90 px-4 py-4 backdrop-blur-md border-b border-white/5">
        <button onClick={onBack} disabled={isProcessing} className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold leading-tight">{guestName}</h1>
        <div className="size-10"></div>
      </header>

      <div className="flex flex-col items-center justify-center pt-8 pb-10 animate-fade-in-up">
        <div className="text-text-secondary text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-60">Monto total a pagar</div>
        <h2 className="text-5xl font-black tracking-tighter tabular-nums">${formatPrice(finalTotal)}</h2>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 border border-primary/20">
          <span className="material-symbols-outlined text-primary text-sm font-black filled">verified_user</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-primary">Transacción Segura</span>
        </div>
      </div>

      <div className="px-5 space-y-8">
        {/* Desglose resumido */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="bg-surface-dark rounded-3xl p-5 border border-white/5 space-y-3">
             <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary font-medium">Consumos asignados</span>
                <span className="font-bold tabular-nums">${formatPrice(subtotal)}</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary font-medium">Propina seleccionada</span>
                <span className="font-bold tabular-nums">${formatPrice(tipAmount)}</span>
             </div>
             <div className="pt-3 mt-3 border-t border-white/10 flex justify-between items-center">
                <span className="text-white font-black uppercase text-[10px] tracking-widest">Total a Confirmar</span>
                <span className="text-xl font-black text-primary tabular-nums">${formatPrice(finalTotal)}</span>
             </div>
          </div>
        </section>

        {/* Propina Selector */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary mb-4 px-1">Dejar Propina</h3>
          <div className="grid grid-cols-5 gap-2">
            {tips.map((t) => (
              <button 
                key={t.label} 
                onClick={() => setTipPercentage(t.value)}
                disabled={isProcessing}
                className={`relative flex h-14 flex-col items-center justify-center rounded-2xl border transition-all active:scale-95 ${
                  tipPercentage === t.value 
                  ? 'bg-primary border-primary text-background-dark font-black shadow-lg shadow-primary/20' 
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
        </section>

        {/* Pasarela de Pago */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary mb-4 px-1">Método de Pago</h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
            <button 
              onClick={() => setPaymentMethod('mercadopago')}
              disabled={isProcessing}
              className={`relative flex min-w-[200px] flex-col gap-5 rounded-3xl p-6 border-2 transition-all cursor-pointer ${
                paymentMethod === 'mercadopago' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-transparent opacity-40 hover:opacity-70'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="bg-white p-2 rounded-xl">
                   <img src="/mercadopago-icon.png" className="h-4 object-contain" alt="MP" />
                </div>
                {paymentMethod === 'mercadopago' && <span className="material-symbols-outlined text-primary font-black filled">check_circle</span>}
              </div>
              <div className="text-left">
                <p className="font-black text-sm leading-none mb-1 uppercase tracking-tight">Mercado Pago</p>
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Wallet / Tarjetas</p>
              </div>
            </button>

            <button 
              onClick={() => setPaymentMethod('transfer')}
              disabled={isProcessing}
              className={`relative flex min-w-[200px] flex-col gap-5 rounded-3xl p-6 border-2 transition-all cursor-pointer ${
                paymentMethod === 'transfer' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-transparent opacity-40 hover:opacity-70'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="bg-white/10 p-2 rounded-xl">
                   <span className="material-symbols-outlined text-white text-2xl">account_balance</span>
                </div>
                {paymentMethod === 'transfer' && <span className="material-symbols-outlined text-primary font-black filled">check_circle</span>}
              </div>
              <div className="text-left">
                <p className="font-black text-sm leading-none mb-1 uppercase tracking-tight">Transferencia</p>
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Alias / CBU</p>
              </div>
            </button>

            <button 
              onClick={() => setPaymentMethod('cash')}
              disabled={isProcessing}
              className={`relative flex min-w-[200px] flex-col gap-5 rounded-3xl p-6 border-2 transition-all cursor-pointer ${
                paymentMethod === 'cash' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-transparent opacity-40 hover:opacity-70'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="bg-white/10 p-2 rounded-xl">
                   <span className="material-symbols-outlined text-white text-2xl">payments</span>
                </div>
                {paymentMethod === 'cash' && <span className="material-symbols-outlined text-primary font-black filled">check_circle</span>}
              </div>
              <div className="text-left">
                <p className="font-black text-sm leading-none mb-1 uppercase tracking-tight">Efectivo</p>
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Pagar al mesero</p>
              </div>
            </button>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 z-50 w-full border-t border-white/5 bg-background-dark/95 backdrop-blur-xl p-6 pb-10 shadow-[0_-10px_50px_rgba(0,0,0,0.6)]">
        <button 
          onClick={handleProcessPayment}
          disabled={isProcessing}
          className={`group relative flex w-full items-center justify-center gap-3 rounded-2xl h-16 transition-all shadow-xl ${
            isProcessing ? 'bg-white/5 grayscale cursor-not-allowed border border-white/10' : 'bg-primary hover:scale-[1.02] active:scale-[0.98] shadow-primary/20'
          }`}
        >
          {isProcessing ? (
            <div className="flex items-center gap-3">
              <div className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span className="text-sm font-black text-white uppercase tracking-widest">Abriendo Checkout...</span>
            </div>
          ) : (
            <>
              <span className="text-xl font-black text-background-dark uppercase tracking-tighter">{getCTAButtonText()}</span>
              <span className="material-symbols-outlined text-background-dark font-black group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default IndividualShareView;
