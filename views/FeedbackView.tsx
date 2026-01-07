
import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { OrderItem, MenuItem } from '../types';
import { formatPrice } from './MenuView';

interface FeedbackViewProps {
  onNext: () => void;
  onSkip: () => void;
  cart: OrderItem[];
  menuItems: MenuItem[];
  waiter?: any;
  restaurant?: any;
}

const FeedbackView: React.FC<FeedbackViewProps> = ({ onNext, onSkip, cart, menuItems, waiter, restaurant }) => {
  const [restaurantRating, setRestaurantRating] = useState(0);
  const [waiterRating, setWaiterRating] = useState(0);
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [tipPercentage, setTipPercentage] = useState<number>(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Agrupar items únicos para la interfaz
  const uniqueItems = Array.from(new Set(cart.map(i => i.itemId)))
    .map(id => menuItems.find(m => m.id === id))
    .filter(Boolean) as MenuItem[];

  // Calcular el total de la orden para la propina
  const orderTotal = cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? menuItem.price * item.quantity : 0);
  }, 0);

  const tipAmount = useMemo(() => (orderTotal * tipPercentage) / 100, [orderTotal, tipPercentage]);

  const handleItemRating = (itemId: string, rating: number) => {
    setItemRatings(prev => ({ ...prev, [itemId]: rating }));
  };

  // Función para actualizar el promedio del mesero en tiempo real para el Panel Admin
  const syncWaiterStats = async (waiterId: string) => {
    try {
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('waiter_rating')
        .eq('waiter_id', waiterId)
        .not('waiter_rating', 'is', null);

      if (reviewsData && reviewsData.length > 0) {
        const ratings = reviewsData.map(r => r.waiter_rating);
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        await supabase
          .from('waiters')
          .update({ average_rating: parseFloat(avg.toFixed(1)) })
          .eq('id', waiterId);
      }
    } catch (e) {
      console.error("Error sincronizando estadísticas del mesero:", e);
    }
  };

  // Función para actualizar el promedio del plato para el Panel Admin (Favoritos)
  const syncMenuItemStats = async (menuItemId: string) => {
    try {
      const { data: itemRatingsData } = await supabase
        .from('order_items')
        .select('item_rating')
        .eq('menu_item_id', menuItemId)
        .not('item_rating', 'is', null);

      if (itemRatingsData && itemRatingsData.length > 0) {
        const ratings = itemRatingsData.map(r => r.item_rating);
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        await supabase
          .from('menu_items')
          .update({ average_rating: parseFloat(avg.toFixed(1)) })
          .eq('id', menuItemId);
      }
    } catch (e) {
      console.error("Error sincronizando estadísticas del plato:", e);
    }
  };

  const handleSendFeedback = async () => {
    if (restaurantRating === 0) {
      alert("Por favor, califica al menos la experiencia general.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. VALIDACIÓN DE IDs
      const waiterId = (waiter && typeof waiter.id === 'string' && waiter.id.length > 10) ? waiter.id : null;
      const orderId = (cart[0] as any)?.order_id || null;

      // 2. INSERCIÓN EN 'reviews'
      const { error: reviewError } = await supabase
        .from('reviews')
        .insert({
          restaurant_id: restaurant?.id,
          order_id: orderId,
          waiter_id: waiterId,
          restaurant_rating: restaurantRating,
          waiter_rating: waiterRating > 0 ? waiterRating : null,
          comment: comment.trim() || null
        });

      if (reviewError) throw reviewError;

      // 3. ACTUALIZACIÓN MASIVA DE PLATOS ('order_items')
      // Usamos el ID real de la base de datos que ya viene en el carrito tras handleSendOrder
      const itemUpdatePromises = cart.map(async (cartItem) => {
        const rating = itemRatings[cartItem.itemId] || 0;
        if (rating > 0) {
          const { error: itemErr } = await supabase
            .from('order_items')
            .update({ item_rating: rating })
            .eq('id', cartItem.id); // Este ID ahora es el UUID real de Supabase
          
          if (!itemErr) {
            await syncMenuItemStats(cartItem.itemId);
          }
        }
      });

      await Promise.all(itemUpdatePromises);

      // 4. ACTUALIZAR ESTADÍSTICAS DEL MESERO
      if (waiterId && waiterRating > 0) {
        await syncWaiterStats(waiterId);
      }

      // 5. FLUJO DE ÉXITO
      setIsSuccess(true);
      setTimeout(() => {
        onNext();
      }, 2000);

    } catch (error: any) {
      console.error("Error crítico en feedback:", error);
      alert(`Error al guardar: ${error.message || 'Sin conexión'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const StarRating = ({ value, onChange, size = "text-4xl" }: { value: number, onChange: (v: number) => void, size?: string }) => (
    <div className="flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map(i => (
        <button 
          key={i} 
          type="button"
          onClick={() => onChange(i)}
          className={`${size} transition-all duration-200 transform active:scale-90 ${i <= value ? 'text-primary' : 'text-gray-600'}`}
        >
          <span className={`material-symbols-outlined ${i <= value ? 'filled' : ''}`}>star</span>
        </button>
      ))}
    </div>
  );

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-screen bg-background-dark text-white p-8 text-center animate-fade-in">
        <div className="size-24 bg-primary rounded-full flex items-center justify-center mb-8 animate-bounce shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-background-dark text-6xl font-black">check</span>
        </div>
        <h2 className="text-3xl font-black mb-3 tracking-tight">¡Gracias por tu opinión!</h2>
        <p className="text-text-secondary text-lg leading-relaxed">
          Tu feedback ya está en nuestro sistema.<br/>
          Cerrando sesión de la mesa...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-screen bg-background-dark text-white overflow-y-auto no-scrollbar">
      <nav className="sticky top-0 z-50 flex items-center justify-between p-4 bg-background-dark/95 backdrop-blur-md border-b border-white/5">
        <div className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer" onClick={onSkip}>
          <span className="material-symbols-outlined">close</span>
        </div>
        <h1 className="text-sm font-black uppercase tracking-[0.2em] text-text-secondary">Feedback</h1>
        <button onClick={onSkip} className="text-gray-400 text-sm font-bold hover:text-primary transition-colors">Omitir</button>
      </nav>

      <main className="flex-1 px-5 pb-32">
        <div className="py-8 text-center animate-fade-in-up">
          <h2 className="text-2xl font-black leading-tight mb-2 tracking-tight">¡Esperamos verte pronto!</h2>
          <p className="text-text-secondary text-sm">Tu opinión alimenta nuestro crecimiento.</p>
        </div>

        {/* DIMENSIÓN 1: Experiencia General y Muro de Voces */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary">storefront</span>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">Experiencia General</h3>
          </div>
          <div className="bg-surface-dark rounded-[2rem] p-8 shadow-xl border border-white/5 text-center mb-4">
            <StarRating value={restaurantRating} onChange={setRestaurantRating} />
            <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mt-6">
              {restaurantRating === 0 ? 'Califica al Restaurante' : 
               restaurantRating === 5 ? '¡Servicio Excelente!' : '¡Muchas gracias!'}
            </p>
          </div>
          
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Muro de Voces (Comentario)</label>
            <textarea 
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full bg-surface-dark border border-white/5 rounded-3xl p-6 text-white placeholder-gray-600 focus:ring-2 focus:ring-primary outline-none transition-all resize-none shadow-inner" 
              placeholder="¿Qué te pareció el ambiente hoy?" 
              rows={3}
            ></textarea>
          </div>
        </div>

        {/* DIMENSIÓN 2: Tu Anfitrión (Ranking de Staff) */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary">person</span>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">Tu Anfitrión</h3>
          </div>
          <div className="bg-surface-dark rounded-[2rem] p-6 border border-white/5 flex flex-col items-center gap-5 text-center shadow-lg">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl"></div>
              <img 
                alt={waiter?.nickname || 'Mesero'} 
                className="size-24 rounded-full object-cover border-4 border-primary/30 p-1 relative z-10" 
                src={waiter?.profile_photo_url || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyiwOtsINFh8RspVDg_Wx4QKXthNxCS7ZJlDSZvL6ADwFD3WRUpKHGhrscxV9dcR7w7guM4E-iFCNXx-tDgHs1BrbfGjolJoASehM-SEc4Pe6bKEx7zjcF4WAcON7mbdWJCepEdMPkBZ36lB_4tPTsJeNzTNqRNGKgusVb3U_X0WGEAgij6Y48HIunhj_BC8lxMdsB5ublmAltnyYerUKa_NkT8aybLFkaaRkQGQ_irdtS2ZQwrNGNj6b1ZrWY1HRClBeExJL615bG'}
              />
              <div className="absolute -bottom-1 -right-1 bg-primary text-background-dark text-[10px] font-black px-2 py-0.5 rounded-full z-20 border-2 border-surface-dark shadow-sm">
                {waiter?.average_rating || '5.0'}
              </div>
            </div>
            <div className="flex-1 w-full">
              <h4 className="font-black text-xl mb-1 tracking-tight">{waiter?.nickname || waiter?.full_name || 'Staff'}</h4>
              <p className="text-text-secondary text-xs mb-5">Califica el servicio de tu mesero</p>
              <StarRating value={waiterRating} onChange={setWaiterRating} size="text-3xl" />
            </div>
          </div>
        </div>

        {/* DIMENSIÓN 3: Tus Platillos (Favoritos del Público) */}
        {uniqueItems.length > 0 && (
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-2 mb-4 px-1">
              <span className="material-symbols-outlined text-primary">restaurant</span>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">Tus Platillos</h3>
            </div>
            <div className="flex flex-col gap-3">
              {uniqueItems.map((dish) => (
                <div key={dish.id} className="bg-surface-dark rounded-2xl p-4 flex items-center justify-between gap-4 border border-white/5 shadow-md">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="size-14 shrink-0 rounded-2xl bg-cover bg-center border border-white/10" style={{ backgroundImage: `url('${dish.image_url}')` }}></div>
                    <div className="flex flex-col min-w-0">
                      <h4 className="text-sm font-bold truncate leading-tight mb-1">{dish.name}</h4>
                      <p className="text-text-secondary text-[10px] font-black uppercase tracking-widest">${formatPrice(Number(dish.price))}</p>
                    </div>
                  </div>
                  <StarRating 
                    value={itemRatings[dish.id] || 0} 
                    onChange={(val) => handleItemRating(dish.id, val)} 
                    size="text-2xl"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DIMENSIÓN 4: Propina */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary">tips_and_updates</span>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">Propina</h3>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[
              { label: 'Ninguna', value: 0 },
              { label: '10%', value: 10 },
              { label: '15%', value: 15, badge: 'Sugerida' },
              { label: '20%', value: 20 },
              { label: 'Custom', value: 25 },
            ].map((t) => (
              <button 
                key={t.label} 
                onClick={() => setTipPercentage(t.value)}
                disabled={isSubmitting}
                className={`relative flex h-14 flex-col items-center justify-center rounded-2xl border transition-all active:scale-95 ${
                  tipPercentage === t.value 
                  ? 'bg-primary border-primary text-background-dark font-black shadow-lg shadow-primary/20' 
                  : 'bg-surface-dark border-white/5 text-white/40 font-bold hover:border-white/20'
                }`}
              >
                <span className="text-[11px] uppercase tracking-tighter">{t.label}</span>
                {t.badge && (
                  <div className="absolute -top-2 rounded-full bg-white px-2 py-0.5 text-[7px] font-black text-black shadow-lg uppercase tracking-tighter">
                    {t.badge}
                  </div>
                )}
              </button>
            ))}
          </div>
          {tipPercentage > 0 && (
            <div className="bg-surface-dark rounded-2xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-text-secondary text-sm font-medium">Subtotal de la orden</span>
                <span className="font-bold tabular-nums">${formatPrice(orderTotal)}</span>
              </div>
              <div className="flex justify-between items-center mb-3 pb-3 border-b border-white/10">
                <span className="text-text-secondary text-sm font-medium">Propina ({tipPercentage}%)</span>
                <span className="font-bold tabular-nums text-primary">${formatPrice(tipAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white font-black uppercase text-[10px] tracking-widest">Total con propina</span>
                <span className="text-xl font-black text-primary tabular-nums">${formatPrice(orderTotal + tipAmount)}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-8 z-20">
        <button 
          onClick={handleSendFeedback} 
          disabled={isSubmitting || restaurantRating === 0}
          className={`w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all shadow-2xl ${
            (isSubmitting || restaurantRating === 0) ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-primary text-background-dark shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="size-5 border-2 border-background-dark border-t-transparent rounded-full animate-spin"></div>
              <span>Sincronizando...</span>
            </>
          ) : (
            <>
              <span>Enviar Opinión</span>
              <span className="material-symbols-outlined font-black">send</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default FeedbackView;
