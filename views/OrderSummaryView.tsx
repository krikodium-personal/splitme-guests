
import React from 'react';
import { Guest, OrderItem, MenuItem } from '../types';
import { formatPrice } from './MenuView';

interface OrderSummaryViewProps {
  guests: Guest[];
  cart: OrderItem[];
  onBack: () => void;
  onNavigateToCategory: (guestId: string, category: string) => void;
  onEditItem: (cartItem: OrderItem) => void;
  onSend: () => void;
  isSending?: boolean;
  onUpdateQuantity: (id: string, delta: number) => void;
  menuItems: MenuItem[];
  categories: any[];
  tableNumber?: number;
  waiter?: any;
}

const OrderSummaryView: React.FC<OrderSummaryViewProps> = ({ 
  guests, cart, onBack, onNavigateToCategory, onEditItem, onSend, isSending = false, onUpdateQuantity, menuItems, tableNumber
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

  return (
    <div className="bg-background-dark text-white font-display h-screen flex flex-col">
      <div className="flex items-center p-4 border-b border-white/5 sticky top-0 bg-background-dark/95 backdrop-blur-md z-10">
        <button onClick={onBack} disabled={isSending} className="size-10 flex items-center justify-center rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="flex-1 text-center font-bold">Resumen de Cuenta</h2>
        <div className="size-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-40 no-scrollbar">
        {/* SECCIÓN: NUEVOS PEDIDOS */}
        {pendingItems.length > 0 && (
          <div className="mb-10">
            <h3 className="text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-4 pl-2">Nuevos Pedidos (Sin enviar)</h3>
            <div className="space-y-4">
              {guests.map(guest => {
                const guestPending = pendingItems.filter(i => i.guestId === guest.id);
                if (guestPending.length === 0) return null;
                return (
                  <div key={guest.id} className="bg-surface-dark rounded-3xl p-4 border border-primary/20 shadow-lg shadow-primary/5">
                    <p className="text-xs font-black text-white/50 mb-3 uppercase tracking-widest">{guest.name}</p>
                    <div className="space-y-3">
                      {guestPending.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        return (
                          <div key={item.id} className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <div className="size-12 rounded-xl bg-cover bg-center shrink-0" style={{ backgroundImage: `url("${dish?.image_url}")` }}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{dish?.name}</p>
                                <p className="text-primary text-xs font-bold">${formatPrice(Number(dish?.price || 0))}</p>
                              </div>
                              <div className="flex items-center gap-3 bg-background-dark/50 rounded-full px-2 py-1 shrink-0">
                                <button onClick={() => onUpdateQuantity(item.id, -1)} className="size-6 rounded-full hover:bg-white/10"><span className="material-symbols-outlined text-xs">remove</span></button>
                                <span className="text-xs font-black">{item.quantity}</span>
                                <button onClick={() => onUpdateQuantity(item.id, 1)} className="size-6 rounded-full bg-white/10"><span className="material-symbols-outlined text-xs">add</span></button>
                              </div>
                            </div>
                            {/* Visualización de personalizaciones */}
                            {(item.extras?.length || item.removedIngredients?.length) && (
                              <div className="flex flex-wrap items-center gap-1.5 pl-16">
                                {item.extras?.map(ex => (
                                  <span key={ex} className="text-[9px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">+{ex}</span>
                                ))}
                                {item.removedIngredients?.map(rem => (
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

        {/* SECCIÓN: YA PEDIDOS */}
        {confirmedItems.length > 0 && (
          <div>
            <h3 className="text-text-secondary text-[10px] font-black uppercase tracking-[0.3em] mb-4 pl-2">En Preparación / Servido</h3>
            <div className="space-y-4">
              {guests.map(guest => {
                const guestConfirmed = confirmedItems.filter(i => i.guestId === guest.id);
                if (guestConfirmed.length === 0) return null;
                return (
                  <div key={guest.id} className="bg-white/5 rounded-3xl p-4 border border-white/5 opacity-80">
                    <p className="text-xs font-black text-white/40 mb-3 uppercase tracking-widest">{guest.name}</p>
                    <div className="space-y-3">
                      {guestConfirmed.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        return (
                          <div key={item.id} className="flex flex-col gap-2 opacity-70">
                            <div className="flex items-center gap-4">
                              <div className="size-12 rounded-xl bg-cover bg-center shrink-0 grayscale" style={{ backgroundImage: `url("${dish?.image_url}")` }}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white/70 truncate">{dish?.name}</p>
                                <p className="text-white/40 text-xs font-medium">x{item.quantity} - Ya en cocina</p>
                              </div>
                              <span className="text-xs font-bold text-white/40 shrink-0">${formatPrice((dish?.price || 0) * item.quantity)}</span>
                            </div>
                            {/* Visualización de personalizaciones en ítems ya pedidos */}
                            {(item.extras?.length || item.removedIngredients?.length) && (
                              <div className="flex flex-wrap items-center gap-1.5 pl-16 opacity-50">
                                {item.extras?.map(ex => (
                                  <span key={ex} className="text-[8px] font-black uppercase bg-white/5 text-white/50 px-2 py-0.5 rounded-md border border-white/10">+{ex}</span>
                                ))}
                                {item.removedIngredients?.map(rem => (
                                  <span key={rem} className="text-[8px] font-black uppercase bg-white/5 text-white/50 px-2 py-0.5 rounded-md border border-white/10">-{rem}</span>
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
      </div>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-background-dark border-t border-white/5 z-20">
        <div className="flex justify-between items-center mb-4 px-2">
           <span className="text-text-secondary font-medium">Total Acumulado</span>
           <span className="text-2xl font-black tabular-nums">${formatPrice(grandTotal)}</span>
        </div>
        
        {pendingItems.length > 0 ? (
          <button 
            onClick={onSend} 
            disabled={isSending}
            className="w-full h-16 bg-primary text-background-dark rounded-2xl flex items-center justify-between px-8 shadow-xl shadow-primary/20 font-black"
          >
            {isSending ? 'Enviando Pedido...' : 'Enviar Nuevos Platos'}
            <span className="tabular-nums">${formatPrice(pendingTotal)}</span>
          </button>
        ) : (
          <button onClick={onBack} className="w-full h-16 bg-white/5 text-white border border-white/10 rounded-2xl font-black">
            Volver al Menú
          </button>
        )}
      </div>
    </div>
  );
};

export default OrderSummaryView;
