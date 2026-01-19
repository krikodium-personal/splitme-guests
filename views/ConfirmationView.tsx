import React, { useState, useEffect, useMemo } from 'react';
import { Guest } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';
import { supabase } from '../lib/supabase';
import { clearSession } from '../lib/sessionCookies';

interface ConfirmationViewProps {
  onRestart: () => void;
  onBackToStart?: () => void;
  guests?: Guest[];
  tableNumber?: number;
  activeOrderId?: string | null;
  currentGuestId?: string | null;
}

const ConfirmationView: React.FC<ConfirmationViewProps> = ({ onRestart, onBackToStart, guests = [], tableNumber, activeOrderId, currentGuestId }) => {
  const [loadedGuests, setLoadedGuests] = useState<Guest[]>(guests);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar guests desde la base de datos si no se pasaron como prop y hay activeOrderId
  useEffect(() => {
    const loadGuestsFromDB = async () => {
      // Si ya hay guests pasados como prop, usarlos
      if (guests.length > 0) {
        setLoadedGuests(guests);
        return;
      }

      // Si no hay guests pero hay activeOrderId, cargarlos desde la DB
      if (activeOrderId && supabase) {
        setIsLoading(true);
        try {
          const { data: orderGuests, error } = await supabase
            .from('order_guests')
            .select('*')
            .eq('order_id', activeOrderId)
            .order('position', { ascending: true });

          if (error) {
            console.error('[ConfirmationView] Error al cargar guests:', error);
            setIsLoading(false);
            return;
          }

          if (orderGuests && orderGuests.length > 0) {
            const guestsFromDB: Guest[] = orderGuests.map(og => ({
              id: og.id,
              name: og.name,
              isHost: og.is_host || false,
              individualAmount: og.individual_amount || null,
              paid: og.paid === true,
              payment_method: og.payment_method || null
            }));
            setLoadedGuests(guestsFromDB);
            console.log('[ConfirmationView] Guests cargados desde DB:', guestsFromDB);
          }
        } catch (error) {
          console.error('[ConfirmationView] Error al cargar guests:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadGuestsFromDB();
  }, [guests, activeOrderId]);

  // Suscripción real-time para actualizar el estado de pago
  useEffect(() => {
    if (!activeOrderId || !supabase || loadedGuests.length === 0) return;

    const channel = supabase
      .channel(`confirmation-payment-status-${activeOrderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_guests',
          filter: `order_id=eq.${activeOrderId}`
        },
        (payload) => {
          console.log('[ConfirmationView] Cambio detectado en order_guests:', payload.new);
          const updatedGuest = payload.new;
          setLoadedGuests(prev => prev.map(g => 
            g.id === updatedGuest.id 
              ? { ...g, paid: updatedGuest.paid === true, payment_method: updatedGuest.payment_method }
              : g
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId, loadedGuests.length]);

  const allDiners = loadedGuests.length > 0 ? loadedGuests : guests.length > 0 ? guests : [
    { id: '1', name: 'Tú' },
    { id: '2', name: 'Mark' },
    { id: '3', name: 'Sarah' }
  ];

  // Filtrar solo comensales con monto > 0 (excluir los que no pagan)
  const dinerShares = useMemo(() => {
    return allDiners.filter(guest => (guest.individualAmount || 0) > 0);
  }, [allDiners]);

  // Verificar si todos los guests que deben pagar (monto > 0) han pagado
  const allGuestsPaid = useMemo(() => {
    if (dinerShares.length === 0) return false;
    return dinerShares.every(guest => guest.paid === true);
  }, [dinerShares]);
  
  // Verificar si el usuario actual pagó (solo si tiene monto > 0)
  const currentUserPaid = useMemo(() => {
    const currentUser = dinerShares.find(g => g.isHost || g.id === currentGuestId);
    return currentUser?.paid === true;
  }, [dinerShares, currentGuestId]);

  // Generar URL para compartir
  const shareUrl = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return url.origin + url.pathname;
    } catch (e) {
      return window.location.origin + '/';
    }
  }, []);

  // Función para copiar al portapapeles
  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => alert('Enlace de cobro copiado al portapapeles'))
        .catch(err => {
          console.error("Error al copiar:", err);
        });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        alert('Enlace de cobro copiado al portapapeles');
      } catch (err) {
        console.error('Error al copiar', err);
      }
      document.body.removeChild(textArea);
    }
  };

  // Función para compartir el link de pago
  const handleSharePayment = async (guestName: string, amount: number, guestId: string) => {
    const orderIdToUse = activeOrderId || '';
    const shareUrlWithGuest = orderIdToUse 
      ? `${shareUrl}?orderId=${orderIdToUse}&guestId=${guestId}`
      : `${shareUrl}?guestId=${guestId}`;
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
    <div className="relative flex min-h-screen w-full flex-col max-w-md mx-auto bg-background-light dark:bg-background-dark overflow-hidden pb-32">
      <div className="flex items-center px-4 pt-6 pb-2 justify-between z-10 sticky top-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
        <button onClick={onRestart} className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-white/10 transition-colors"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold flex-1 text-center pr-10">Estado de Cuenta</h2>
      </div>

      <div className="flex flex-col items-center justify-center pt-6 pb-4 animate-fade-in-up">
        {allGuestsPaid ? (
          <>
            <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 ring-1 ring-primary/50 shadow-lg shadow-primary/20"><span className="material-symbols-outlined text-primary text-4xl filled" style={{ fontVariationSettings: "'wght' 600" }}>check</span></div>
            <h2 className="text-slate-900 dark:text-white tracking-tight text-[28px] font-bold leading-tight px-4 text-center">¡Cuenta Saldada!</h2>
          </>
        ) : (
          <>
            <div className="size-16 rounded-full bg-orange-500/20 flex items-center justify-center mb-4 ring-1 ring-orange-500/50 shadow-lg shadow-orange-500/20"><span className="material-symbols-outlined text-orange-500 text-4xl filled" style={{ fontVariationSettings: "'wght' 600" }}>schedule</span></div>
            <h2 className="text-slate-900 dark:text-white tracking-tight text-[28px] font-bold leading-tight px-4 text-center">Pendiente de Pago</h2>
          </>
        )}
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Orden #4829 • Mesa {tableNumber || '--'}</p>
      </div>

      <div className="flex flex-wrap gap-3 px-4 py-3">
        <div className="flex min-w-[111px] flex-1 basis-[fit-content] flex-col gap-1 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark p-4 items-center text-center shadow-sm">
          <p className="text-slate-900 dark:text-white tracking-tight text-2xl font-bold leading-tight">${formatPrice(105.50)}</p>
          <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-slate-400 dark:text-text-secondary text-sm">receipt_long</span><p className="text-slate-500 dark:text-text-secondary text-sm font-medium">Total Cuenta</p></div>
        </div>
      </div>

      {!allGuestsPaid && (
        <div className="px-4 py-2">
          <div className="w-full rounded-2xl bg-gradient-to-r from-[#1c3024] to-[#13241b] border border-border-dark p-4 flex items-center justify-between shadow-md relative overflow-hidden group cursor-pointer">
            <div className="flex items-center gap-4 relative z-10"><div className="bg-white p-1.5 rounded-lg shrink-0"><span className="material-symbols-outlined text-black text-2xl">qr_code_2</span></div><div className="flex flex-col"><span className="text-white font-bold text-sm">Recibo Digital QR</span><span className="text-text-secondary text-xs">Escanea para descargar</span></div></div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pb-2 pt-4"><h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">Estado de los Invitados</h3></div>

      <div className="flex flex-col gap-3 px-4 pb-4 overflow-y-auto no-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <p className="text-slate-500 dark:text-slate-400 text-sm">Cargando estado de invitados...</p>
          </div>
        ) : (
          dinerShares.map((guest) => {
            const isMe = guest.isHost || guest.id === currentGuestId;
            const isPaid = guest.paid === true;
            const amount = guest.individualAmount || 0;
            return (
              <div key={guest.id} className={`flex items-center p-3 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark shadow-sm transition-opacity ${isPaid ? 'opacity-60' : ''}`}>
                <div className="relative">
                  <div className={`size-12 rounded-full flex items-center justify-center border-2 shadow-inner ${isMe ? 'border-primary' : 'border-transparent'} ${getGuestColor(guest.id)}`}><span className="text-sm font-black text-white">{getInitials(guest.name)}</span></div>
                  {isMe && <div className="absolute -bottom-1 -right-1 bg-primary text-[10px] text-black font-bold px-1.5 py-0.5 rounded-full border-2 border-surface-dark uppercase">TÚ</div>}
                  {isPaid && <div className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-surface-dark flex items-center justify-center"><span className="material-symbols-outlined text-[10px] font-bold">check</span></div>}
                </div>
                <div className="ml-3 flex-1"><p className="text-slate-900 dark:text-white font-bold">{isMe ? 'Tú' : guest.name.split(' ')[0]}</p><p className={`${isPaid ? 'text-green-600 dark:text-green-400' : isMe ? 'text-primary' : 'text-slate-500 dark:text-slate-400'} text-sm font-medium`}>{isPaid ? `Pagado $${formatPrice(amount)}` : `Debe $${formatPrice(amount)}`}</p></div>
                {!isPaid && (
                  <>
                    <span className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-xs px-2 py-1 rounded-full font-medium">{isMe ? 'Pendiente' : 'En proceso'}</span>
                    {!isMe && (
                      <button 
                        onClick={() => handleSharePayment(guest.name, amount, guest.id)}
                        className="size-10 rounded-xl bg-white/5 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-text-secondary active:scale-90 transition-all hover:bg-primary/20 hover:text-primary border border-white/5 ml-2"
                        title="Reenviar link de pago"
                      >
                        <span className="material-symbols-outlined text-[20px]">ios_share</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white dark:bg-background-dark border-t border-slate-200 dark:border-border-dark p-4 shadow-2xl z-50">
        {currentUserPaid ? (
          <button 
            onClick={onBackToStart || (() => {
              clearSession();
              window.location.href = '/scan';
            })} 
            className="w-full bg-primary hover:bg-green-400 text-background-dark font-bold text-lg h-14 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 group"
          >
            <span>Ir al inicio</span>
            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </button>
        ) : (
          <button onClick={onRestart} className="w-full bg-primary hover:bg-green-400 text-background-dark font-bold text-lg h-14 rounded-xl flex items-center justify-between px-6 shadow-lg shadow-primary/20 group">
            <span>Pagar mi parte</span>
            <div className="flex items-center gap-2"><span>$${formatPrice(dinerShares.find(g => g.isHost || g.id === currentGuestId)?.individualAmount || 0)}</span><span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span></div>
          </button>
        )}
      </div>
    </div>
  );
};

export default ConfirmationView;
