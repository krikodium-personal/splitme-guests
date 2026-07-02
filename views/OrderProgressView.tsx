
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { OrderItem, OrderBatch, MenuItem } from '../types';
import { formatPrice } from './MenuView';
import { getGroupKeyForCategoryId, ORDER_GROUP_LABELS } from '../lib/orderGroups';
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

interface OrderProgressViewProps {
  cart: OrderItem[];
  batches: OrderBatch[];
  activeOrderId?: string | null;
  onNext: () => void;
  onBack: () => void;
  onRedirectToFeedback?: () => void;
  onRemoveItemFromBatch?: (cartItemId: string) => Promise<void>;
  tableNumber?: number;
  menuItems: MenuItem[];
  categories?: { id: string; name: string; parent_id?: string | null }[];
}

const OrderProgressView: React.FC<OrderProgressViewProps> = ({ 
  cart, batches: initialBatches, activeOrderId, onNext, onBack, onRedirectToFeedback, onRemoveItemFromBatch, tableNumber, menuItems, categories = []
}) => {
  const [localBatches, setLocalBatches] = useState<OrderBatch[]>(initialBatches);
  const [orderStatus, setOrderStatus] = useState<string>('ABIERTO');
  const [isFlickering, setIsFlickering] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [currentTime, setCurrentTime] = useState(new Date()); // Para actualizar el tiempo cada minuto
  const [itemToRemoveFromBatch, setItemToRemoveFromBatch] = useState<OrderItem | null>(null);
  
  const orderId = activeOrderId;
  const orderChannelRef = useRef<any>(null);
  const batchesChannelRef = useRef<any>(null);

  // 1. Fetch Inicial de Batches al montar
  useEffect(() => {
    if (!orderId || !supabase) return;

    const fetchInitialData = async () => {
      // Traer estado de la orden
      const { data: orderData } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle();
      if (orderData) setOrderStatus(orderData.status.toUpperCase());

      // Traer estados actuales de todos los lotes (Fuente de Verdad Directa)
      // Incluir served_at para calcular el tiempo de servicio
      const { data: batchesData } = await supabase
        .from('order_batches')
        .select('*, served_at')
        .eq('order_id', orderId)
        .order('batch_number', { ascending: false }); // Orden descendente: último batch arriba
      
      if (batchesData) {
        setLocalBatches(batchesData);
      }
    };

    fetchInitialData();
  }, [orderId]);

  // 2. Suscripción Realtime (Orders + Batches)
  useEffect(() => {
    if (!orderId || !supabase) return;

    // Canal para la Orden (Cambio a PAGADO)
    const setupOrderChannel = () => {
      if (orderChannelRef.current) supabase.removeChannel(orderChannelRef.current);
      const channel = supabase
        .channel(`order-status-view-${orderId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
          const nextStatus = payload.new.status.toUpperCase();
          setOrderStatus(nextStatus);
          setIsFlickering(true);
          setTimeout(() => setIsFlickering(false), 600);
          if (nextStatus === 'PAGADO' && onRedirectToFeedback) onRedirectToFeedback();
        })
        .subscribe((status) => setConnectionStatus(prev => status === 'SUBSCRIBED' ? 'connected' : prev));
      orderChannelRef.current = channel;
    };

    // Canal para los Lotes (Cambios de Cocina)
    const setupBatchesChannel = () => {
      if (batchesChannelRef.current) supabase.removeChannel(batchesChannelRef.current);
      const channel = supabase
        .channel(`batches-status-view-${orderId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches', filter: `order_id=eq.${orderId}` }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setLocalBatches(prev => [...prev, payload.new as OrderBatch]);
          } else if (payload.eventType === 'UPDATE') {
            setLocalBatches(prev => prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b));
          }
        })
        .subscribe();
      batchesChannelRef.current = channel;
    };

    setupOrderChannel();
    setupBatchesChannel();

    return () => { 
      if (orderChannelRef.current) supabase.removeChannel(orderChannelRef.current);
      if (batchesChannelRef.current) supabase.removeChannel(batchesChannelRef.current);
    };
  }, [orderId, onRedirectToFeedback]);

  // Actualizar el tiempo cada minuto para refrescar los indicadores "hace X minutos"
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Actualizar cada minuto

    return () => clearInterval(interval);
  }, []);

  const getStatusConfig = (status: string) => {
    const s = status.toUpperCase();
    switch (s) {
      case 'SERVIDO': 
        return { icon: 'check_circle', color: 'text-primary', bg: 'bg-primary/10', label: 'Servido' };
      case 'LISTO': 
        return { icon: 'notifications_active', color: 'text-primary', bg: 'bg-primary/20', label: '¡Llegando!' };
      case 'EN PREPARACIÓN': 
      case 'PREPARANDO':
        return { icon: 'skillet', color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'En cocina' };
      case 'ENVIADO':
        return { icon: 'send', color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Enviado' };
      default: 
        return { icon: 'schedule', color: 'text-white/40', bg: 'bg-white/5', label: 'En espera' };
    }
  };

  // Agrupar items por batch usando el cart (que ya contiene los items de la DB)
  const groupedItems = useMemo(() => {
    // Filtrar solo items con status='pedido' (enviados a cocina)
    const confirmedItems = cart.filter(i => i.status === 'pedido' || (!i.status && i.isConfirmed));
    console.log("[OrderProgressView] Total items en cart:", cart.length);
    console.log("[OrderProgressView] Items confirmados (status='pedido'):", confirmedItems.length);
    console.log("[OrderProgressView] Items con batch_id:", confirmedItems.filter(i => i.batch_id).length);
    
    const groups: Record<string, OrderItem[]> = {};
    
    confirmedItems.forEach(item => {
      const bId = item.batch_id || 'unbatched';
      if (!groups[bId]) groups[bId] = [];
      groups[bId].push(item);
    });
    
    console.log("[OrderProgressView] Grupos por batch:", Object.keys(groups).length, "batches");
    return groups;
  }, [cart]);

  return (
    <div className={`flex flex-col flex-1 h-screen bg-background-dark text-white overflow-hidden relative font-display transition-colors duration-500 ${isFlickering ? 'bg-primary/5' : ''}`}>
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center bg-background-dark/95 backdrop-blur-md p-4 justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="size-10 flex items-center justify-center rounded-full hover:bg-white/5">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Estado del Pedido</span>
            <h2 className="text-sm font-bold">Mesa {tableNumber || '--'}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
           <div className={`size-2 rounded-full ${connectionStatus === 'connected' ? 'bg-primary animate-pulse' : 'bg-red-500'}`}></div>
           <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{connectionStatus === 'connected' ? 'En Vivo' : 'Reconectando'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-64 no-scrollbar">
        {localBatches.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="size-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-white/20 text-4xl">receipt_long</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Sincronizando pedido...</h3>
            <p className="text-text-secondary text-sm">Estamos conectando con el sistema del local.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {localBatches
              .filter(batch => {
                // No mostrar batches con status='CREADO' que estén vacíos (sin productos)
                const items = groupedItems[batch.id] || [];
                const batchStatus = batch.status.toUpperCase();
                if ((batchStatus === 'CREADO' || batchStatus === 'ENVIADO') && items.length === 0) {
                  return false;
                }
                // Solo mostrar batches que ya fueron enviados (ENVIADO, PREPARANDO, LISTO, SERVIDO)
                if (batchStatus === 'CREADO') {
                  return false;
                }
                return true;
              })
              .sort((a, b) => b.batch_number - a.batch_number) // Ordenar descendente: último batch arriba
              .map((batch, index) => {
                const batchStatus = batch.status?.toUpperCase() || '';
              const status = getStatusConfig(batch.status);
              const items = groupedItems[batch.id] || [];
                const isReady = batchStatus === 'LISTO';
                const firstItem = items[0];
                const firstMenuItem = firstItem ? menuItems.find(m => m.id === firstItem.itemId) : null;
                const groupKey = firstMenuItem && categories.length > 0 ? getGroupKeyForCategoryId(firstMenuItem.category_id, categories) : null;
                const groupLabel = groupKey ? ORDER_GROUP_LABELS[groupKey] : null;
              
              return (
                <div key={batch.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="mb-4 px-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <div className={`size-8 rounded-lg ${status.bg} flex items-center justify-center`}>
                          <span className={`material-symbols-outlined text-sm ${status.color}`}>{status.icon}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Envío #{batch.batch_number}</span>
                          <p className="text-[9px] text-white/40 font-medium">
                            {batchStatus === 'SERVIDO'
                              ? getServiceTime(batch.created_at, batch.served_at)
                              : getTimeAgo(batch.created_at)}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md border ${status.color} ${status.bg} border-current`}>
                        {status.label}
                      </span>
                    </div>
                  </div>

                  {groupLabel && (
                    <h3 className="text-xs font-black text-white/70 uppercase tracking-widest mb-3 px-2">
                      {groupLabel}
                    </h3>
                  )}

                  {isReady && (
                    <div className="mb-4 bg-primary text-black p-3 rounded-2xl flex items-center gap-3 animate-pulse shadow-lg shadow-primary/20">
                      <span className="material-symbols-outlined font-black">celebration</span>
                      <span className="text-xs font-black uppercase tracking-widest">¡Tu pedido está llegando a la mesa!</span>
                    </div>
                  )}

                  <div className={`bg-surface-dark border rounded-[2rem] overflow-hidden transition-all ${isReady ? 'border-primary shadow-lg shadow-primary/10' : 'border-white/5'}`}>
                    <div className="divide-y divide-white/5">
                      {items.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        const replaceInfo = getReplaceVariantInfo(dish, item);
                        const addLabels = getAddVariantLabels(dish, item);
                        const unitPrice = item.unitPrice ?? dish?.price ?? 0;
                        const canRemove = batchStatus === 'ENVIADO' && onRemoveItemFromBatch;
                        return (
                          <div key={item.id} className="p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <div className="size-14 rounded-xl bg-center bg-cover border border-white/5 shrink-0" style={{ backgroundImage: `url('${dish?.image_url}')` }}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{dish?.name}</p>
                                {replaceInfo && (
                                  <p className="text-[10px] uppercase"><span className="text-white/60">{replaceInfo.groupName}: </span><span className="font-bold text-white">{replaceInfo.optionNames.join(', ')}</span></p>
                                )}
                                <p className="text-text-secondary text-[10px] font-medium">Cantidad: {item.quantity}</p>
                              </div>
                              <span className="text-xs font-black price-amount text-white/40">${formatPrice(unitPrice * item.quantity)}</span>
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
                            {(addLabels.length > 0 || item.extras?.length || item.removedIngredients?.length) && (
                              <div className="flex flex-wrap items-center gap-1.5 ml-[72px]">
                                {addLabels.map(label => (
                                  <span key={label} className="text-[9px] font-black uppercase bg-green-500/20 text-green-400 px-2 py-0.5 rounded-md border border-green-500/40">{label}</span>
                                ))}
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
                      {items.length === 0 && (
                        <div className="p-6 text-center text-white/20 italic text-[10px] uppercase font-black">
                          Cargando platos de este envío...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-10 z-50 space-y-4">
        <button 
          onClick={onNext} 
          className="w-full h-16 bg-primary text-black rounded-2xl font-black text-xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        >
          <span className="material-symbols-outlined font-black">payments</span>
          <span>Pagar Cuenta</span>
        </button>
        <button 
          onClick={onBack} 
          className="w-full h-14 bg-white/5 text-white/60 border border-white/10 rounded-2xl font-bold flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          <span>Pedir algo más</span>
        </button>
      </div>

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
    </div>
  );
};

export default OrderProgressView;
