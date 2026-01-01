
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
  const [currentView, setCurrentView] = useState<AppView>('SCAN');
  const [loading, setLoading] = useState(true);
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
   * Función central para iniciar sesión en una mesa.
   * Realiza un bypass de autenticación de usuario y carga el contexto del restaurante/mesa.
   */
  const handleStartSession = useCallback(async (accessCode: string, tableNum: string, isFromStorage = false) => {
    if (!accessCode || !tableNum) {
      setLoading(false);
      return false;
    }
    
    setLoading(true);
    const cleanCode = accessCode.trim().toUpperCase();

    try {
      // 1. Validación Silenciosa del Restaurante
      const { data: resData, error: resError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', cleanCode)
        .maybeSingle();

      if (resError || !resData) {
        console.error("Restaurante no encontrado");
        if (!isFromStorage) alert("El código del restaurante no es válido.");
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
        return false;
      }

      // 2. Validación Silenciosa de la Mesa
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', parseInt(tableNum))
        .maybeSingle();

      if (tableError || !tableData) {
        console.error("Mesa no encontrada");
        if (!isFromStorage) alert(`La mesa ${tableNum} no está disponible.`);
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
        return false;
      }

      // 3. Cargar Staff / Mesero asignado
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

      // 4. Cargar Menú y Categorías (Contexto de Aplicación)
      const [catRes, itemRes] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', resData.id).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', resData.id).order('sort_order')
      ]);

      // Guardar estados globales
      setRestaurant(resData);
      setCurrentTable(tableData);
      setCurrentWaiter(waiterInfo);
      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      
      // 5. Persistencia: Guardar sesión para recargas
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        res: cleanCode,
        table: tableNum,
        timestamp: Date.now()
      }));

      // Redirección Forzada: Si es bypass, saltamos directamente a GUEST_INFO
      setCurrentView('GUEST_INFO');
      setLoading(false);
      return true;

    } catch (err) {
      console.error("Error en bypass de autenticación:", err);
      localStorage.removeItem(SESSION_KEY);
      setLoading(false);
      return false;
    }
  }, []);

  /**
   * Efecto de Autenticación de Mesa (Prioridad Máxima)
   */
  useEffect(() => {
    const initAutobypass = async () => {
      const params = new URLSearchParams(window.location.search);
      const resParam = params.get('res');
      const tableParam = params.get('table');

      // PRIORIDAD 1: Parámetros en la URL (Escaneo fresco)
      if (resParam && tableParam) {
        console.log("Bypass detectado en URL:", resParam, tableParam);
        const success = await handleStartSession(resParam, tableParam);
        if (success) {
          // Limpiar URL para evitar re-procesamiento pero mantener el estado
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
      }

      // PRIORIDAD 2: Sesión persistente en LocalStorage
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        try {
          const { res, table, timestamp } = JSON.parse(savedSession);
          // La sesión expira en 8 horas para seguridad
          if (Date.now() - timestamp < 8 * 60 * 60 * 1000) {
            console.log("Restaurando sesión de mesa desde storage");
            const success = await handleStartSession(res, table, true);
            if (success) return;
          }
        } catch (e) {
          console.error("Error leyendo sesión guardada");
        }
      }

      // Si no hay bypass ni sesión, mostrar pantalla inicial (Scan/Manual)
      localStorage.removeItem(SESSION_KEY);
      setLoading(false);
    };

    initAutobypass();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-dark">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="size-20 border-4 border-primary/20 rounded-full"></div>
            <div className="absolute top-0 size-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-3xl animate-pulse">restaurant</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-primary text-xl font-black tracking-widest uppercase animate-pulse">Accediendo a Mesa...</p>
            <p className="text-text-secondary text-xs mt-2 font-medium">Configurando tu experiencia digital</p>
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
