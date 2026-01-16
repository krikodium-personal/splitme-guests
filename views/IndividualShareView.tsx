
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Guest, OrderItem, MenuItem } from '../types';
import { formatPrice } from './MenuView';
import { supabase } from '../lib/supabase';

interface IndividualShareViewProps {
  onBack: () => void;
  onPay: (paymentData: { amount: number, method: string }) => Promise<void>;
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
  const location = useLocation();
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'transfer' | 'cash'>('mercadopago');
  const [isProcessing, setIsProcessing] = useState(false);

  // Obtener guestId de la URL si existe, sino usar el primer guest o '1' como default
  const targetGuestId = useMemo(() => {
    const urlParams = new URLSearchParams(location.search);
    const guestIdFromUrl = urlParams.get('guestId');
    if (guestIdFromUrl) {
      return guestIdFromUrl;
    }
    // Si no hay guestId en la URL, usar el primer guest disponible
    if (guests.length > 0) {
      return guests[0].id;
    }
    return '1';
  }, [location.search, guests]);

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
    console.log('[IndividualShareView] Calculando subtotal para guestId:', targetGuestId);
    console.log('[IndividualShareView] targetGuest:', targetGuest);
    console.log('[IndividualShareView] targetGuest.individualAmount:', targetGuest?.individualAmount);
    console.log('[IndividualShareView] splitData:', splitData);
    console.log('[IndividualShareView] myDataFromSplit:', myDataFromSplit);
    console.log('[IndividualShareView] myCartItems:', myCartItems);
    console.log('[IndividualShareView] cart total:', cart.length);
    
    // Primero verificar si el guest tiene individualAmount guardado en BD
    if (targetGuest?.individualAmount !== null && targetGuest?.individualAmount !== undefined) {
      console.log('[IndividualShareView] Usando individualAmount desde BD:', targetGuest.individualAmount);
      return targetGuest.individualAmount;
    }
    
    // Si hay splitData, usar los totales ya calculados
    if (myDataFromSplit?.total) {
      console.log('[IndividualShareView] Usando total desde splitData:', myDataFromSplit.total);
      return myDataFromSplit.total;
    }
    
    // Si no hay splitData ni individualAmount, calcular desde los items del comensal
    const calculated = myCartItems.reduce((sum, item) => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      const itemTotal = menuItem ? Number(menuItem.price) * item.quantity : 0;
      console.log('[IndividualShareView] Item:', item.itemId, 'quantity:', item.quantity, 'price:', menuItem?.price, 'total:', itemTotal);
      return sum + itemTotal;
    }, 0);
    console.log('[IndividualShareView] Subtotal calculado desde items:', calculated);
    return calculated;
  }, [targetGuest, myDataFromSplit, myCartItems, menuItems, targetGuestId, splitData, cart.length]);

  const finalTotal = subtotal;

  const handleProcessPayment = async () => {
    if (isProcessing) return;
    
    // Si es transferencia, mostrar vista de transferencia con el monto final (NO actualizar payment_method todavía)
    if (paymentMethod === 'transfer' && onShowTransfer) {
      onShowTransfer(Number(finalTotal.toFixed(2)));
      return;
    }
    
    // GUARDAR el método de pago cuando el usuario hace click en el CTA (solo para efectivo y mercadopago)
    if (onUpdatePaymentMethod && paymentMethod !== 'transfer') {
      await onUpdatePaymentMethod(targetGuestId, paymentMethod);
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
          method: paymentMethod
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
          <div className="bg-surface-dark rounded-3xl p-5 border border-white/5">
             <div className="flex justify-between items-center">
                <span className="text-text-secondary font-medium text-sm">Consumos asignados</span>
                <span className="text-xl font-black text-primary tabular-nums">${formatPrice(finalTotal)}</span>
             </div>
          </div>
        </section>

        {/* Pasarela de Pago */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary mb-4 px-1">Método de Pago</h3>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => setPaymentMethod('mercadopago')}
              disabled={isProcessing}
              className={`relative flex items-center justify-between gap-4 rounded-2xl p-5 border-2 transition-all cursor-pointer ${
                paymentMethod === 'mercadopago' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="bg-white p-2 rounded-xl shrink-0">
                   <img src="/mercadopago-icon.png" className="h-4 object-contain" alt="MP" />
              </div>
              <div className="text-left">
                <p className="font-black text-sm leading-none mb-1 uppercase tracking-tight">Mercado Pago</p>
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Wallet / Tarjetas</p>
                </div>
              </div>
              {paymentMethod === 'mercadopago' && <span className="material-symbols-outlined text-primary font-black filled shrink-0">check_circle</span>}
            </button>

            <button 
              onClick={() => setPaymentMethod('transfer')}
              disabled={isProcessing}
              className={`relative flex items-center justify-between gap-4 rounded-2xl p-5 border-2 transition-all cursor-pointer ${
                paymentMethod === 'transfer' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2 rounded-xl shrink-0">
                   <span className="material-symbols-outlined text-white text-2xl">account_balance</span>
              </div>
              <div className="text-left">
                <p className="font-black text-sm leading-none mb-1 uppercase tracking-tight">Transferencia</p>
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Alias / CBU</p>
                </div>
              </div>
              {paymentMethod === 'transfer' && <span className="material-symbols-outlined text-primary font-black filled shrink-0">check_circle</span>}
            </button>

            <button 
              onClick={() => setPaymentMethod('cash')}
              disabled={isProcessing}
              className={`relative flex items-center justify-between gap-4 rounded-2xl p-5 border-2 transition-all cursor-pointer ${
                paymentMethod === 'cash' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2 rounded-xl shrink-0">
                   <span className="material-symbols-outlined text-white text-2xl">payments</span>
                </div>
                <div className="text-left">
                  <p className="font-black text-sm leading-none mb-1 uppercase tracking-tight">Efectivo</p>
                  <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Pagar al mesero</p>
                </div>
              </div>
              {paymentMethod === 'cash' && <span className="material-symbols-outlined text-primary font-black filled shrink-0">check_circle</span>}
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
