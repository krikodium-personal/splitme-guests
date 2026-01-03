
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { OrderItem } from '../types';

interface OrderProgressViewProps {
  cart: OrderItem[];
  activeOrderId?: string | null;
  onNext: () => void;
  onBack: () => void;
  onRedirectToFeedback?: () => void;
  tableNumber?: number;
  waiter?: any;
}

const ACTIVE_ORDER_KEY = 'dinesplit_active_order_id';

/**
 * Pantalla de seguimiento de pedido con suscripción Realtime de alta disponibilidad.
 */
const OrderProgressView: React.FC<OrderProgressViewProps> = ({ cart, activeOrderId, onNext, onBack, onRedirectToFeedback, tableNumber, waiter }) => {
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  
  // 1. RESOLUCIÓN DE ID: Garantizamos que sea un string válido antes de operar
  const orderId = useMemo(() => {
    const id = activeOrderId || cart.find(item => item.order_id)?.order_id || localStorage.getItem(ACTIVE_ORDER_KEY);
    return id && typeof id === 'string' ? id : null;
  }, [cart, activeOrderId]);
  
  const [dbStatus, setDbStatus] = useState<string>('PREPARANDO');
  const [isFlickering, setIsFlickering] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  
  const channelRef = useRef<any>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  // NORMALIZACIÓN: Evita errores por diferencias de casing entre DB y UI
  const normalizedStatus = useMemo(() => dbStatus ? dbStatus.toUpperCase() : 'PREPARANDO', [dbStatus]);

  useEffect(() => {
    if (!orderId) {
      console.warn("[DineSplit] No se puede iniciar seguimiento: ID de orden no encontrado.");
      return;
    }

    if (!supabase) {
      console.error("[DineSplit] Cliente Supabase no disponible.");
      return;
    }

    // LOG DE DIAGNÓSTICO
    console.log(`[DineSplit] Intento de conexión para ID: ${orderId}`);

    // SINCRO INICIAL: Asegura el punto de partida correcto
    const fetchCurrentStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .maybeSingle();
        
        if (error) throw error;

        // VERIFICACIÓN DE EXISTENCIA: Si no existe, limpiar y salir
        if (!data) {
          console.error("[DineSplit] La orden ya no existe en la base de datos.");
          localStorage.removeItem(ACTIVE_ORDER_KEY);
          onBack(); // Redirigir al Menú
          return;
        }

        const status = data.status.toUpperCase();
        setDbStatus(status);
        if (status === 'PAGADO' && onRedirectToFeedback) onRedirectToFeedback();
      } catch (err) {
        console.error("[DineSplit] Error en fetch inicial:", err);
      }
    };

    // SUSCRIPCIÓN ROBUSTA
    const setupRealtime = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      setConnectionStatus('connecting');

      const channel = supabase
        .channel(`order-live-${orderId}`)
        .on(
          'postgres_changes',
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'orders', 
            filter: `id=eq.${orderId}` 
          },
          (payload) => {
            console.log(`[DineSplit] Evento recibido: ${payload.new.status}`);
            
            const nextStatus = payload.new.status.toUpperCase();
            setDbStatus(nextStatus);
            
            setIsFlickering(true);
            setTimeout(() => setIsFlickering(false), 600);

            if (nextStatus === 'PAGADO' && onRedirectToFeedback) {
              onRedirectToFeedback();
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[DineSplit] Canal conectado: ${orderId}`);
            setConnectionStatus('connected');
            if (retryTimeoutRef.current) {
              window.clearTimeout(retryTimeoutRef.current);
              retryTimeoutRef.current = null;
            }
          } else {
            setConnectionStatus('error');
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              if (!retryTimeoutRef.current) {
                retryTimeoutRef.current = window.setTimeout(() => {
                  retryTimeoutRef.current = null;
                  setupRealtime();
                }, 5000);
              }
            }
          }
        });

      channelRef.current = channel;
    };

    fetchCurrentStatus();
    setupRealtime();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (retryTimeoutRef.current) window.clearTimeout(retryTimeoutRef.current);
    };
  }, [orderId, onRedirectToFeedback, onBack]);

  // 2. CONFIGURACIÓN VISUAL SEGÚN DB
  const statusConfig = useMemo(() => {
    switch (normalizedStatus) {
      case 'SERVIDO':
        return {
          icon: 'restaurant',
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-400/20',
          ringColor: 'border-emerald-400',
          message: '🍽️ ¡Pedido servido!',
          description: 'Disfruta de tu comida. ¡Buen provecho!'
        };
      case 'PAGADO':
        return {
          icon: 'check_circle',
          color: 'text-blue-400',
          bgColor: 'bg-blue-400/20',
          ringColor: 'border-blue-400',
          message: '¡Gracias por visitarnos!',
          description: 'Cerrando sesión de mesa...'
        };
      case 'PREPARANDO':
      default:
        return {
          icon: 'skillet',
          color: 'text-primary',
          bgColor: 'bg-primary/20',
          ringColor: 'border-primary',
          message: '👨‍🍳 En preparación...',
          description: 'El chef está trabajando en tu orden.'
        };
    }
  }, [normalizedStatus]);

  // 3. MAPEO DE ESTADOS DE UI (TIMELINE)
  const steps = useMemo(() => [
    { 
      label: 'Orden Enviada', 
      desc: 'Recibido en cocina.', 
      done: true, 
      current: false 
    },
    { 
      label: 'En Preparación', 
      desc: 'Cocinando con amor.', 
      done: normalizedStatus === 'SERVIDO' || normalizedStatus === 'PAGADO', 
      current: normalizedStatus === 'PREPARANDO' 
    },
    { 
      label: 'Servido', 
      desc: '¡Listo en tu mesa!', 
      done: normalizedStatus === 'PAGADO', 
      current: normalizedStatus === 'SERVIDO' 
    },
  ], [normalizedStatus]);

  return (
    <div className={`flex flex-col flex-1 h-screen bg-background-dark text-white overflow-hidden relative font-display transition-colors duration-500 ${isFlickering ? 'bg-primary/10' : ''}`}>
      <div className="sticky top-0 z-10 flex items-center bg-background-dark/95 backdrop-blur-md p-4 justify-between border-b border-white/10">
        <div className="flex flex-col flex-1">
          <h2 className="text-lg font-bold">Mesa {tableNumber || '--'}</h2>
          <div className="flex items-center gap-1.5">
            <div className={`size-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-primary animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[9px] font-black uppercase tracking-widest text-text-secondary opacity-60">
              {connectionStatus === 'connected' ? 'Canal Estable' : 'Sincronizando...'}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end bg-surface-dark/50 px-3 py-1 rounded-full border border-white/5">
          <span className="text-text-secondary text-[10px] font-black uppercase tracking-wider mr-2">ID</span>
          <p className="text-primary text-sm font-black tabular-nums">#{orderId?.split('-')[0] || '----'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-44 no-scrollbar">
        <div className="px-4 py-12 flex flex-col items-center animate-fade-in">
          <div className="relative mb-8">
            <div className={`absolute inset-0 ${statusConfig.bgColor} rounded-full blur-2xl opacity-40 ${normalizedStatus === 'PREPARANDO' ? 'animate-pulse' : ''}`}></div>
            <div className={`relative bg-surface-dark w-28 h-28 rounded-full flex items-center justify-center border-2 ${statusConfig.ringColor} transition-all duration-700 shadow-2xl ${isFlickering ? 'scale-110 border-primary shadow-primary/30' : ''}`}>
              <span className={`material-symbols-outlined ${statusConfig.color} text-6xl transition-all duration-500`}>
                {statusConfig.icon}
              </span>
            </div>
          </div>
          <h2 className="tracking-tight text-[28px] font-black leading-tight text-center mb-2 px-6 italic">
            {statusConfig.message}
          </h2>
          <p className="text-text-secondary text-sm font-medium opacity-80 text-center px-10">
            {statusConfig.description}
          </p>
        </div>

        <div className="px-6 pb-6">
          <div className="bg-surface-dark rounded-3xl p-6 shadow-xl border border-white/5 relative overflow-hidden">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-8 text-primary/60 text-center">Progreso de la Orden</h3>
            <div className="grid grid-cols-[40px_1fr] gap-x-4">
              {steps.map((step, idx, arr) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-background-dark shadow-lg transition-all duration-500 ${step.done ? 'bg-primary' : step.current ? 'border-2 border-primary bg-primary/10 animate-pulse' : 'bg-white/10'}`}>
                      <span className="material-symbols-outlined text-base font-bold">
                        {step.done ? 'check' : step.current ? 'local_fire_department' : 'circle'}
                      </span>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-[2px] h-full min-h-[44px] grow rounded-full my-1 transition-all duration-700 ${step.done ? 'bg-primary' : 'bg-white/10'}`}></div>
                    )}
                  </div>
                  <div className={`flex flex-1 flex-col pb-10 transition-all duration-500 ${!step.done && !step.current ? 'opacity-30' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center">
                      <p className={`text-base font-black ${step.current ? 'text-primary scale-105 origin-left' : 'text-white'}`}>{step.label}</p>
                      {step.current && <span className="bg-primary/20 text-primary text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border border-primary/20">Actual</span>}
                    </div>
                    <p className="text-text-secondary text-xs leading-relaxed mt-1 font-medium">{step.desc}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full px-4 pt-16 pb-8 bg-gradient-to-t from-background-dark via-background-dark to-transparent z-20 pointer-events-none">
        <div className="max-w-md mx-auto flex flex-col gap-3 pointer-events-auto">
          <div className="flex gap-3">
            <button onClick={onBack} className="flex-1 bg-surface-dark border border-white/10 text-white h-14 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg">
              <span className="material-symbols-outlined text-xl">restaurant_menu</span> Menú
            </button>
            <button onClick={() => setIsWaiterModalOpen(true)} className="flex-1 bg-surface-dark border border-primary/30 text-primary h-14 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg">
              <span className="material-symbols-outlined text-xl filled">hail</span> Mesero
            </button>
          </div>
          <button onClick={onNext} className="w-full bg-primary text-background-dark h-16 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-[0_4px_30px_rgba(19,236,106,0.3)] hover:brightness-110 active:scale-[0.98] transition-all">
            <span>Pagar Cuenta</span>
            <span className="material-symbols-outlined font-black">payments</span>
          </button>
        </div>
      </div>

      {isWaiterModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsWaiterModalOpen(false)}></div>
          <div className="bg-[#102217] w-full max-w-md mx-auto rounded-t-[40px] p-8 border-t border-white/10 relative z-10 animate-fade-in-up">
            <div className="flex justify-center mb-6"><div className="w-12 h-1.5 bg-white/20 rounded-full"></div></div>
            <div className="flex items-center gap-5 mb-8">
              <img src={waiter?.profile_photo_url || 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?q=80&w=200&auto=format&fit=crop'} alt="Staff" className="size-16 rounded-full object-cover border-2 border-primary" />
              <div>
                <h3 className="text-2xl font-black text-white">{waiter?.nickname || 'Tu Mesero'}</h3>
                <p className="text-text-secondary text-sm">¿Cómo podemos ayudarte?</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button className="h-20 bg-primary/10 border border-primary/30 rounded-2xl flex flex-col items-center justify-center gap-1 active:bg-primary/20 transition-colors">
                <span className="material-symbols-outlined text-primary text-3xl">local_drink</span>
                <span className="text-[10px] font-black uppercase text-primary">Traer Agua</span>
              </button>
              <button className="h-20 bg-primary/10 border border-primary/30 rounded-2xl flex flex-col items-center justify-center gap-1 active:bg-primary/20 transition-colors">
                <span className="material-symbols-outlined text-primary text-3xl">receipt_long</span>
                <span className="text-[10px] font-black uppercase text-primary">La Cuenta</span>
              </button>
            </div>
            <button onClick={() => setIsWaiterModalOpen(false)} className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl mt-6 text-white font-bold">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderProgressView;
