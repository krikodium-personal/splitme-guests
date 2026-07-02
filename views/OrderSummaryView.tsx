import React, { useMemo, useState, useEffect } from 'react';
import { Guest, OrderItem, MenuItem, OrderBatch } from '../types';
import { formatPrice } from './MenuView';
import { getInitials, getGuestColor } from './GuestInfoView';
import WaiterRequestModal from './WaiterRequestModal';
import { getGroupKeyForCategoryId, ORDER_GROUP_LABELS, type OrderGroupKey } from '../lib/orderGroups';
import { getReplaceVariantInfo, getAddVariantLabels } from '../lib/variantDisplay';

// Función helper para calcular tiempo transcurrido desde created_at
const getTimeAgo = (createdAt: string | undefined): string => {
  if (!createdAt) return 'Pedido hace un momento';
  
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Pedido hace un momento';
  if (diffMins < 60) return `Pedido hace ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
  if (diffHours < 24) return `Pedido hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  return `Pedido hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
};

// Función helper para calcular tiempo de servicio (entre created_at y served_at)
const getServiceTime = (createdAt: string | undefined, servedAt: string | undefined): string => {
  if (!createdAt || !servedAt) return 'Pedido servido';
  
  const created = new Date(createdAt);
  const served = new Date(servedAt);
  const diffMs = served.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffMins < 1) return 'Pedido servido en menos de un minuto';
  if (diffMins < 60) return `Pedido servido en ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
  if (diffHours < 24) {
    const remainingMins = diffMins % 60;
    if (remainingMins === 0) {
      return `Pedido servido en ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    }
    return `Pedido servido en ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'} y ${remainingMins} ${remainingMins === 1 ? 'minuto' : 'minutos'}`;
  }
  return 'Pedido servido';
};

interface OrderSummaryViewProps {
  guests: Guest[];
  cart: OrderItem[];
  batches: OrderBatch[];
  onBack: () => void;
  onNavigateToCategory: (guestId: string, category: string) => void;
  onEditItem: (cartItem: OrderItem) => void;
  onSendGroup: (groupKey: OrderGroupKey) => void;
  onPay?: () => void;
  sendingGroup?: OrderGroupKey | null;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItemFromBatch?: (cartItemId: string) => Promise<void>;
  menuItems: MenuItem[];
  categories: any[];
  tableNumber?: number;
  waiter?: any;
  currentGuestId?: string | null;
  activeOrderId?: string | null;
  restaurant?: { logo_url?: string | null } | null;
}

const OrderSummaryView: React.FC<OrderSummaryViewProps> = ({ 
  guests, cart, batches, onBack, onSendGroup, onPay, sendingGroup = null, onUpdateQuantity, onRemoveItemFromBatch, menuItems, categories, currentGuestId, waiter, tableNumber, activeOrderId, restaurant
}) => {
  const getItemImageUrl = (imageUrl?: string | null) => (imageUrl || '').trim() || restaurant?.logo_url || '';
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  const [showUnsentProductsModal, setShowUnsentProductsModal] = useState(false);
  const [itemToRemoveFromBatch, setItemToRemoveFromBatch] = useState<OrderItem | null>(null);

  // Debug: Log waiter data
  useEffect(() => {
    console.log('[OrderSummaryView] Waiter data:', waiter);
    console.log('[OrderSummaryView] Will show button?', !!waiter);
  }, [waiter]);
  
  const isCurrentUserHost = useMemo(() => 
    !!(currentGuestId && guests.find(g => g.id === currentGuestId)?.isHost), 
    [guests, currentGuestId]
  );
  const hostGuest = useMemo(() => guests.find(g => g.isHost === true), [guests]);
  const hostDisplayName = (hostGuest?.name || 'el anfitrión').replace(/\s*\(Tú\)\s*$/i, '').trim() || 'el anfitrión';
  const [currentTime, setCurrentTime] = useState(new Date()); // Para actualizar el tiempo cada minuto
  const [viewMode, setViewMode] = useState<'batches' | 'guests'>('batches'); // 'batches' = pedidos realizados, 'guests' = pedidos de comensales

  // Actualizar el tiempo cada minuto para refrescar los indicadores "hace X minutos"
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Actualizar cada minuto

    return () => clearInterval(interval);
  }, []);
  // Items pendientes: status elegido, batch_id null o batch CREADO (retrocompat)
  const pendingItems = cart.filter(i => {
    const isElegido = i.status === 'elegido' || (!i.status && !i.isConfirmed);
    const isPending = !i.batch_id || batches.some(b => b.id === i.batch_id && b.status === 'CREADO');
    return isElegido && isPending;
  });

  // Agrupar pendientes por categoría (entradas/bebidas, principales/guarniciones, postres/cafetería)
  const pendingByGroup = useMemo(() => {
    const groups: Record<OrderGroupKey, OrderItem[]> = {
      entradas_bebidas: [],
      principales_guarniciones: [],
      postres_cafeteria: [],
    };
    pendingItems.forEach(item => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      if (!menuItem) return;
      const groupKey = getGroupKeyForCategoryId(menuItem.category_id, categories);
      groups[groupKey].push(item);
    });
    return groups;
  }, [pendingItems, menuItems, categories]);
  const confirmedItems = cart.filter(i => i.status === 'pedido' || (!i.status && i.isConfirmed));

  // Total Acumulado: solo items en batches ya enviados (excluir CREADO y sin batch)
  const grandTotal = cart.reduce((sum, item) => {
    const isInCreatedBatch = !item.batch_id || batches.some(b => b.id === item.batch_id && (b.status || '').toUpperCase() === 'CREADO');
    if (isInCreatedBatch) return sum;
    const menuItem = menuItems.find(m => m.id === item.itemId);
    const unitPrice = item.unitPrice ?? menuItem?.price ?? 0;
    return sum + unitPrice * item.quantity;
  }, 0);

  // Agrupar items por comensal para la vista de comensales
  const itemsByGuest = useMemo(() => {
    return guests.map(guest => {
      const guestItems = cart.filter(item => item.guestId === guest.id);
      const guestTotal = guestItems.reduce((sum, item) => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        const unitPrice = item.unitPrice ?? menuItem?.price ?? 0;
        return sum + unitPrice * item.quantity;
      }, 0);
      return {
        guest,
        items: guestItems,
        total: guestTotal
      };
    }).filter(group => group.items.length > 0);
  }, [guests, cart, menuItems]);

  // Agrupación dinámica por Lote (Batch) usando el estado real de DB
  const confirmedByBatch = useMemo(() => {
    console.log("[OrderSummaryView] Batches recibidos:", batches.map(b => ({ id: b.id, batch_number: b.batch_number, status: b.status })));
    const result = batches
      .map(batch => ({
        ...batch,
        items: confirmedItems.filter(i => i.batch_id === batch.id)
      }))
      .filter(b => {
        // Solo incluir batches que tengan items confirmados y que NO sean 'CREADO'
        const hasItems = b.items.length > 0;
        const isNotCreated = b.status?.toUpperCase() !== 'CREADO';
        console.log("[OrderSummaryView] Batch #", b.batch_number, "status:", b.status, "hasItems:", hasItems, "isNotCreated:", isNotCreated);
        return hasItems && isNotCreated;
      })
      .reverse(); // Recientes arriba
    console.log("[OrderSummaryView] confirmedByBatch result:", result.map(b => ({ batch_number: b.batch_number, status: b.status, itemsCount: b.items.length })));
    return result;
  }, [batches, confirmedItems]);

  const getStatusConfig = (status: string) => {
    // Normalizar el status: trim y uppercase
    const s = (status || '').trim().toUpperCase();
    console.log("[OrderSummaryView] getStatusConfig recibió:", status, "normalizado a:", s);
    
    switch (s) {
      case 'SERVIDO': 
        return { icon: 'check_circle', color: 'text-primary', label: 'Servido', bg: 'bg-primary/5' };
      case 'LISTO': 
        return { icon: 'notifications_active', color: 'text-blue-400', label: '¡Llegando!', bg: 'bg-blue-400/10 animate-pulse' };
      case 'EN PREPARACIÓN': 
      case 'PREPARANDO':
        return { icon: 'skillet', color: 'text-orange-400', label: 'En cocina', bg: 'bg-orange-400/5' };
      case 'ENVIADO':
        return { icon: 'send', color: 'text-blue-400', label: 'Enviado', bg: 'bg-blue-400/5' };
      case 'CREADO':
        // No debería aparecer aquí porque se filtra antes, pero por si acaso
        return { icon: 'schedule', color: 'text-white/40', label: 'En espera', bg: 'bg-white/5' };
      default: 
        console.warn("[OrderSummaryView] Status desconocido:", s, "usando default");
        return { icon: 'schedule', color: 'text-white/40', label: 'Recibido', bg: 'bg-white/5' };
    }
  };

  return (
    <div className="bg-background-dark text-white font-display h-screen flex flex-col">
      <div className="flex items-center p-4 border-b border-white/5 sticky top-0 bg-background-dark/95 backdrop-blur-md z-10">
        <button onClick={onBack} disabled={!!sendingGroup} className="size-10 flex items-center justify-center rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="flex-1 text-center font-bold">Resumen de Mesa</h2>
        <div className="size-10"></div>
      </div>

      {/* Toggle para cambiar entre vistas */}
      <div className="px-4 pt-4 pb-2 border-b border-white/5">
        <div className="flex gap-2 bg-surface-dark rounded-xl p-1 border border-white/5">
          <button
            onClick={() => setViewMode('batches')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-black text-xs transition-all ${
              viewMode === 'batches'
                ? 'bg-primary text-black shadow-lg'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            Ver pedidos realizados
          </button>
          <button
            onClick={() => setViewMode('guests')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-black text-xs transition-all ${
              viewMode === 'guests'
                ? 'bg-primary text-black shadow-lg'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            Ver pedidos de los comensales
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-64 no-scrollbar">
        {viewMode === 'batches' ? (
          <>
        {/* SECCIÓN: PENDIENTES - Agrupados por categoría con botón "Pedir ahora" por grupo */}
        {pendingItems.length > 0 && (
          <div className="mb-10">
            <h3 className="text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-4 pl-2">Por Enviar a Cocina</h3>
            <div className="space-y-6">
              {(['entradas_bebidas', 'principales_guarniciones', 'postres_cafeteria'] as OrderGroupKey[]).map(groupKey => {
                const items = pendingByGroup[groupKey];
                if (items.length === 0) return null;
                return (
                  <div key={groupKey} className="bg-surface-dark rounded-3xl p-4 border border-primary/20 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-black text-white/80 uppercase tracking-widest">{ORDER_GROUP_LABELS[groupKey]}</h4>
                      {isCurrentUserHost && (
                        <button
                          onClick={() => onSendGroup(groupKey)}
                          disabled={!!sendingGroup}
                          className="h-10 px-5 bg-primary text-black rounded-xl font-black text-xs flex items-center gap-2 shadow-lg active:scale-[0.98] transition-all"
                        >
                          <span className={`material-symbols-outlined text-base ${sendingGroup === groupKey ? 'animate-spin' : ''}`}>{sendingGroup === groupKey ? 'sync' : 'send'}</span>
                          {sendingGroup === groupKey ? 'Enviando...' : 'Pedir ahora'}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {items.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        const guest = guests.find(g => g.id === item.guestId);
                        const replaceInfo = getReplaceVariantInfo(dish, item);
                        const addLabels = getAddVariantLabels(dish, item);
                        return (
                          <div key={item.id} className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <div className={`size-5 rounded-full ${getGuestColor(item.guestId)} flex items-center justify-center shrink-0`}>
                                <span className="text-[7px] font-black text-white">{getInitials(guest?.name || '?')}</span>
                              </div>
                              <div className="size-12 rounded-xl bg-cover bg-center shrink-0 border border-white/5 bg-white/5" style={{ backgroundImage: getItemImageUrl(dish?.image_url) ? `url("${getItemImageUrl(dish?.image_url).replace(/"/g, '\\"')}")` : undefined }}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-white/50 truncate">{guest?.name}</p>
                                <p className="text-sm font-bold truncate">{dish?.name}</p>
                                {replaceInfo && (
                                  <p className="text-[10px] uppercase"><span className="text-white/60">{replaceInfo.groupName}: </span><span className="font-bold text-white">{replaceInfo.optionNames.join(', ')}</span></p>
                                )}
                                <p className="text-primary text-[13px] font-semibold price-amount">${formatPrice(item.unitPrice ?? Number(dish?.price || 0))}</p>
                              </div>
                              <div className="flex items-center gap-3 bg-background-dark/50 rounded-full px-2 py-1 shrink-0 border border-white/5">
                                <button onClick={() => onUpdateQuantity(item.id, -1)} className="size-6 rounded-full hover:bg-white/10 flex items-center justify-center"><span className="material-symbols-outlined text-xs">remove</span></button>
                                <span className="text-xs font-black w-4 text-center">{item.quantity}</span>
                                <button onClick={() => onUpdateQuantity(item.id, 1)} className="size-6 rounded-full bg-white/10 flex items-center justify-center"><span className="material-symbols-outlined text-xs">add</span></button>
                              </div>
                            </div>
                            {(item.extras?.length > 0 || item.removedIngredients?.length > 0 || addLabels.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5 ml-16">
                                {addLabels.map(label => (
                                  <span key={label} className="text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/40">{label}</span>
                                ))}
                                {item.extras?.filter(ex => ex && ex.trim()).map(ex => (
                                  <span key={ex} className="text-[9px] font-black uppercase bg-green-500/20 text-green-400 px-2 py-0.5 rounded-md border border-green-500/40">+{ex}</span>
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
              // Usar el status del batch directamente, asegurándonos de que no sea undefined
              const batchStatus = (batch.status || '').trim().toUpperCase();
              const status = getStatusConfig(batchStatus);
              console.log("[OrderSummaryView] Batch #", batch.batch_number, "raw status:", batch.status, "normalized:", batchStatus, "config:", status);
              return (
                <div key={batch.id} className="space-y-3">
                  <div className="px-2">
                    <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Envío #{batch.batch_number}</span>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border border-current ${status.color} ${status.bg}`}>
                       <span className="material-symbols-outlined text-[14px] font-black">{status.icon}</span>
                       <span className="text-[9px] font-black uppercase tracking-widest">{status.label}</span>
                    </div>
                    </div>
                    <p className="text-[9px] text-white/40 font-medium">
                      {batchStatus === 'SERVIDO' 
                        ? getServiceTime(batch.created_at, batch.served_at)
                        : getTimeAgo(batch.created_at)
                      }
                    </p>
                  </div>

                  <div className="bg-surface-dark/50 rounded-3xl border border-white/5 overflow-hidden shadow-sm">
                    <div className="divide-y divide-white/5">
                      {batch.items.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        const guest = guests.find(g => g.id === item.guestId);
                        const replaceInfo = getReplaceVariantInfo(dish, item);
                        const addLabels = getAddVariantLabels(dish, item);
                        const canRemove = (batch.status || '').toUpperCase() === 'ENVIADO' && onRemoveItemFromBatch;
                        return (
                          <div key={item.id} className="p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                            <div className="size-11 rounded-xl bg-cover bg-center shrink-0 grayscale opacity-40 border border-white/5 bg-white/5" style={{ backgroundImage: getItemImageUrl(dish?.image_url) ? `url("${getItemImageUrl(dish?.image_url).replace(/"/g, '\\"')}")` : undefined }}></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <div className={`size-4 rounded-full ${getGuestColor(item.guestId)} flex items-center justify-center shrink-0`}>
                                  <span className="text-[6px] font-black text-white">{getInitials(guest?.name || '?')}</span>
                                </div>
                                <p className="text-sm font-bold text-white/80 truncate">{dish?.name}</p>
                              </div>
                              {replaceInfo && (
                                <p className="text-[10px] uppercase"><span className="text-white/50">{replaceInfo.groupName}: </span><span className="font-bold text-white">{replaceInfo.optionNames.join(', ')}</span></p>
                              )}
                              <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Cantidad: {item.quantity}</p>
                            </div>
                            <span className="text-[15px] font-semibold text-white/80 price-amount">${formatPrice((item.unitPrice ?? dish?.price ?? 0) * item.quantity)}</span>
                            {canRemove && (
                              <button
                                onClick={() => setItemToRemoveFromBatch(item)}
                                className="size-9 shrink-0 flex items-center justify-center rounded-full hover:bg-red-500/20 text-red-400 transition-colors"
                                title="Quitar del pedido"
                              >
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            )}
                            </div>
                            {/* Variantes add y personalizaciones */}
                            {(item.extras?.length > 0 || item.removedIngredients?.length > 0 || addLabels.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5 ml-[60px]">
                                {addLabels.map(label => (
                                  <span key={label} className="text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/40">{label}</span>
                                ))}
                                {item.extras?.filter(ex => ex && ex.trim()).map(ex => (
                                  <span key={ex} className="text-[9px] font-black uppercase bg-green-500/20 text-green-400 px-2 py-0.5 rounded-md border border-green-500/40">+{ex}</span>
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
          </>
        ) : (
          <>
            {/* VISTA: PEDIDOS DE LOS COMENSALES */}
            {itemsByGuest.length > 0 ? (
              <div className="space-y-6 animate-fade-in">
                {itemsByGuest.map(({ guest, items, total }) => (
                  <div key={guest.id} className="bg-surface-dark rounded-3xl p-5 border border-white/5 shadow-lg">
                    {/* Header del comensal */}
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                      <div className="flex items-center gap-3">
                        <div className={`size-10 rounded-full ${getGuestColor(guest.id)} flex items-center justify-center`}>
                          <span className="text-sm font-black text-white">{getInitials(guest.name)}</span>
                        </div>
                        <div>
                          <p className="text-base font-black text-white">{guest.name}</p>
                          <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest">
                            {items.length} {items.length === 1 ? 'plato' : 'platos'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/40 font-medium uppercase tracking-widest mb-1">Subtotal</p>
                        <p className="text-[22px] font-black price-amount">${formatPrice(total)}</p>
                      </div>
                    </div>

                    {/* Lista de platos del comensal */}
                    <div className="space-y-4">
                      {items.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        const unitPrice = item.unitPrice ?? (dish?.price ?? 0);
                        const itemTotal = unitPrice * item.quantity;
                        const replaceInfo = getReplaceVariantInfo(dish, item);
                        const addLabels = getAddVariantLabels(dish, item);
                        return (
                          <div key={item.id} className="flex flex-col gap-2">
                            <div className="flex items-start gap-4">
                              <div className="size-14 rounded-xl bg-cover bg-center shrink-0 border border-white/5 bg-white/5" style={{ backgroundImage: getItemImageUrl(dish?.image_url) ? `url("${getItemImageUrl(dish?.image_url).replace(/"/g, '\\"')}")` : undefined }}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold mb-1">{dish?.name}</p>
                                {replaceInfo && (
                                  <p className="text-[10px] uppercase mb-1"><span className="text-white/60">{replaceInfo.groupName}: </span><span className="font-bold text-white">{replaceInfo.optionNames.join(', ')}</span></p>
                                )}
                                <div className="flex items-center gap-3 text-xs text-white/60">
                                  <span className="font-medium">Cantidad: {item.quantity}</span>
                                  <span className="text-white/40">×</span>
                                  <span className="font-black price-amount">${formatPrice(unitPrice)}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[15px] font-semibold price-amount">${formatPrice(itemTotal)}</p>
                              </div>
                            </div>
                            {/* Variantes add y personalizaciones */}
                            {(item.extras?.length > 0 || item.removedIngredients?.length > 0 || addLabels.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5 ml-[72px]">
                                {addLabels.map(label => (
                                  <span key={label} className="text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/40">{label}</span>
                                ))}
                                {item.extras?.filter(ex => ex && ex.trim()).map(ex => (
                                  <span key={ex} className="text-[9px] font-black uppercase bg-green-500/20 text-green-400 px-2 py-0.5 rounded-md border border-green-500/40">+{ex}</span>
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
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 pt-20">
                <span className="material-symbols-outlined text-6xl mb-4">people</span>
                <p className="font-bold">No hay pedidos de comensales</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-background-dark border-t border-white/5 z-20 space-y-3 shadow-2xl">
        <div className="flex justify-between items-center px-2">
           <span className="text-text-secondary font-medium">Total Acumulado</span>
           <span className="text-[28px] font-black price-amount">${formatPrice(grandTotal)}</span>
        </div>
        
        <div className="flex flex-col gap-3">
          {confirmedItems.length > 0 && (isCurrentUserHost ? (
            <button onClick={() => {
              if (pendingItems.length > 0) setShowUnsentProductsModal(true);
              else onPay?.();
            }} className="w-full h-14 rounded-2xl font-black flex items-center justify-center gap-2 transition-all bg-primary hover:bg-primary-dark active:scale-[0.98] text-black shadow-xl shadow-primary/20">
              <span className="material-symbols-outlined font-black">payments</span>
              <span>Dividir y pagar cuenta</span>
            </button>
          ) : (
            <p className="w-full py-3 px-4 text-center text-sm text-white/70">
              Pedile a <span className="font-bold text-white">{hostDisplayName}</span> que avance con el proceso de pago de la cuenta.
            </p>
          ))}
        </div>
      </div>

      {/* Botón flotante para solicitar al mesero - arriba del footer, separado */}
      {waiter ? (
        <button
          onClick={() => setIsWaiterModalOpen(true)}
          className="fixed bottom-28 right-4 z-[70] size-14 rounded-full shadow-xl shadow-black/40 flex items-center justify-center overflow-hidden border-2 border-primary/60 transition-all active:scale-95"
          title="Solicitar al mesero"
        >
          <img
            src={waiter?.profile_photo_url || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyiwOtsINFh8RspVDg_Wx4QKXthNxCS7ZJlDSZvL6ADwFD3WRUpKHGhrscxV9dcR7w7guM4E-iFCNXx-tDgHs1BrbfGjolJoASehM-SEc4Pe6bKEx7zjcF4WAcON7mbdWJCepEdMPkBZ36lB_4tPTsJeNzTNqRNGKgusVb3U_X0WGEAgij6Y48HIunhj_BC8lxMdsB5ublmAltnyYerUKa_NkT8aybLFkaaRkQGQ_irdtS2ZQwrNGNj6b1ZrWY1HRClBeExJL615bG'}
            alt={waiter?.nickname || waiter?.full_name || 'Mesero'}
            className="w-full h-full object-cover"
          />
        </button>
      ) : null}

      {/* Modal: confirmar quitar producto del pedido (solo batches ENVIADO) */}
      {itemToRemoveFromBatch && (
        <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setItemToRemoveFromBatch(null)} />
          <div className="relative z-10 bg-surface-dark rounded-3xl p-8 mx-4 max-w-sm w-full border border-white/10 shadow-2xl flex flex-col gap-6">
            <h3 className="text-xl font-black text-white">¿Estás seguro de quitar el producto del pedido?</h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  if (onRemoveItemFromBatch && itemToRemoveFromBatch) {
                    await onRemoveItemFromBatch(itemToRemoveFromBatch.id);
                    setItemToRemoveFromBatch(null);
                  }
                }}
                className="w-full h-14 bg-red-500/20 text-red-400 border border-red-500/40 rounded-2xl font-black active:scale-[0.98] transition-all"
              >
                Sí, quitar
              </button>
              <button
                onClick={() => setItemToRemoveFromBatch(null)}
                className="w-full h-14 bg-white/5 border border-white/10 text-white rounded-2xl font-bold active:scale-[0.98] transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: productos sin enviar al hacer clic en Dividir y pagar */}
      {showUnsentProductsModal && (
        <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowUnsentProductsModal(false)} />
          <div className="relative z-10 bg-surface-dark rounded-3xl p-8 mx-4 max-w-sm w-full border border-white/10 shadow-2xl flex flex-col gap-6">
            <h3 className="text-xl font-black text-white">Tenés productos sin enviar</h3>
            <p className="text-text-secondary text-sm leading-relaxed">¿Estás seguro que querés pagar o preferís mandarlos?</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowUnsentProductsModal(false); onPay?.(); }}
                className="w-full h-14 bg-primary text-black rounded-2xl font-black text-lg shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
              >
                Prefiero pagar
              </button>
              <button
                onClick={() => setShowUnsentProductsModal(false)}
                className="w-full h-14 bg-white/5 border border-white/10 text-white rounded-2xl font-bold active:scale-[0.98] transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de solicitud al mesero */}
      <WaiterRequestModal
        isOpen={isWaiterModalOpen}
        onClose={() => setIsWaiterModalOpen(false)}
        waiter={waiter}
        tableNumber={tableNumber}
        orderId={activeOrderId}
      />
    </div>
  );
};

export default OrderSummaryView;