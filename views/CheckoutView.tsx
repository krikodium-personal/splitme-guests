
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { OrderItem, Guest, MenuItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';
import { supabase } from '../lib/supabase';

interface CheckoutViewProps {
  onBack: () => void;
  onConfirm: (guestId?: string) => void;
  onNavigateToTip?: () => void;
  cart: OrderItem[];
  guests?: Guest[];
  menuItems: MenuItem[];
  tableNumber?: number;
  splitData: any[] | null;
  activeOrderId?: string | null;
  currentGuestId?: string | null;
}

const CheckoutView: React.FC<CheckoutViewProps> = ({ onBack, onConfirm, onNavigateToTip, cart, guests = [], menuItems, tableNumber, splitData, activeOrderId, currentGuestId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showQr, setShowQr] = useState(false);
  const [localGuests, setLocalGuests] = useState<Guest[]>(guests);
  const channelRef = useRef<any>(null);

  // Redirigir a /individual-share si hay un guestId en la URL
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const guestIdFromUrl = urlParams.get('guestId');
    const orderIdFromUrl = urlParams.get('orderId');
    
    // Si hay un guestId en la URL y un orderId, redirigir a /individual-share
    if (guestIdFromUrl && orderIdFromUrl && activeOrderId) {
      console.log('[CheckoutView] Redirigiendo a /individual-share con guestId:', guestIdFromUrl);
      navigate(`/individual-share?orderId=${orderIdFromUrl}&guestId=${guestIdFromUrl}`, { replace: true });
      return;
    }
  }, [location.search, activeOrderId, navigate]);

  // Sincronizar localGuests cuando guests cambian
  useEffect(() => {
    setLocalGuests(guests);
  }, [guests]);

  // Suscripción Realtime para escuchar cambios en order_guests.paid
  useEffect(() => {
    if (!activeOrderId || !supabase) return;

    console.log('[CheckoutView] Iniciando suscripción Realtime para order_guests, order_id:', activeOrderId);

    // Verificar estado inicial de los guests
    const checkInitialPaidStatus = async () => {
      const { data: orderGuests, error } = await supabase
        .from('order_guests')
        .select('id, paid, payment_method')
        .eq('order_id', activeOrderId);

      if (error) {
        console.error('[CheckoutView] Error al verificar estado inicial:', error);
        return;
      }

      if (orderGuests && orderGuests.length > 0) {
        console.log('[CheckoutView] Estado inicial de guests:', orderGuests);
        setLocalGuests(prev => prev.map(g => {
          const dbGuest = orderGuests.find(og => og.id === g.id);
          if (dbGuest) {
            return { 
              ...g, 
              paid: dbGuest.paid === true, 
              payment_method: dbGuest.payment_method 
            };
          }
          return g;
        }));
      }
    };

    checkInitialPaidStatus();

    const channel = supabase
      .channel(`checkout-payment-status-${activeOrderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_guests',
          filter: `order_id=eq.${activeOrderId}`
        },
        (payload) => {
          console.log('[CheckoutView] ✅ Cambio detectado en order_guests:', payload.new);
          const updatedGuest = payload.new;
          
          // Actualizar el guest en localGuests
          setLocalGuests(prev => {
            const updated = prev.map(g => 
              g.id === updatedGuest.id 
                ? { ...g, paid: updatedGuest.paid === true, payment_method: updatedGuest.payment_method }
                : g
            );
            console.log('[CheckoutView] Guests actualizados:', updated);
            return updated;
          });
        }
      )
      .subscribe((status) => {
        console.log('[CheckoutView] Estado de suscripción Realtime:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[CheckoutView] ✅ Suscripción activa, escuchando cambios en order_guests');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log('[CheckoutView] Limpiando suscripción Realtime');
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [activeOrderId]);

  // Total global de la mesa (precios ya incluyen impuestos)
  const grandTotal = useMemo(() => cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? menuItem.price * item.quantity : 0);
  }, 0), [cart, menuItems]);

  // Identificar al usuario actual (prioridad: currentGuestId de URL > host > primer guest)
  const currentUserGuest = useMemo(() => {
    // Si hay un currentGuestId (viene de la URL), usar ese guest
    if (currentGuestId) {
      const guestFromUrl = localGuests.find(g => g.id === currentGuestId);
      if (guestFromUrl) {
        console.log('[CheckoutView] Usuario actual desde URL:', guestFromUrl.id, guestFromUrl.name);
        return guestFromUrl;
      }
    }
    // Si no, buscar el host
    const host = localGuests.find(g => g.isHost);
    if (host) {
      console.log('[CheckoutView] Usuario actual (host):', host.id, host.name);
      return host;
    }
    // Si no hay host, usar el primer guest
    const firstGuest = localGuests.length > 0 ? localGuests[0] : null;
    if (firstGuest) {
      console.log('[CheckoutView] Usuario actual (primer guest):', firstGuest.id, firstGuest.name);
    }
    return firstGuest;
  }, [localGuests, currentGuestId]);

  const currentUserId = currentGuestId || currentUserGuest?.id || '';
  console.log('[CheckoutView] currentGuestId:', currentGuestId, 'currentUserId:', currentUserId);

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
  // Usar localGuests en lugar de guests para reflejar los cambios en tiempo real
  // Filtrar para mostrar solo comensales con monto > 0 (los que están seleccionados para pagar)
  const dinerShares = useMemo(() => {
    let shares: any[] = [];
    
    if (splitData) {
      shares = splitData.map((share) => {
        const guest = localGuests.find(g => g.id === share.id);
        return {
        ...share,
          ...guest,
          status: share.id === currentUserId ? 'PENDIENTE' : 'IMPAGADO',
        amount: share.total 
        };
      });
    } else {
      const perGuest = grandTotal / (localGuests.length || 1);
      shares = localGuests.map((guest) => ({
        ...guest,
        amount: perGuest,
        status: guest.id === currentUserId ? 'PENDIENTE' : 'IMPAGADO'
      }));
    }
    
    // Filtrar solo comensales con monto > 0 (excluir los que no pagan)
    return shares.filter(diner => (diner.amount || 0) > 0);
  }, [localGuests, grandTotal, splitData, currentUserId]);

  // Verificar si el usuario actual está en la división
  const isCurrentUserInSplit = useMemo(() => {
    return dinerShares.some(d => d.id === currentUserId);
  }, [dinerShares, currentUserId]);

  const myShare = useMemo(() => {
    const me = dinerShares.find(d => d.id === currentUserId);
    return me ? me.amount : (grandTotal / (localGuests.length || 1));
  }, [dinerShares, grandTotal, localGuests.length, currentUserId]);

  // Verificar si el usuario actual ya pagó
  const currentUserPaid = useMemo(() => {
    const guestIdToCheck = currentGuestId || currentUserId;
    const guestToCheck = localGuests.find(g => g.id === guestIdToCheck);
    return guestToCheck?.paid === true || currentUserGuest?.paid === true;
  }, [currentUserGuest, localGuests, currentGuestId, currentUserId]);

  // Verificar si todos los comensales ya pagaron
  const allGuestsPaid = useMemo(() => {
    if (dinerShares.length === 0) return false;
    return dinerShares.every(diner => diner.paid === true);
  }, [dinerShares]);

  // Total ya pagado por comensales con paid=TRUE (para "pagar la cuenta completa" = lo que falta)
  const totalPagadoPorComensales = useMemo(() => 
    dinerShares.filter(d => d.paid === true).reduce((s, d) => s + (Number(d.amount) || 0), 0),
    [dinerShares]
  );
  const remainingToSettle = Math.max(0, grandTotal - totalPagadoPorComensales);

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
        {allGuestsPaid ? (
          <span className="text-[10px] font-black text-green-500 uppercase bg-green-500/10 px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            CUENTA SALDADA
          </span>
        ) : (
          <span className="text-[10px] font-black text-amber-500 uppercase bg-amber-500/10 px-3 py-1 rounded-full">
            PENDIENTE DE COBRO
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3 pb-8">
        {dinerShares.map((diner) => {
          // Determinar si este diner es "yo" (el usuario actual de la sesión)
          // currentUserId ya tiene la prioridad: currentGuestId de URL > host > primer guest
          const isMe = diner.id === currentUserId;
          const isPaid = diner.paid === true;
          
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
                {!isPaid ? (
                <p className="text-xs font-black uppercase tracking-widest text-[#9db9a8]">
                  Debe ${formatPrice(diner.amount)}
                </p>
                ) : (
                  <p className="text-xs font-black uppercase tracking-widest text-[#9db9a8]">
                    Pagado: {diner.payment_method ? getPaymentMethodLabel(diner.payment_method) : 'N/A'}
                  </p>
                )}
                {!isMe && !isPaid && diner.payment_method && (
                  <p className="text-[10px] font-medium text-primary mt-1">
                    {getPaymentMethodLabel(diner.payment_method)}
                  </p>
                )}
              </div>
              
              {!isMe && !isPaid && (
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
        {dinerShares.length === 1 ? (
          currentUserPaid ? (
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const guestIdToUse = currentGuestId || currentUserId || dinerShares[0]?.id;
                if (activeOrderId && guestIdToUse) {
                  if (onNavigateToTip) {
                    onNavigateToTip();
                  } else {
                    navigate(`/cash-payment?orderId=${activeOrderId}&guestId=${guestIdToUse}`);
                  }
                }
              }} 
              className="w-full bg-primary hover:bg-green-400 active:scale-[0.98] text-background-dark font-black text-lg h-16 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary/20 group"
            >
              <span>Finalizar</span>
              <span className="material-symbols-outlined font-black group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          ) : (
            <button 
              onClick={() => {
                const guestIdToUse = dinerShares[0]?.id || currentUserId || localGuests[0]?.id;
                if (guestIdToUse) {
                  onConfirm(guestIdToUse);
                } else {
                  console.error('[CheckoutView] No se puede pagar: no se encontró guestId');
                }
              }} 
              className="w-full bg-primary hover:bg-green-400 active:scale-[0.98] text-background-dark font-black text-lg h-16 rounded-2xl flex items-center justify-between px-8 transition-all shadow-xl shadow-primary/20 group"
            >
              <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-60">Pagar cuenta</span>
                <span className="text-xl tabular-nums">${formatPrice(grandTotal)}</span>
              </div>
              <span className="material-symbols-outlined font-black group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          )
        ) : (
          isCurrentUserInSplit && !currentUserPaid ? (
            <>
              <button 
                onClick={() => {
                  if (currentUserId) {
                    onConfirm(currentUserId);
                  } else {
                    console.error('[CheckoutView] No se puede pagar: currentUserId no está definido');
                  }
                }} 
                className="w-full bg-primary hover:bg-green-400 active:scale-[0.98] text-background-dark font-black text-lg h-16 rounded-2xl flex items-center justify-between px-8 transition-all shadow-xl shadow-primary/20 group"
              >
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] uppercase font-black tracking-widest opacity-60">Pagar mi parte</span>
                  <span className="text-xl tabular-nums">${formatPrice(myShare)}</span>
                </div>
                <span className="material-symbols-outlined font-black group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
              {remainingToSettle > 0 && (
                <button 
                  onClick={() => {
                    if (currentUserId) {
                      onConfirm(currentUserId);
                    } else {
                      console.error('[CheckoutView] No se puede pagar: currentUserId no está definido');
                    }
                  }} 
                  className="w-full flex items-center justify-center text-[#9db9a8] font-bold text-[10px] uppercase tracking-[0.2em] py-2 hover:text-white transition-colors"
                >
                  O pagar la cuenta completa (${formatPrice(remainingToSettle)})
                </button>
              )}
            </>
          ) : null
        )}
      </div>
    </div>
  );
};

export default CheckoutView;
