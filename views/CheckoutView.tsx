
import React, { useMemo, useState } from 'react';
import { OrderItem, Guest, MenuItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';

interface CheckoutViewProps {
  onBack: () => void;
  onConfirm: (guestId?: string) => void;
  cart: OrderItem[];
  guests?: Guest[];
  menuItems: MenuItem[];
  tableNumber?: number;
  splitData: any[] | null;
  activeOrderId?: string | null;
}

const CheckoutView: React.FC<CheckoutViewProps> = ({ onBack, onConfirm, cart, guests = [], menuItems, tableNumber, splitData, activeOrderId }) => {
  const [showQr, setShowQr] = useState(false);

  // Total global de la mesa (precios ya incluyen impuestos)
  const grandTotal = useMemo(() => cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? menuItem.price * item.quantity : 0);
  }, 0), [cart, menuItems]);

  // Identificar al usuario actual (el host o primer guest)
  const currentUserGuest = useMemo(() => {
    // Buscar el host primero
    const host = guests.find(g => g.isHost);
    if (host) return host;
    // Si no hay host, usar el primer guest
    return guests.length > 0 ? guests[0] : null;
  }, [guests]);

  const currentUserId = currentUserGuest?.id || '';

  // Función para formatear el nombre del método de pago
  const getPaymentMethodLabel = (method: string | null | undefined): string => {
    if (!method) return '';
    switch (method.toLowerCase()) {
      case 'mercadopago':
        return 'Mercado Pago';
      case 'transferencia':
        return 'Transferencia';
      case 'efectivo':
        return 'Efectivo';
      default:
        return method;
    }
  };

  // Mapeo de comensales con sus montos exactos y estado inicial "Impagado"
  const dinerShares = useMemo(() => {
    if (splitData) {
      return splitData.map((share) => {
        const guest = guests.find(g => g.id === share.id);
        return {
          ...share,
          ...guest,
          status: share.id === currentUserId ? 'PENDIENTE' : 'IMPAGADO',
          amount: share.total 
        };
      });
    }
    
    const perGuest = grandTotal / (guests.length || 1);
    return guests.map((guest) => ({
      ...guest,
      amount: perGuest,
      status: guest.id === currentUserId ? 'PENDIENTE' : 'IMPAGADO'
    }));
  }, [guests, grandTotal, splitData, currentUserId]);

  const myShare = useMemo(() => {
    const me = dinerShares.find(d => d.id === currentUserId);
    return me ? me.amount : (grandTotal / (guests.length || 1));
  }, [dinerShares, grandTotal, guests.length, currentUserId]);

  // Se asegura una URL absoluta válida y limpia
  const shareUrl = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return url.origin + url.pathname + url.search;
    } catch (e) {
      return window.location.origin + '/';
    }
  }, []);

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => alert('Enlace de cobro copiado al portapapeles'))
        .catch(err => {
          console.error("Error al copiar:", err);
          fallbackCopyTextToClipboard(text);
        });
    } else {
      fallbackCopyTextToClipboard(text);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed"; 
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      alert('Enlace de cobro copiado al portapapeles');
    } catch (err) {
      console.error('Fallback: Error al copiar', err);
    }
    document.body.removeChild(textArea);
  };

  const handleSharePayment = async (guestName: string, amount: number, guestId: string) => {
    // Crear URL con parámetros para identificar el comensal y la orden
    const orderIdToUse = activeOrderId || cart[0]?.order_id || '';
    const shareUrlWithGuest = orderIdToUse 
      ? `${shareUrl.split('?')[0]}?orderId=${orderIdToUse}&guestId=${guestId}`
      : `${shareUrl.split('?')[0]}?guestId=${guestId}`;
    const text = `¡Hola ${guestName}! Esta es tu parte de la cuenta en SplitMe: $${formatPrice(amount)}. Puedes pagar aquí: ${shareUrlWithGuest}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SplitMe - Pagar mi parte',
          text: text,
          url: shareUrlWithGuest,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Error al compartir:", err);
          copyToClipboard(text);
        }
      }
    } else {
      copyToClipboard(text);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-background-dark overflow-hidden pb-32 font-display text-white antialiased">
      <div className="flex items-center px-4 pt-6 pb-2 justify-between z-10 sticky top-0 bg-background-dark/80 backdrop-blur-md">
        <button onClick={onBack} className="text-white flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-white text-lg font-bold leading-tight flex-1 text-center pr-10">Confirmación</h2>
      </div>

      <div className="flex flex-col items-center justify-center pt-6 pb-4 animate-fade-in-up">
        <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 ring-1 ring-primary/50 shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'wght' 600" }}>check</span>
        </div>
        <h2 className="text-white tracking-tight text-[28px] font-bold leading-tight px-4 text-center">¡División Lista!</h2>
        <p className="text-[#9db9a8] text-sm mt-1">Orden #4829 • Mesa {tableNumber || '--'}</p>
      </div>

      <div className="px-4 py-3">
        <div className="w-full flex flex-col gap-1 rounded-2xl bg-surface-dark border border-[#3b5445] p-6 items-center text-center shadow-lg">
          <p className="text-white tracking-tighter text-4xl font-black leading-tight">${formatPrice(grandTotal)}</p>
          <div className="flex items-center gap-1.5 opacity-60">
            <span className="material-symbols-outlined text-sm">receipt_long</span>
            <p className="text-sm font-bold uppercase tracking-widest">Total de la Mesa</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-2">
        <div 
          onClick={() => setShowQr(!showQr)}
          className={`w-full rounded-2xl bg-gradient-to-br from-[#1c3024] to-[#13241b] border border-[#3b5445] p-4 flex flex-col transition-all duration-300 shadow-md cursor-pointer ${showQr ? 'gap-6' : 'gap-0'}`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-xl shrink-0">
                <span className="material-symbols-outlined text-black text-2xl font-bold">qr_code_2</span>
              </div>
              <div className="flex flex-col">
                <span className="text-white font-bold text-sm">QR de Pago Grupal</span>
                <span className="text-[#9db9a8] text-xs">Muestra esto para que otros paguen</span>
              </div>
            </div>
            <span className={`material-symbols-outlined text-primary transition-transform duration-300 ${showQr ? 'rotate-180' : ''}`}>expand_more</span>
          </div>

          {showQr && (
            <div className="flex flex-col items-center animate-fade-in pb-2">
              <div className="bg-white p-4 rounded-3xl shadow-2xl">
                {(() => {
                  // Generar URL solo con orderId (sin guestId) para que el usuario seleccione su nombre
                  const orderIdToUse = activeOrderId || cart[0]?.order_id || '';
                  const qrUrl = orderIdToUse 
                    ? `${shareUrl.split('?')[0]}?orderId=${orderIdToUse}`
                    : shareUrl.split('?')[0];
                  return (
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}&color=102217`} 
                      alt="Mesa QR" 
                      className="w-40 h-40"
                    />
                  );
                })()}
              </div>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-4">Escanea para pagar tu parte</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-6">
        <h3 className="text-white text-lg font-bold leading-tight">Estado de Pagos</h3>
        <span className="text-[10px] font-black text-amber-500 uppercase bg-amber-500/10 px-3 py-1 rounded-full">
          PENDIENTE DE COBRO
        </span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3 pb-8">
        {dinerShares.map((diner) => {
          const isMe = diner.id === currentUserId;
          const isPaid = diner.status === 'PAGADO';
          
          return (
            <div key={diner.id} className={`flex items-center p-3 rounded-2xl bg-surface-dark border border-[#3b5445]/50 shadow-sm transition-all ${isPaid ? 'opacity-40 grayscale-[0.5]' : 'border-white/5'}`}>
              <div className="relative">
                <div className={`size-12 rounded-full flex items-center justify-center border-2 shadow-inner transition-colors ${isMe ? 'border-primary' : 'border-transparent'} ${getGuestColor(diner.id)}`}>
                  <span className="text-sm font-black text-white">{getInitials(diner.name)}</span>
                </div>
                {isMe && <div className="absolute -bottom-1 -right-1 bg-primary text-[10px] text-black font-black px-1.5 py-0.5 rounded-full border-2 border-surface-dark uppercase tracking-tighter">Tú</div>}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-white font-bold truncate">{isMe ? 'Tú' : diner.name}</p>
                <p className="text-xs font-black uppercase tracking-widest text-[#9db9a8]">
                  Debe ${formatPrice(diner.amount)}
                </p>
                {!isMe && diner.payment_method && (
                  <p className="text-[10px] font-medium text-primary mt-1">
                    {getPaymentMethodLabel(diner.payment_method)}
                  </p>
                )}
              </div>
              
              {!isMe && (
                <button 
                  onClick={() => handleSharePayment(diner.name, diner.amount, diner.id)}
                  className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-text-secondary active:scale-90 transition-all hover:bg-primary/20 hover:text-primary border border-white/5"
                >
                  <span className="material-symbols-outlined text-[20px]">ios_share</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-background-dark border-t border-[#2a3c32] p-4 flex flex-col gap-3 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-50">
        <button 
          onClick={() => onConfirm(currentUserId)} 
          className="w-full bg-primary hover:bg-green-400 active:scale-[0.98] text-background-dark font-black text-lg h-16 rounded-2xl flex items-center justify-between px-8 transition-all shadow-xl shadow-primary/20 group"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-[10px] uppercase font-black tracking-widest opacity-60">Pagar mi parte</span>
            <span className="text-xl tabular-nums">${formatPrice(myShare)}</span>
          </div>
          <span className="material-symbols-outlined font-black group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </button>
        <button 
          onClick={() => onConfirm(currentUserId)} 
          className="w-full flex items-center justify-center text-[#9db9a8] font-bold text-[10px] uppercase tracking-[0.2em] py-2 hover:text-white transition-colors"
        >
          O pagar la cuenta completa (${formatPrice(grandTotal)})
        </button>
      </div>
    </div>
  );
};

export default CheckoutView;
