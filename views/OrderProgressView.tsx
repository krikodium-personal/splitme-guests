
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { OrderItem, OrderBatch, MenuItem } from '../types';
import { formatPrice } from './MenuView';

interface OrderProgressViewProps {
  cart: OrderItem[];
  batches: OrderBatch[]; // Recibidos como prop inicial
  activeOrderId?: string | null;
  onNext: () => void;
  onBack: () => void;
  onRedirectToFeedback?: () => void;
  tableNumber?: number;
  menuItems: MenuItem[];
}

const OrderProgressView: React.FC<OrderProgressViewProps> = ({ 
  cart, batches: initialBatches, activeOrderId, onNext, onBack, onRedirectToFeedback, tableNumber, menuItems 
}) => {
  const [localBatches, setLocalBatches] = useState<OrderBatch[]>(initialBatches);
  const [orderStatus, setOrderStatus] = useState<string>('ABIERTO');
  const [isFlickering, setIsFlickering] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  
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
      const { data: batchesData } = await supabase
        .from('order_batches')
        .select('*')
        .eq('order_id', orderId)
        .order('batch_number', { ascending: true });
      
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
      default: 
        return { icon: 'schedule', color: 'text-white/40', bg: 'bg-white/5', label: 'En espera' };
    }
  };

  // Agrupar items por batch usando el cart (que ya contiene los items de la DB)
  const groupedItems = useMemo(() => {
    const confirmedItems = cart.filter(i => i.isConfirmed);
    const groups: Record<string, OrderItem[]> = {};
    
    confirmedItems.forEach(item => {
      const bId = item.batch_id || 'unbatched';
      if (!groups[bId]) groups[bId] = [];
      groups[bId].push(item);
    });
    
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

      <div className="flex-1 overflow-y-auto p-4 pb-40 no-scrollbar">
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
            {localBatches.map((batch, index) => {
              const status = getStatusConfig(batch.status);
              const items = groupedItems[batch.id] || [];
              const isReady = batch.status.toUpperCase() === 'LISTO';
              
              return (
                <div key={batch.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-lg ${status.bg} flex items-center justify-center`}>
                        <span className={`material-symbols-outlined text-sm ${status.color}`}>{status.icon}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Envío #{batch.batch_number}</span>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md border ${status.color} ${status.bg} border-current`}>
                      {status.label}
                    </span>
                  </div>

                  {isReady && (
                    <div className="mb-4 bg-primary text-background-dark p-3 rounded-2xl flex items-center gap-3 animate-pulse shadow-lg shadow-primary/20">
                      <span className="material-symbols-outlined font-black">celebration</span>
                      <span className="text-xs font-black uppercase tracking-widest">¡Tu pedido está llegando a la mesa!</span>
                    </div>
                  )}

                  <div className={`bg-surface-dark border rounded-[2rem] overflow-hidden transition-all ${isReady ? 'border-primary shadow-lg shadow-primary/10' : 'border-white/5'}`}>
                    <div className="divide-y divide-white/5">
                      {items.map(item => {
                        const dish = menuItems.find(m => m.id === item.itemId);
                        return (
                          <div key={item.id} className="p-4 flex items-center gap-4">
                            <div className="size-14 rounded-xl bg-center bg-cover border border-white/5 shrink-0" style={{ backgroundImage: `url('${dish?.image_url}')` }}></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{dish?.name}</p>
                              <p className="text-text-secondary text-[10px] font-medium">Cantidad: {item.quantity}</p>
                            </div>
                            <span className="text-xs font-black tabular-nums text-white/40">${formatPrice((dish?.price || 0) * item.quantity)}</span>
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
          className="w-full h-16 bg-primary text-background-dark rounded-2xl font-black text-xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
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
    </div>
  );
};

export default OrderProgressView;
