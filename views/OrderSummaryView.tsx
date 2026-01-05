import React, { useMemo } from 'react';
import { Guest, OrderItem, MenuItem, OrderBatch } from '../types';
import { formatPrice } from './MenuView';
import { getInitials, getGuestColor } from './GuestInfoView';

interface OrderSummaryViewProps {
  guests: Guest[];
  cart: OrderItem[];
  batches: OrderBatch[];
  onBack: () => void;
  onNavigateToCategory: (guestId: string, category: string) => void;
  onEditItem: (cartItem: OrderItem) => void;
  onSend: () => void;
  onPay?: () => void;
  isSending?: boolean;
  onUpdateQuantity: (id: string, delta: number) => void;
  menuItems: MenuItem[];
  categories: any[];
  tableNumber?: number;
  waiter?: any;
}

const OrderSummaryView: React.FC<OrderSummaryViewProps> = ({ 
  guests, cart, batches, onBack, onSend, onPay, isSending = false, onUpdateQuantity, menuItems
}) => {
  const pendingItems = cart.filter(i => !i.isConfirmed);
  const confirmedItems = cart.filter(i => i.isConfirmed);

  const grandTotal = cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? menuItem.price * item.quantity : 0);
  }, 0);

  const pendingTotal = pendingItems.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? menuItem.price * item.quantity : 0);
  }, 0);

  // Agrupación dinámica por Lote (Batch) usando el estado real de DB
  const confirmedByBatch = useMemo(() => {
    return batches
      .map(batch => ({
        ...batch,
        items: confirmedItems.filter(i => i.batch_id === batch.id)
      }))
      .filter(b => b.items.length > 0)
      .reverse(); // Recientes arriba
  }, [batches, confirmedItems]);

  const getStatusConfig = (status: string) => {
    const s = (status || 'RECIBIDO').toUpperCase();
    switch (s) {
      case 'SERVIDO': 
        return { icon: 'check_circle', color: 'text-primary', label: 'Servido', bg: 'bg-primary/5' };
      case 'LISTO': 
        return { icon: 'notifications_active', color: 'text-primary', label: '¡Llegando!', bg: 'bg-primary/10 animate-pulse' };
      case 'EN PREPARACIÓN': 
      case 'PREPARANDO':
        return { icon: 'skillet', color: 'text-orange-400', label: 'En cocina', bg: 'bg-orange-400/5' };
      default: 
        return { icon: 'schedule', color: 'text-white/40', label: 'Recibido', bg: 'bg-white/5' };
    }
  };

  return (
    <div className="bg-background-dark text-white font-display h-screen flex flex-col">
      <div className="flex items-center p-4 border-b border-white/5 sticky top-0 bg-background-dark/95 backdrop-blur-md z-10">
        <button onClick={onBack} disabled={isSending} className="size-10 flex items-center justify-center rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="flex-1 text-center font-bold">Resumen de Mesa</h2>
        <div className="size-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-48 no-scrollbar">
        {/* SECCIÓN: PENDIENTES */}
        {pendingItems.length > 0 && (
          <div className="mb-10">
            <h3 className="text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-4 pl-2">Por Enviar a Cocina</h3>
            <div className="space-y-4">
              {guests.map(guest => {
                const guestPending = pendingItems.filter(i => i.guestId === guest.id);
                if (guestPending.length === 0) return null;
                return (
                  <div key={guest.id} className="bg-surface-dark rounded-3xl p-4 border border-primary/20 shadow-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`size-5 rounded-full ${getGuestColor(guest.id)} flex items-center justify-center`}>
                        <span className="text-[7px] font-black text-white">{getInitials(guest.name)}</span>
                      </div>
                      <p className="text-xs font-black text-white/50 uppercase tracking-widest">{guest.name}</p>
                    </div>
                    <div className="space-y-3">
                      {guestPending.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        return (
                          <div key={item.id} className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <div className="size-12 rounded-xl bg-cover bg-center shrink-0 border border-white/5" style={{ backgroundImage: `url("${dish?.image_url}")` }}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{dish?.name}</p>
                                <p className="text-primary text-xs font-bold">${formatPrice(Number(dish?.price || 0))}</p>
                              </div>
                              <div className="flex items-center gap-3 bg-background-dark/50 rounded-full px-2 py-1 shrink-0 border border-white/5">
                                <button onClick={() => onUpdateQuantity(item.id, -1)} className="size-6 rounded-full hover:bg-white/10 flex items-center justify-center"><span className="material-symbols-outlined text-xs">remove</span></button>
                                <span className="text-xs font-black w-4 text-center">{item.quantity}</span>
                                <button onClick={() => onUpdateQuantity(item.id, 1)} className="size-6 rounded-full bg-white/10 flex items-center justify-center"><span className="material-symbols-outlined text-xs">add</span></button>
                              </div>
                            </div>
                            {/* Personalizaciones */}
                            {(item.extras?.length > 0 || item.removedIngredients?.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5 ml-16">
                                {item.extras?.filter(ex => ex && ex.trim()).map(ex => (
                                  <span key={ex} className="text-[9px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">+{ex}</span>
                                ))}
                                {item.removedIngredients?.filter(rem => rem && rem.trim()).map(rem => (
                                  <span key={rem} className="text-[9px] font-black uppercase bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md border border-red-500/20">-{rem}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECCIÓN: HISTORIAL REAL DE LOTES */}
        {confirmedByBatch.length > 0 && (
          <div className="space-y-8 animate-fade-in">
            <h3 className="text-text-secondary text-[10px] font-black uppercase tracking-[0.3em] pl-2">Pedidos Realizados</h3>
            {confirmedByBatch.map((batch) => {
              const status = getStatusConfig(batch.status);
              return (
                <div key={batch.id} className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Envío #{batch.batch_number}</span>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border border-current ${status.color} ${status.bg}`}>
                       <span className="material-symbols-outlined text-[14px] font-black">{status.icon}</span>
                       <span className="text-[9px] font-black uppercase tracking-widest">{status.label}</span>
                    </div>
                  </div>

                  <div className="bg-surface-dark/50 rounded-3xl border border-white/5 overflow-hidden shadow-sm">
                    <div className="divide-y divide-white/5">
                      {batch.items.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        const guest = guests.find(g => g.id === item.guestId);
                        return (
                          <div key={item.id} className="p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <div className="size-11 rounded-xl bg-cover bg-center shrink-0 grayscale opacity-40 border border-white/5" style={{ backgroundImage: `url("${dish?.image_url}")` }}></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <div className={`size-4 rounded-full ${getGuestColor(item.guestId)} flex items-center justify-center shrink-0`}>
                                    <span className="text-[6px] font-black text-white">{getInitials(guest?.name || '?')}</span>
                                  </div>
                                  <p className="text-sm font-bold text-white/80 truncate">{dish?.name}</p>
                                </div>
                                <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Cantidad: {item.quantity}</p>
                              </div>
                              <span className="text-xs font-black text-white/40 tabular-nums">${formatPrice((dish?.price || 0) * item.quantity)}</span>
                            </div>
                            {/* Personalizaciones */}
                            {(item.extras?.length > 0 || item.removedIngredients?.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5 ml-[60px]">
                                {item.extras?.filter(ex => ex && ex.trim()).map(ex => (
                                  <span key={ex} className="text-[9px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">+{ex}</span>
                                ))}
                                {item.removedIngredients?.filter(rem => rem && rem.trim()).map(rem => (
                                  <span key={rem} className="text-[9px] font-black uppercase bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md border border-red-500/20">-{rem}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {cart.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-20 pt-20">
            <span className="material-symbols-outlined text-6xl mb-4">shopping_cart</span>
            <p className="font-bold">Tu carrito está vacío</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-background-dark border-t border-white/5 z-20 space-y-3 shadow-2xl">
        <div className="flex justify-between items-center px-2">
           <span className="text-text-secondary font-medium">Total Acumulado</span>
           <span className="text-2xl font-black tabular-nums">${formatPrice(grandTotal)}</span>
        </div>
        
        <div className="flex flex-col gap-3">
          {pendingItems.length > 0 && (
            <button onClick={onSend} disabled={isSending} className="w-full h-16 bg-primary text-background-dark rounded-2xl flex items-center justify-between px-8 shadow-xl shadow-primary/20 font-black active:scale-[0.98] transition-all">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined font-black">{isSending ? 'sync' : 'send'}</span>
                <span>{isSending ? 'Enviando...' : 'Pedir ahora'}</span>
              </div>
              <span className="tabular-nums">${formatPrice(pendingTotal)}</span>
            </button>
          )}

          {confirmedItems.length > 0 && (
            <button onClick={onPay} className={`w-full h-14 rounded-2xl font-black flex items-center justify-center gap-2 transition-all ${pendingItems.length > 0 ? 'bg-white/5 text-white/60 border border-white/10' : 'bg-primary text-background-dark shadow-xl shadow-primary/20 active:scale-[0.98]'}`}>
              <span className="material-symbols-outlined font-black">payments</span>
              <span>Pagar Cuenta</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderSummaryView;