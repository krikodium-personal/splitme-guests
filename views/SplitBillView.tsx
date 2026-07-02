
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Guest, OrderBatch, OrderItem, MenuItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';

interface SplitBillViewProps {
  guests: Guest[];
  cart: OrderItem[];
  batches: OrderBatch[];
  onBack: () => void;
  onGoToMenu: () => void;
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

const getPaymentMethodLabel = (method?: string | null) => {
  switch ((method || '').toLowerCase()) {
    case 'mercadopago':
      return 'Mercado Pago';
    case 'transfer':
    case 'transferencia':
      return 'Transferencia';
    case 'cash':
    case 'efectivo':
      return 'Efectivo';
    default:
      return 'Método no informado';
  }
};

const formatPaymentReference = (paymentId?: string | null) => {
  if (!paymentId) return null;
  const trimmed = String(paymentId).trim();
  if (trimmed.length <= 10) return trimmed;
  return `...${trimmed.slice(-8)}`;
};

const buildAssignments = (items: OrderItem[], menuItems: MenuItem[]): BillItemAssignment[] => {
  const units: BillItemAssignment[] = [];
  items.forEach(item => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    const unitPrice = item.unitPrice ?? (menuItem?.price || 0);
    for (let i = 0; i < item.quantity; i++) {
      units.push({
        id: `${item.id}-${i}`,
        cartItemId: item.id,
        itemId: item.itemId,
        name: menuItem?.name || 'Producto',
        image_url: menuItem?.image_url || '',
        unitPrice,
        assignedGuestIds: i === 0 ? [item.guestId] : []
      });
    }
  });
  return units;
};

const SplitBillView: React.FC<SplitBillViewProps> = ({ guests, cart, batches, onBack, onGoToMenu, onConfirm, menuItems }) => {
  const [method, setMethod] = useState<'equal' | 'item' | 'guest' | 'custom'>('item');
  const [selectedForEqual, setSelectedForEqual] = useState<string[]>([]);
  
  // Debug: Log guests cuando cambian
  useEffect(() => {
    console.log("[SplitBillView] Guests recibidos:", guests.length, guests);
    if (guests.length > 0) {
      setSelectedForEqual(guests.map(g => g.id));
    }
  }, [guests]);
  
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (guests && guests.length > 0) {
    guests.forEach(g => initial[g.id] = '0');
    }
    return initial;
  });

  // Estado para rastrear qué comensal tiene el input con foco
  const [focusedGuestId, setFocusedGuestId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Actualizar customAmounts cuando cambian los guests
  useEffect(() => {
    if (guests.length > 0) {
      setCustomAmounts(prev => {
        const updated = { ...prev };
        guests.forEach(g => {
          if (!updated[g.id]) {
            updated[g.id] = '0';
          }
        });
        return updated;
      });
    }
  }, [guests]);

  // Los precios ya incluyen impuestos según el requerimiento.
  const grandTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      const unitPrice = item.unitPrice ?? (menuItem?.price || 0);
      return sum + (unitPrice * item.quantity);
    }, 0);
  }, [cart, menuItems]);

  // Verificar si hay algún comensal que ya pagó
  const hasPaidGuests = useMemo(() => {
    return guests.some(g => g.paid === true);
  }, [guests]);

  const paidGuestDetails = useMemo(() => {
    return guests
      .filter(g => g.paid === true)
      .map(guest => {
        const ledgerAmount = Number(guest.payment_total ?? 0);
        const fallbackAmount = Number(guest.individualAmount ?? 0);
        const amount = ledgerAmount > 0 ? ledgerAmount : fallbackAmount;
        return {
          ...guest,
          amount,
          methodLabel: getPaymentMethodLabel(guest.payment_method),
          paymentReference: formatPaymentReference(guest.payment_id),
        };
      });
  }, [guests]);

  const paidRegisteredTotal = useMemo(() => {
    return paidGuestDetails.reduce((sum, guest) => sum + (Number(guest.amount) || 0), 0);
  }, [paidGuestDetails]);

  const latestPaymentTime = useMemo(() => {
    const times = paidGuestDetails
      .map(guest => guest.payment_created_at ? new Date(guest.payment_created_at).getTime() : NaN)
      .filter(time => Number.isFinite(time));
    return times.length > 0 ? Math.max(...times) : null;
  }, [paidGuestDetails]);

  const postPaymentCart = useMemo(() => {
    if (!latestPaymentTime) return [];
    const postPaymentBatchIds = new Set(
      batches
        .filter(batch => {
          const status = (batch.status || '').toUpperCase();
          const createdAt = batch.created_at ? new Date(batch.created_at).getTime() : NaN;
          return status !== 'CREADO' && Number.isFinite(createdAt) && createdAt > latestPaymentTime;
        })
        .map(batch => batch.id)
    );

    return cart.filter(item => item.batch_id && postPaymentBatchIds.has(item.batch_id));
  }, [batches, cart, latestPaymentTime]);

  const postPaymentTotal = useMemo(() => {
    return postPaymentCart.reduce((sum, item) => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      const unitPrice = item.unitPrice ?? (menuItem?.price || 0);
      return sum + (unitPrice * item.quantity);
    }, 0);
  }, [postPaymentCart, menuItems]);

  const hasPostPaymentBalance = postPaymentTotal > 0.01;
  const splitCart = hasPostPaymentBalance ? postPaymentCart : cart;
  const splitTotal = hasPostPaymentBalance ? postPaymentTotal : grandTotal;

  const [assignments, setAssignments] = useState<BillItemAssignment[]>(() => buildAssignments(splitCart, menuItems));

  useEffect(() => {
    setAssignments(buildAssignments(splitCart, menuItems));
  }, [splitCart, menuItems]);

  const canEditSplit = !hasPaidGuests || hasPostPaymentBalance;

  const guestShares = useMemo(() => {
    const shares: Record<string, number> = {};
    guests.forEach(g => {
      shares[g.id] = 0;
    });

    if (method === 'equal') {
      const participantCount = selectedForEqual.length;
      if (participantCount > 0) {
        const perGuest = splitTotal / participantCount;
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
      splitCart.forEach(item => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        const unitPrice = item.unitPrice ?? (menuItem?.price ?? 0);
        if (unitPrice > 0 || menuItem) {
          const current: number = Number(shares[item.guestId] || 0);
          shares[item.guestId] = current + (Number(unitPrice) * item.quantity);
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
      
      const items = splitCart
        .filter(item => item.guestId === g.id)
        .map(item => {
          const menuItem = menuItems.find(m => m.id === item.itemId);
          const unitPrice = item.unitPrice ?? (menuItem?.price || 0);
          return {
            name: menuItem?.name || 'Producto',
            quantity: item.quantity,
            price: unitPrice
          };
        });

      return {
        ...g,
        paid: hasPostPaymentBalance ? false : g.paid,
        subtotal: guestSubtotal,
        total: guestTotal,
        items,
        isAdditionalChargeSplit: hasPostPaymentBalance,
      };
    });
  }, [method, selectedForEqual, assignments, customAmounts, splitCart, guests, menuItems, splitTotal, hasPostPaymentBalance]);

  // Debug: Log guestShares cuando cambian
  useEffect(() => {
    console.log("[SplitBillView] GuestShares calculados:", guestShares.length, guestShares);
  }, [guestShares]);

  const isTableFullyPaid = grandTotal > 0 && paidRegisteredTotal >= grandTotal - 0.01;
  const hasGuestsPendingPayment = guests.some(g => g.paid !== true);
  const shouldShowSplitLockedAlert = hasPaidGuests && !isTableFullyPaid && hasGuestsPendingPayment && !hasPostPaymentBalance;

  const assignedSubtotal = useMemo(() => {
    if (method === 'item') return assignments.filter(a => a.assignedGuestIds.length > 0).reduce((sum: number, a) => sum + a.unitPrice, 0);
    if (method === 'custom') return Object.values(customAmounts).reduce((sum: number, val) => sum + (parseFloat(val as string) || 0), 0);
    if (method === 'equal') return selectedForEqual.length > 0 ? splitTotal : 0;
    return splitTotal; 
  }, [method, assignments, customAmounts, selectedForEqual, splitTotal]);

  const isFullyAssigned = Math.abs(assignedSubtotal - splitTotal) < 0.01;
  const isEqualSplitValid = method !== 'equal' || selectedForEqual.length > 0;
  const canConfirmSplit = isEqualSplitValid && (isFullyAssigned || method === 'equal' || method === 'guest');

  const toggleEqualGuest = (id: string) => {
    if (!canEditSplit) return; // No permitir cambios si hay pagos previos sin saldo nuevo
    setSelectedForEqual(prev => prev.includes(id) ? prev.filter(gid => gid !== id) : [...prev, id]);
  };

  const toggleItemAssignment = (assignmentId: string, guestId: string) => {
    if (!canEditSplit) return; // No permitir cambios si hay pagos previos sin saldo nuevo
    // Establecer el comensal con foco cuando se hace clic en un botón de comensal
    setFocusedGuestId(guestId);
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
    if (!canEditSplit) return; // No permitir cambios si hay pagos previos sin saldo nuevo
    setCustomAmounts(prev => ({ ...prev, [id]: value }));
  };

  // Función para agregar el faltante total al comensal con foco
  const handleAddRemainingAmount = () => {
    if (!canEditSplit || !focusedGuestId) return; // No permitir cambios si hay pagos previos sin saldo nuevo o no hay comensal con foco
    
    const remaining = splitTotal - assignedSubtotal;
    if (remaining <= 0) return;

    if (method === 'custom') {
      // Para método custom: agregar el faltante al comensal con foco
      // Leer el valor actual del input directamente si está disponible, sino del estado
      const inputElement = inputRefs.current[focusedGuestId];
      let currentValue = '';
      if (inputElement) {
        currentValue = inputElement.value || '';
      } else {
        currentValue = customAmounts[focusedGuestId] || '';
      }
      
      const currentAmount = currentValue && currentValue.trim() !== '' ? parseFloat(currentValue) : 0;
      const newAmount = currentAmount + remaining;
      // Formatear el número para que tenga máximo 2 decimales
      const formattedAmount = newAmount.toFixed(2);
      setCustomAmounts(prev => ({ ...prev, [focusedGuestId]: formattedAmount }));
      
      // Si el input está enfocado, actualizar su valor también
      if (inputElement) {
        inputElement.value = formattedAmount;
      }
    } else if (method === 'item') {
      // Para método item: asignar todos los items no asignados al comensal con foco
      // Asignar todos los items no asignados al comensal seleccionado
      setAssignments(prev => prev.map(a => {
        if (a.assignedGuestIds.length === 0) {
          return {
            ...a,
            assignedGuestIds: [focusedGuestId]
          };
        }
        return a;
      }));
    }
  };

  const handleConfirm = () => {
    if (canConfirmSplit) {
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
          <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-2">Saldo a pagar</span>
          <h2 className="text-5xl font-black tracking-tighter leading-none text-white price-amount">${formatPrice(splitTotal)}</h2>
          <div className="mt-4 flex flex-col items-center gap-1">
            <p className="text-text-secondary text-[10px] font-black uppercase tracking-widest opacity-60">Total histórico de la mesa</p>
            <p className="text-white/70 text-sm font-black price-amount">${formatPrice(grandTotal)}</p>
          </div>
          <p className="text-text-secondary text-[10px] font-black uppercase tracking-widest mt-4 opacity-40">Precios finales con impuestos incluidos</p>
        </div>

        <div className="px-4 mb-6">
          {paidGuestDetails.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-4">
              {shouldShowSplitLockedAlert && (
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-500 text-xl shrink-0">info</span>
                  <div className="flex-1">
                    <p className="text-amber-500 font-bold text-sm mb-1">No se puede cambiar el método de división</p>
                    <p className="text-amber-500/80 text-xs">Uno o más comensales ya realizaron su pago. Los montos individuales no pueden modificarse.</p>
                  </div>
                </div>
              )}
              <div className={shouldShowSplitLockedAlert ? 'mt-4 pt-4 border-t border-amber-500/20' : ''}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Pagos registrados</p>
                  <span className="text-[10px] font-black text-amber-400/80 tabular-nums">
                    {paidGuestDetails.length} {paidGuestDetails.length === 1 ? 'pago' : 'pagos'}
                  </span>
                </div>
                <div className="space-y-2">
                  {paidGuestDetails.map(guest => (
                    <div key={guest.id} className="rounded-xl bg-black/20 border border-amber-500/10 p-3">
                      <div className="flex items-center gap-3">
                        <div className={`size-9 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${getGuestColor(guest.id)}`}>
                          {getInitials(guest.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-black text-white truncate">{guest.name}</p>
                            <p className="text-xs font-black text-primary price-amount shrink-0">${formatPrice(guest.amount)}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] font-bold text-amber-500/80">
                            <span>{guest.methodLabel}</span>
                            {guest.paymentReference && (
                              <>
                                <span className="text-amber-500/30">|</span>
                                <span className="font-mono uppercase tracking-tight">ID {guest.paymentReference}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-4 bg-white/5 p-1 rounded-2xl border border-white/5">
            {[
              { id: 'equal', label: 'Equitativo', icon: 'balance' },
              { id: 'item', label: 'Por Item', icon: 'reorder' },
              { id: 'guest', label: 'Comensal', icon: 'person' },
              { id: 'custom', label: 'Manual', icon: 'edit_note' }
            ].map((m) => (
              <button 
                key={m.id} 
                onClick={() => canEditSplit && setMethod(m.id as any)}
                disabled={!canEditSplit}
                className={`flex flex-col items-center justify-center py-3 rounded-xl transition-all gap-1 ${
                  !canEditSplit 
                    ? 'opacity-40 cursor-not-allowed grayscale' 
                    : method === m.id 
                      ? 'bg-primary text-black shadow-lg' 
                      : 'text-text-secondary hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-xl font-bold">{m.icon}</span>
                <span className="text-xs font-black uppercase tracking-tighter">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-8 space-y-6">
          {guests.length === 0 && (
            <div className="text-center py-8 text-text-secondary animate-fade-in-up">
              <p className="text-sm mb-2">No hay comensales disponibles</p>
              <p className="text-xs opacity-60">Los comensales se cargarán automáticamente...</p>
            </div>
          )}
          {method === 'equal' && guests.length > 0 && (
            <div className="space-y-4 animate-fade-in-up">
              <p className="text-center text-sm text-text-secondary px-6">Selecciona quiénes participan en la división equitativa.</p>
              {selectedForEqual.length === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-500 text-xl">warning</span>
                  <p className="text-xs font-bold text-amber-500 leading-snug">
                    Tenés que seleccionar al menos un comensal para dividir el saldo.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {guests.map(guest => (
                  <button 
                    key={guest.id} 
                    onClick={() => toggleEqualGuest(guest.id)}
                    disabled={!canEditSplit}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      !canEditSplit 
                        ? 'opacity-40 cursor-not-allowed' 
                        : selectedForEqual.includes(guest.id) 
                          ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(19,236,106,0.1)]' 
                          : 'bg-white/5 border-white/5 grayscale opacity-50'
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

          {method === 'item' && guests.length > 0 && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="bg-surface-dark border border-white/5 rounded-2xl p-4 sticky top-0 z-20 shadow-xl">
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Progreso de Asignación</span>
                   <span className={`text-[10px] font-black ${isFullyAssigned ? 'text-primary' : 'text-amber-500'}`}>
                     ${formatPrice(assignedSubtotal)} / ${formatPrice(splitTotal)}
                   </span>
                 </div>
                 <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                   <div
                     className={`h-full transition-all duration-500 rounded-full ${isFullyAssigned ? 'bg-primary' : 'bg-amber-500'}`}
                     style={{ width: `${Math.min((assignedSubtotal / Math.max(splitTotal, 1)) * 100, 100)}%` }}
                   ></div>
                 </div>
              </div>

              {assignments.map(unit => (
                <div key={unit.id} className={`bg-surface-dark border rounded-2xl overflow-hidden transition-all ${unit.assignedGuestIds.length > 0 ? 'border-primary/20' : 'border-white/5'}`}>
                  <div className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="size-12 rounded-xl bg-center bg-cover border border-white/5 shrink-0" style={{ backgroundImage: `url('${unit.image_url}')` }}></div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-white truncate">{unit.name}</span>
                        <span className="text-[10px] text-primary font-black tracking-widest">${formatPrice(unit.unitPrice)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 py-1 shrink-0">
                      {guests.map(guest => (
                        <button 
                          key={guest.id} 
                          onClick={() => toggleItemAssignment(unit.id, guest.id)} 
                          disabled={!canEditSplit}
                          className={`relative size-9 rounded-full border-2 transition-all flex items-center justify-center shrink-0 ${
                            !canEditSplit 
                              ? 'opacity-30 cursor-not-allowed' 
                              : unit.assignedGuestIds.includes(guest.id) 
                                ? 'border-primary scale-110' 
                                : 'border-transparent opacity-40 hover:opacity-100'
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

          {method === 'guest' && guests.length > 0 && (
            <div className="space-y-4 animate-fade-in-up">
              <p className="text-center text-sm text-text-secondary px-6">Cada comensal paga lo que pidió inicialmente.</p>
              {guestShares.length > 0 ? guestShares.map(share => (
                <div key={share.id} className="bg-surface-dark border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`size-12 rounded-full flex items-center justify-center font-black text-base border-2 border-primary/20 ${getGuestColor(share.id)}`}>
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

                  <div className="bg-black/20 rounded-[8px] p-3 space-y-2 border border-white/5">
                    {share.items && share.items.length > 0 ? (
                      share.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-black">x{item.quantity}</span>
                            <span className="text-white font-medium truncate max-w-[150px]">{item.name}</span>
                          </div>
                          <span className="text-text-secondary font-bold price-amount">${formatPrice(item.price * item.quantity)}</span>
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
              )) : (
                <div className="text-center py-8 text-text-secondary">
                  <p className="text-sm">No hay comensales para mostrar</p>
                </div>
              )}
            </div>
          )}

          {method === 'custom' && guests.length > 0 && (
            <div className="space-y-4 animate-fade-in-up">
               {guests.map(guest => (
                 <div key={guest.id} className={`flex items-center gap-4 bg-surface-dark border border-white/5 p-4 rounded-2xl ${!canEditSplit ? 'opacity-60' : ''}`}>
                    <div className={`size-12 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${getGuestColor(guest.id)}`}>
                      {getInitials(guest.name)}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-white mb-1">{guest.name}</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-black">$</span>
                        <input 
                          ref={(el) => { inputRefs.current[guest.id] = el; }}
                          type="number" 
                          value={customAmounts[guest.id] || ''}
                          onFocus={(e) => {
                            if (canEditSplit) {
                              // Cancelar cualquier timeout pendiente de blur
                              if (blurTimeoutRef.current) {
                                clearTimeout(blurTimeoutRef.current);
                                blurTimeoutRef.current = null;
                              }
                              setFocusedGuestId(guest.id);
                              // Solo limpiar si el campo tiene el valor inicial '0'
                              if (customAmounts[guest.id] === '0') {
                                handleCustomAmountChange(guest.id, '');
                              }
                            }
                          }}
                          onBlur={(e) => {
                            // Cancelar timeout anterior si existe
                            if (blurTimeoutRef.current) {
                              clearTimeout(blurTimeoutRef.current);
                            }
                            
                            // No limpiar focusedGuestId inmediatamente para permitir que el botón funcione
                            // Usar un delay para verificar si realmente se perdió el foco
                            blurTimeoutRef.current = setTimeout(() => {
                              // Verificar si algún input está enfocado o si se hizo clic en el botón
                              const activeElement = document.activeElement;
                              const isButton = activeElement?.closest('button')?.textContent?.includes('Agregar total faltante');
                              const isInputFocused = activeElement?.tagName === 'INPUT' && activeElement?.getAttribute('type') === 'number';
                              
                              // Verificar si hay algún input en el documento que tenga foco
                              const hasAnyInputFocused = document.querySelector('input[type="number"]:focus') !== null;
                              
                              // Solo limpiar si no hay ningún input enfocado y no se hizo clic en el botón
                              if (!isButton && !isInputFocused && !hasAnyInputFocused) {
                                setFocusedGuestId(null);
                              }
                              blurTimeoutRef.current = null;
                            }, 200);
                          }}
                          onChange={(e) => canEditSplit && handleCustomAmountChange(guest.id, e.target.value)}
                          disabled={!canEditSplit}
                          className={`w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-2 text-white font-bold outline-none focus:ring-2 focus:ring-primary ${
                            !canEditSplit ? 'opacity-40 cursor-not-allowed' : ''
                          }`}
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
          {!isTableFullyPaid && !isFullyAssigned && (method === 'item' || method === 'custom') && (
            <>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3 animate-pulse">
                <span className="material-symbols-outlined text-amber-500 text-xl">warning</span>
                <p className="text-sm font-bold text-amber-500 uppercase tracking-widest leading-tight">
                  Faltan ${formatPrice(splitTotal - assignedSubtotal)} por asignar
                </p>
              </div>
              {focusedGuestId && (
                <button
                  onMouseDown={(e) => {
                    // Prevenir que el input pierda el foco cuando se hace clic en el botón
                    e.preventDefault();
                  }}
                  onClick={handleAddRemainingAmount}
                  disabled={!canEditSplit}
                  className="w-full bg-amber-500/20 hover:bg-amber-500/30 active:scale-[0.98] border border-amber-500/30 text-amber-500 font-bold text-sm h-12 rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  <span>Agregar total faltante ${formatPrice(splitTotal - assignedSubtotal)}</span>
                </button>
              )}
            </>
          )}

          {isTableFullyPaid ? (
            <button
              onClick={onGoToMenu}
              className="w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all bg-primary text-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="material-symbols-outlined font-black">restaurant_menu</span>
              <span>Volver al menú</span>
            </button>
          ) : (
            <button 
              onClick={handleConfirm} 
              disabled={!canConfirmSplit}
              className={`w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all ${
                canConfirmSplit ? 'bg-primary text-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]' : 'bg-white/5 text-white/20 cursor-not-allowed grayscale'
              }`}
            >
              <span>Confirmar División</span>
              <span className="material-symbols-outlined font-black">arrow_forward</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default SplitBillView;
