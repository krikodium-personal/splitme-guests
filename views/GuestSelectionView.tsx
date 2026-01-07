
import React, { useMemo } from 'react';
import { Guest, OrderItem, MenuItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';

interface GuestSelectionViewProps {
  guests: Guest[];
  cart: OrderItem[];
  menuItems: MenuItem[];
  splitData: any[] | null;
  onSelectGuest: (guestId: string) => void;
  restaurant?: any;
}

const GuestSelectionView: React.FC<GuestSelectionViewProps> = ({ 
  guests, cart, menuItems, splitData, onSelectGuest, restaurant 
}) => {
  // Calcular totales de cada comensal
  const guestTotals = useMemo(() => {
    // Prioridad 1: Usar individualAmount desde order_guests (guardado en BD)
    // Prioridad 2: Usar splitData si está disponible
    // Prioridad 3: Calcular desde los items del cart
    return guests.map(guest => {
      // Primero verificar si tiene individualAmount guardado en BD
      if (guest.individualAmount !== null && guest.individualAmount !== undefined) {
        return {
          ...guest,
          total: guest.individualAmount
        };
      }
      
      // Si hay splitData, usar los totales ya calculados
      if (splitData) {
        const share = splitData.find(s => s.id === guest.id);
        if (share?.total) {
          return {
            ...guest,
            total: share.total
          };
        }
      }
      
      // Si no hay splitData ni individualAmount, calcular desde los items del cart
      const guestItems = cart.filter(item => item.guestId === guest.id);
      const total = guestItems.reduce((sum, item) => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        return sum + (menuItem ? Number(menuItem.price) * item.quantity : 0);
      }, 0);
      
      return {
        ...guest,
        total
      };
    });
  }, [guests, cart, menuItems, splitData]);

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark text-white font-display antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-center bg-background-dark/90 px-4 py-4 backdrop-blur-md border-b border-white/5">
        <h1 className="text-lg font-bold leading-tight">Selecciona tu nombre</h1>
      </header>

      <div className="flex flex-col items-center justify-center pt-8 pb-6 px-4">
        <div className="text-text-secondary text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-60 text-center">
          {restaurant?.name || 'Restaurante'}
        </div>
        <p className="text-sm text-text-secondary text-center max-w-sm">
          Selecciona tu nombre de la lista para ver tu parte de la cuenta y pagar
        </p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3 pb-8">
        {guestTotals.map((guest) => (
          <button
            key={guest.id}
            onClick={() => onSelectGuest(guest.id)}
            className="w-full flex items-center p-4 rounded-2xl bg-surface-dark border border-white/5 shadow-sm transition-all hover:border-primary/40 hover:bg-surface-dark/80 active:scale-[0.98]"
          >
            <div className={`size-12 rounded-full flex items-center justify-center font-black text-base border-2 border-white/10 ${getGuestColor(guest.id)}`}>
              <span className="text-white">{getInitials(guest.name)}</span>
            </div>
            <div className="ml-4 flex-1 min-w-0 text-left">
              <p className="text-white font-bold text-base truncate">{guest.name}</p>
              <p className="text-xs font-medium text-text-secondary mt-0.5">
                Total a pagar
              </p>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-white font-black text-xl tabular-nums">
                ${formatPrice(guest.total)}
              </p>
              <span className="material-symbols-outlined text-primary text-xl mt-1">
                arrow_forward
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default GuestSelectionView;

