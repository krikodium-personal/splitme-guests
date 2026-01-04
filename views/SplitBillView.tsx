
import React, { useState, useMemo, useEffect } from 'react';
import { Guest, OrderItem, MenuItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';

interface SplitBillViewProps {
  guests: Guest[];
  cart: OrderItem[];
  onBack: () => void;
  onConfirm: (shares: any[]) => void;
  menuItems: MenuItem[];
}

interface BillItemAssignment {
  id: string; // único por unidad
  cartItemId: string;
  itemId: string;
  name: string;
  unitPrice: number;
  image_url: string;
  assignedGuestIds: string[];
}

const SplitBillView: React.FC<SplitBillViewProps> = ({ guests, cart, onBack, onConfirm, menuItems }) => {
  const [method, setMethod] = useState<'equal' | 'item' | 'guest' | 'custom'>('item');
  
  const [selectedForEqual, setSelectedForEqual] = useState<string[]>(guests.map(g => g.id));
  
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    guests.forEach(g => initial[g.id] = '0');
    return initial;
  });

  const [assignments, setAssignments] = useState<BillItemAssignment[]>(() => {
    const units: BillItemAssignment[] = [];
    cart.forEach(item => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      const unitPrice = (menuItem?.price || 0);
      for (let i = 0; i < item.quantity; i++) {
        units.push({
          id: `${item.id}-${i}`,
          cartItemId: item.id,
          itemId: item.itemId,
          name: menuItem?.name || 'Producto',
          image_url: menuItem?.image_url || '',
          unitPrice: unitPrice,
          assignedGuestIds: i === 0 ? [item.guestId] : [] 
        });
      }
    });
    return units;
  });

  // Los precios ya incluyen impuestos según el requerimiento.
  const subtotal = useMemo(() => assignments.reduce((sum: number, a) => sum + a.unitPrice, 0), [assignments]);
  const grandTotal = subtotal;

  const guestShares = useMemo(() => {
    const shares: Record<string, number> = {};
    guests.forEach(g => {
      shares[g.id] = 0;
    });

    if (method === 'equal') {
      const participantCount = selectedForEqual.length;
      if (participantCount > 0) {
        const perGuest = subtotal / participantCount;
        selectedForEqual.forEach(gid => {
          shares[gid] = perGuest;
        });
      }
    } else if (method === 'item') {
      assignments.forEach(unit => {
        if (unit.assignedGuestIds.length > 0) {
          const portion = unit.unitPrice / unit.assignedGuestIds.length;
          unit.assignedGuestIds.forEach(gid => {
            const current: number = Number(shares[gid] || 0);
            shares[gid] = current + portion;
          });
        }
      });
    } else if (method === 'guest') {
      cart.forEach(item => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        if (menuItem) {
          const current: number = Number(shares[item.guestId] || 0);
          shares[item.guestId] = current + (Number(menuItem.price) * item.quantity);
        }
      });
    } else if (method === 'custom') {
      guests.forEach(g => {
        const val = customAmounts[g.id];
        const valStr = typeof val === 'string' ? val : '0';
        shares[g.id] = parseFloat(valStr) || 0;
      });
    }

    return guests.map(g => {
      const guestSubtotal = Number(shares[g.id] || 0);
      const guestTotal = guestSubtotal; // Sin tasas adicionales
      
      const items = cart
        .filter(item => item.guestId === g.id)
        .map(item => {
          const menuItem = menuItems.find(m => m.id === item.itemId);
          return {
            name: menuItem?.name || 'Producto',
            quantity: item.quantity,
            price: menuItem?.price || 0
          };
        });

      return { ...g, subtotal: guestSubtotal, total: guestTotal, items };
    });
  }, [method, selectedForEqual, assignments, customAmounts, cart, guests, menuItems, subtotal]);

  const assignedSubtotal = useMemo(() => {
    if (method === 'item') return assignments.filter(a => a.assignedGuestIds.length > 0).reduce((sum: number, a) => sum + a.unitPrice, 0);
    if (method === 'custom') return Object.values(customAmounts).reduce((sum: number, val) => sum + (parseFloat(val as string) || 0), 0);
    if (method === 'equal') return selectedForEqual.length > 0 ? subtotal : 0;
    return subtotal; 
  }, [method, assignments, customAmounts, selectedForEqual, subtotal]);

  const isFullyAssigned = Math.abs(assignedSubtotal - subtotal) < 0.01;

  const toggleEqualGuest = (id: string) => {
    setSelectedForEqual(prev => prev.includes(id) ? prev.filter(gid => gid !== id) : [...prev, id]);
  };

  const toggleItemAssignment = (assignmentId: string, guestId: string) => {
    setAssignments(prev => prev.map(a => {
      if (a.id === assignmentId) {
        const isAssigned = a.assignedGuestIds.includes(guestId);
        return {
          ...a,
          assignedGuestIds: isAssigned 
            ? a.assignedGuestIds.filter(id => id !== guestId) 
            : [...a.assignedGuestIds, guestId]
        };
      }
      return a;
    }));
  };

  const handleCustomAmountChange = (id: string, value: string) => {
    setCustomAmounts(prev => ({ ...prev, [id]: value }));
  };

  const handleConfirm = () => {
    if (isFullyAssigned || method === 'equal' || method === 'guest') {
      onConfirm(guestShares);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-screen bg-background-dark text-white overflow-hidden font-display">
      <header className="sticky top-0 z-50 flex items-center justify-between p-4 bg-background-dark/95 backdrop-blur-md border-b border-white/5">
        <button onClick={onBack} className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold">Dividir Cuenta</h1>
        <div className="size-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-40">
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center animate-fade-in">
          <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-2">Total de la Mesa</span>
          <h2 className="text-5xl font-black tracking-tighter leading-none text-white">${formatPrice(grandTotal)}</h2>
          <p className="text-text-secondary text-[10px] font-black uppercase tracking-widest mt-4 opacity-40">Precios finales con impuestos incluidos</p>
        </div>

        <div className="px-4 mb-6">
          <div className="grid grid-cols-4 bg-white/5 p-1 rounded-2xl border border-white/5">
            {[
              { id: 'equal', label: 'Equitativo', icon: 'balance' },
              { id: 'item', label: 'Por Item', icon: 'reorder' },
              { id: 'guest', label: 'Comensal', icon: 'person' },
              { id: 'custom', label: 'Manual', icon: 'edit_note' }
            ].map((m) => (
              <button 
                key={m.id} 
                onClick={() => setMethod(m.id as any)} 
                className={`flex flex-col items-center justify-center py-3 rounded-xl transition-all gap-1 ${
                  method === m.id ? 'bg-primary text-background-dark shadow-lg' : 'text-text-secondary hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-lg font-bold">{m.icon}</span>
                <span className="text-[8px] font-black uppercase tracking-tighter">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-8 space-y-6">
          {method === 'equal' && (
            <div className="space-y-4 animate-fade-in-up">
              <p className="text-center text-sm text-text-secondary px-6">Selecciona quiénes participan en la división equitativa.</p>
              <div className="grid grid-cols-2 gap-3">
                {guests.map(guest => (
                  <button 
                    key={guest.id} 
                    onClick={() => toggleEqualGuest(guest.id)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      selectedForEqual.includes(guest.id) ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(19,236,106,0.1)]' : 'bg-white/5 border-white/5 grayscale opacity-50'
                    }`}
                  >
                    <div className={`size-10 rounded-full flex items-center justify-center font-black text-xs ${getGuestColor(guest.id)}`}>
                      {getInitials(guest.name)}
                    </div>
                    <span className="text-xs font-bold truncate">{guest.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {method === 'item' && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="bg-surface-dark border border-white/5 rounded-2xl p-4 sticky top-0 z-20 shadow-xl">
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Progreso de Asignación</span>
                   <span className={`text-[10px] font-black ${isFullyAssigned ? 'text-primary' : 'text-amber-500'}`}>
                     ${formatPrice(assignedSubtotal)} / ${formatPrice(subtotal)}
                   </span>
                 </div>
                 <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                   <div className={`h-full transition-all duration-500 rounded-full ${isFullyAssigned ? 'bg-primary' : 'bg-amber-500'}`} style={{ width: `${(assignedSubtotal/subtotal)*100}%` }}></div>
                 </div>
              </div>

              {assignments.map(unit => (
                <div key={unit.id} className={`bg-surface-dark border rounded-2xl overflow-hidden transition-all ${unit.assignedGuestIds.length > 0 ? 'border-primary/20' : 'border-white/5'}`}>
                  <div className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-12 rounded-xl bg-center bg-cover border border-white/5 shrink-0" style={{ backgroundImage: `url('${unit.image_url}')` }}></div>
                      <div className="flex flex-col truncate">
                        <span className="text-xs font-bold text-white truncate">{unit.name}</span>
                        <span className="text-[10px] text-primary font-black tracking-widest">${formatPrice(unit.unitPrice)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                      {guests.map(guest => (
                        <button 
                          key={guest.id} 
                          onClick={() => toggleItemAssignment(unit.id, guest.id)} 
                          className={`relative size-9 rounded-full border-2 transition-all flex items-center justify-center shrink-0 ${
                            unit.assignedGuestIds.includes(guest.id) ? 'border-primary scale-110' : 'border-transparent opacity-40 hover:opacity-100'
                          } ${getGuestColor(guest.id)} shadow-lg`}
                        >
                          <span className="text-[9px] font-black text-white">{getInitials(guest.name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {method === 'guest' && (
            <div className="space-y-4 animate-fade-in-up">
              <p className="text-center text-sm text-text-secondary px-6">Cada comensal paga lo que pidió inicialmente.</p>
              {guestShares.map(share => (
                <div key={share.id} className="bg-surface-dark border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`size-12 rounded-full flex items-center justify-center font-black text-sm border-2 border-primary/20 ${getGuestColor(share.id)}`}>
                        {getInitials(share.name)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{share.name}</span>
                        <span className="text-[10px] text-text-secondary font-black uppercase tracking-widest">Resumen de consumo</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-primary">${formatPrice(share.total)}</span>
                    </div>
                  </div>

                  <div className="bg-black/20 rounded-xl p-3 space-y-2 border border-white/5">
                    {share.items && share.items.length > 0 ? (
                      share.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-black">x{item.quantity}</span>
                            <span className="text-white font-medium truncate max-w-[150px]">{item.name}</span>
                          </div>
                          <span className="text-text-secondary font-bold tabular-nums">${formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-text-secondary italic text-center py-1">Sin productos asignados</p>
                    )}
                    <div className="pt-2 mt-2 border-t border-white/5 flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase text-text-secondary">Subtotal Personal</span>
                      <span className="text-[11px] font-bold text-white">${formatPrice(share.subtotal)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {method === 'custom' && (
            <div className="space-y-4 animate-fade-in-up">
               {guests.map(guest => (
                 <div key={guest.id} className="flex items-center gap-4 bg-surface-dark border border-white/5 p-4 rounded-2xl">
                    <div className={`size-12 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${getGuestColor(guest.id)}`}>
                      {getInitials(guest.name)}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-white mb-1">{guest.name}</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-black">$</span>
                        <input 
                          type="number" 
                          value={customAmounts[guest.id]}
                          onFocus={() => handleCustomAmountChange(guest.id, '')}
                          onChange={(e) => handleCustomAmountChange(guest.id, e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-2 text-white font-bold outline-none focus:ring-2 focus:ring-primary"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-black text-text-secondary uppercase">Total Final</p>
                      <p className="text-sm font-black text-primary">${formatPrice(guestShares.find(s => s.id === guest.id)?.total || 0)}</p>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-6 z-40">
        <div className="max-w-md mx-auto space-y-4">
          {!isFullyAssigned && (method === 'item' || method === 'custom') && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3 animate-pulse">
              <span className="material-symbols-outlined text-amber-500">warning</span>
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest leading-tight">
                Faltan ${formatPrice(subtotal - assignedSubtotal)} por asignar
              </p>
            </div>
          )}

          <button 
            onClick={handleConfirm} 
            disabled={!isFullyAssigned && (method === 'item' || method === 'custom')}
            className={`w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all ${
              (isFullyAssigned || method === 'equal' || method === 'guest') ? 'bg-primary text-background-dark shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]' : 'bg-white/5 text-white/20 cursor-not-allowed grayscale'
            }`}
          >
            <span>Confirmar División</span>
            <span className="material-symbols-outlined font-black">arrow_forward</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default SplitBillView;
