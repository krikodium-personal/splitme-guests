
import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { AppView, Guest, OrderItem, MenuItem } from './types';
import ScanView from './views/ScanView';
import GuestInfoView from './views/GuestInfoView';
import MenuView from './views/MenuView';
import OrderSummaryView from './views/OrderSummaryView';
import OrderProgressView from './views/OrderProgressView';
import SplitBillView from './views/SplitBillView';
import IndividualShareView from './views/IndividualShareView';
import CheckoutView from './views/CheckoutView';
import FeedbackView from './views/FeedbackView';
import ConfirmationView from './views/ConfirmationView';

const SESSION_KEY = 'dinesplit_active_session';

const App: React.FC = () => {
  // Logs iniciales para depuración en producción (Vercel)
  console.log('[DineSplit] App inicializada');

  const [currentView, setCurrentView] = useState<AppView>('SCAN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [restaurant, setRestaurant] = useState<any>(null);
  const [currentTable, setCurrentTable] = useState<any>(null);
  const [currentWaiter, setCurrentWaiter] = useState<any>(null);
  
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [guests, setGuests] = useState<Guest[]>([
    { id: '1', name: 'Invitado 1 (Tú)', isHost: true }
  ]);
  const [activeGuestId, setActiveGuestId] = useState<string>('1');
  const [activeCategory, setActiveCategory] = useState<string>('Destacados');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);

  /**
   * Carga los datos del restaurante, mesa y menú.
   */
  const handleStartSession = useCallback(async (accessCode: string, tableNum: string, isFromStorage = false) => {
    console.log(`[DineSplit] Iniciando sesión: Res=${accessCode}, Mesa=${tableNum}, Storage=${isFromStorage}`);
    
    if (!accessCode || !tableNum) {
      console.warn('[DineSplit] Parámetros insuficientes para iniciar sesión');
      setLoading(false);
      return false;
    }
    
    setLoading(true);
    setError(null);
    const cleanCode = accessCode.trim().toUpperCase();

    try {
      // 1. Verificar conexión a Supabase
      if (!supabase) {
        throw new Error("Cliente de base de datos no inicializado correctamente.");
      }

      // 2. Validación del Restaurante
      console.log('[DineSplit] Buscando restaurante...');
      const { data: resData, error: resError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', cleanCode)
        .maybeSingle();

      if (resError) throw new Error(`Error Supabase (Restaurante): ${resError.message}`);
      if (!resData) {
        setError(`El restaurante con código "${cleanCode}" no existe.`);
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
        return false;
      }

      // 3. Validación de la Mesa
      console.log('[DineSplit] Buscando mesa...');
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', parseInt(tableNum))
        .maybeSingle();

      if (tableError) throw new Error(`Error Supabase (Mesa): ${tableError.message}`);
      if (!tableData) {
        setError(`La mesa ${tableNum} no está configurada en este restaurante.`);
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
        return false;
      }

      // 4. Cargar Mesero
      console.log('[DineSplit] Cargando staff...');
      let waiterInfo = null;
      if (tableData.waiter_id) {
        const { data: waiterData } = await supabase
          .from('waiters')
          .select('*')
          .eq('id', tableData.waiter_id)
          .maybeSingle();
        waiterInfo = waiterData;
      }
      
      if (!waiterInfo) {
        const { data: staffData } = await supabase
          .from('waiters')
          .select('*')
          .eq('restaurant_id', resData.id)
          .limit(1)
          .maybeSingle();
        waiterInfo = staffData;
      }

      // 5. Cargar Menú y Categorías
      console.log('[DineSplit] Cargando menú y categorías...');
      const [catRes, itemRes] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', resData.id).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', resData.id).order('sort_order')
      ]);

      if (catRes.error) console.error("Error cargando categorías:", catRes.error);
      if (itemRes.error) console.error("Error cargando platos:", itemRes.error);

      // Guardar estados globales
      setRestaurant(resData);
      setCurrentTable(tableData);
      setCurrentWaiter(waiterInfo);
      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      
      // 6. Persistencia Local
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        res: cleanCode,
        table: tableNum,
        timestamp: Date.now()
      }));

      console.log('[DineSplit] Sesión establecida con éxito');
      setCurrentView('GUEST_INFO');
      setLoading(false);
      return true;

    } catch (err: any) {
      console.error("[DineSplit] Error crítico en handleStartSession:", err);
      setError(`Ocurrió un problema de conexión: ${err.message || 'Error desconocido'}`);
      setLoading(false);
      return false;
    }
  }, []);

  /**
   * Efecto de Inicio: Maneja el Bypass de URL y Persistencia
   */
  useEffect(() => {
    const initApp = async () => {
      const params = new URLSearchParams(window.location.search);
      const resParam = params.get('res');
      const tableParam = params.get('table');

      console.log('[DineSplit] Detectando contexto inicial...', { res: resParam, table: tableParam });

      // CASO 1: Entrada por URL (Prioridad Absoluta)
      if (resParam && tableParam) {
        const success = await handleStartSession(resParam, tableParam);
        if (success) {
          // Limpiar parámetros de la URL para estética
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
      }

      // CASO 2: Sesión Guardada (LocalStorage)
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        try {
          const { res, table, timestamp } = JSON.parse(savedSession);
          // Si la sesión tiene menos de 12 horas, restaurar
          if (Date.now() - timestamp < 12 * 60 * 60 * 1000) {
            console.log('[DineSplit] Restaurando sesión previa...');
            const success = await handleStartSession(res, table, true);
            if (success) return;
          }
        } catch (e) {
          console.error("Error al parsear sesión guardada", e);
        }
      }

      // CASO 3: Nada detectado, ir al escáner manual
      console.log('[DineSplit] No hay sesión activa ni parámetros, redirigiendo a SCAN');
      setLoading(false);
      setCurrentView('SCAN');
    };

    initApp();
  }, [handleStartSession]);

  const handleSendOrder = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurant.id,
          table_id: currentTable.id,
          waiter_id: currentWaiter?.id,
          status: 'PREPARING'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const itemsToInsert = cart.map(item => ({
        order_id: orderData.id,
        menu_item_id: item.itemId,
        guest_id: item.guestId,
        quantity: item.quantity
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsToInsert)
        .select();

      if (itemsError) throw itemsError;

      const updatedCart = cart.map(cartItem => {
        const dbItem = insertedItems.find(di => 
          di.menu_item_id === cartItem.itemId && 
          di.guest_id === cartItem.guestId
        );
        return {
          ...cartItem,
          id: dbItem ? dbItem.id : cartItem.id,
          order_id: orderData.id
        };
      });

      setCart(updatedCart);
      setCurrentView('PROGRESS');
    } catch (err: any) {
      console.error("Error al persistir orden:", err);
      alert(`No pudimos enviar tu orden: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const navigate = useCallback((view: AppView) => {
    setCurrentView(view);
  }, []);

  const handleAddToCart = useCallback((item: MenuItem, guestId: string, extras: string[], removedIngredients: string[]) => {
    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      itemId: item.id,
      guestId: guestId,
      quantity: 1,
      extras,
      removedIngredients
    };
    setCart(prev => [...prev, newItem]);
  }, []);

  const handleUpdateCartItem = useCallback((cartItemId: string, updates: Partial<OrderItem>) => {
    setCart(prev => prev.map(item => item.id === cartItemId ? { ...item, ...updates } : item));
  }, []);

  const handleUpdateQuantity = useCallback((id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  }, []);

  const handleEditItem = useCallback((cartItem: OrderItem) => {
    setEditingCartItem(cartItem);
    setCurrentView('MENU');
  }, []);

  const handleNavigateToCategory = useCallback((guestId: string, category: string) => {
    setActiveGuestId(guestId);
    setActiveCategory(category);
    setCurrentView('MENU');
  }, []);

  // Pantalla de Error Crítico
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark p-8 text-center">
        <div className="size-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-red-500 text-4xl">error</span>
        </div>
        <h2 className="text-white text-2xl font-black mb-4">Ups, algo salió mal</h2>
        <p className="text-text-secondary text-sm mb-8">{error}</p>
        <button 
          onClick={() => window.location.href = '/'} 
          className="bg-primary text-background-dark px-8 py-3 rounded-xl font-bold active:scale-95 transition-transform"
        >
          Volver a Escanear
        </button>
      </div>
    );
  }

  // Pantalla de Carga Sincronizada
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-dark">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="size-24 border-4 border-primary/10 rounded-full"></div>
            <div className="absolute top-0 size-24 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-4xl animate-pulse">restaurant</span>
            </div>
          </div>
          <div className="text-center px-8">
            <p className="text-primary text-xl font-black tracking-widest uppercase animate-pulse mb-2">
              Sincronizando...
            </p>
            <p className="text-text-secondary text-xs font-medium max-w-[200px] mx-auto leading-relaxed">
              Estamos validando tu acceso y cargando el menú del restaurante.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'SCAN':
        return <ScanView onNext={handleStartSession} restaurantName={restaurant?.name} />;
      case 'GUEST_INFO':
        return (
          <GuestInfoView 
            onBack={() => {
              localStorage.removeItem(SESSION_KEY);
              navigate('SCAN');
            }} 
            onNext={() => navigate('MENU')} 
            guests={guests} 
            setGuests={setGuests} 
            table={currentTable}
            waiter={currentWaiter}
            restaurant={restaurant}
          />
        );
      case 'MENU':
        return (
          <MenuView 
            onNext={() => navigate('ORDER_SUMMARY')} 
            guests={guests} 
            setGuests={setGuests} 
            cart={cart} 
            onAddToCart={handleAddToCart} 
            onUpdateCartItem={handleUpdateCartItem}
            onIndividualShare={() => navigate('INDIVIDUAL_SHARE')}
            selectedGuestId={activeGuestId}
            onSelectGuest={setActiveGuestId}
            initialCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            editingCartItem={editingCartItem}
            onCancelEdit={() => setEditingCartItem(null)}
            menuItems={menuItems}
            categories={categories}
            restaurantName={restaurant?.name}
            tableNumber={currentTable?.table_number}
          />
        );
      case 'ORDER_SUMMARY':
        return (
          <OrderSummaryView 
            guests={guests}
            cart={cart}
            onBack={() => navigate('MENU')}
            onNavigateToCategory={handleNavigateToCategory}
            onEditItem={handleEditItem}
            onSend={handleSendOrder}
            onUpdateQuantity={handleUpdateQuantity}
            menuItems={menuItems}
            categories={categories}
            tableNumber={currentTable?.table_number}
            waiter={currentWaiter}
          />
        );
      case 'PROGRESS':
        return (
          <OrderProgressView 
            cart={cart}
            onNext={() => navigate('SPLIT_BILL')}
            onBack={() => navigate('MENU')}
            tableNumber={currentTable?.table_number}
            waiter={currentWaiter}
          />
        );
      case 'SPLIT_BILL':
        return (
          <SplitBillView 
            guests={guests}
            cart={cart}
            onBack={() => navigate('PROGRESS')}
            onConfirm={() => navigate('CHECKOUT')}
            menuItems={menuItems}
          />
        );
      case 'INDIVIDUAL_SHARE':
        return (
          <IndividualShareView 
            onBack={() => navigate('MENU')}
            onPay={() => navigate('FEEDBACK')}
          />
        );
      case 'CHECKOUT':
        return (
          <CheckoutView 
            onBack={() => navigate('SPLIT_BILL')}
            onConfirm={() => navigate('FEEDBACK')}
            cart={cart}
            guests={guests}
            menuItems={menuItems}
            tableNumber={currentTable?.table_number}
          />
        );
      case 'FEEDBACK':
        return (
          <FeedbackView 
            onNext={() => {
              localStorage.removeItem(SESSION_KEY);
              navigate('CONFIRMATION');
            }}
            onSkip={() => {
              localStorage.removeItem(SESSION_KEY);
              navigate('CONFIRMATION');
            }}
            cart={cart}
            menuItems={menuItems}
            waiter={currentWaiter}
            restaurant={restaurant}
          />
        );
      case 'CONFIRMATION':
        return (
          <ConfirmationView 
            onRestart={() => {
              localStorage.removeItem(SESSION_KEY);
              window.location.href = '/';
            }}
            guests={guests}
            tableNumber={currentTable?.table_number}
          />
        );
      default:
        return <ScanView onNext={handleStartSession} />;
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background-dark shadow-2xl relative flex flex-col overflow-hidden">
      {renderView()}
    </div>
  );
};

export default App;
