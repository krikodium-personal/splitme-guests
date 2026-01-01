
import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  // Detection of URL parameters to decide initial bypass
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const resParam = searchParams.get('res');
  const tableParam = searchParams.get('table');
  
  const [currentView, setCurrentView] = useState<AppView>('SCAN');
  const [loading, setLoading] = useState(true); // Start as true to check context first
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
   * Loads restaurant, table and menu data.
   */
  const handleStartSession = useCallback(async (accessCode: string, tableNum: string) => {
    console.log(`[DineSplit] Starting session logic for: Res=${accessCode}, Table=${tableNum}`);
    setLoading(true);
    setError(null);
    const cleanCode = accessCode.trim().toUpperCase();

    try {
      if (!supabase) throw new Error("Database connection unavailable.");

      // 1. Validate Restaurant
      const { data: resData, error: resError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', cleanCode)
        .maybeSingle();

      if (resError) throw new Error(`Error fetching restaurant: ${resError.message}`);
      if (!resData) {
        setError(`El restaurante "${cleanCode}" no existe.`);
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
        return false;
      }

      // 2. Validate Table
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', parseInt(tableNum))
        .maybeSingle();

      if (tableError) throw new Error(`Error fetching table: ${tableError.message}`);
      if (!tableData) {
        setError(`La mesa ${tableNum} no está configurada.`);
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
        return false;
      }

      // 3. Load Staff
      let waiterInfo = null;
      if (tableData.waiter_id) {
        const { data: waiterData } = await supabase.from('waiters').select('*').eq('id', tableData.waiter_id).maybeSingle();
        waiterInfo = waiterData;
      }
      if (!waiterInfo) {
        const { data: staffData } = await supabase.from('waiters').select('*').eq('restaurant_id', resData.id).limit(1).maybeSingle();
        waiterInfo = staffData;
      }

      // 4. Load Menu
      const [catRes, itemRes] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', resData.id).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', resData.id).order('sort_order')
      ]);

      setRestaurant(resData);
      setCurrentTable(tableData);
      setCurrentWaiter(waiterInfo);
      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        res: cleanCode,
        table: tableNum,
        timestamp: Date.now()
      }));

      setCurrentView('GUEST_INFO');
      setLoading(false);
      return true;

    } catch (err: any) {
      console.error("[DineSplit] Init error:", err);
      setError(`Error: ${err.message || 'Error de conexión'}`);
      setLoading(false);
      return false;
    }
  }, []);

  /**
   * Effect to check URL bypass or storage on mount
   */
  useEffect(() => {
    const initApp = async () => {
      // Case 1: URL Parameters (Highest Priority)
      if (resParam && tableParam) {
        console.log('[DineSplit] Bypass URL parameters detected.');
        const success = await handleStartSession(resParam, tableParam);
        if (success) {
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
      }

      // Case 2: Storage
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        try {
          const { res, table, timestamp } = JSON.parse(savedSession);
          if (Date.now() - timestamp < 12 * 60 * 60 * 1000) {
            const success = await handleStartSession(res, table);
            if (success) return;
          }
        } catch (e) {
          console.error("Invalid session storage");
        }
      }

      // Case 3: Manual Entrance (No automatic camera start)
      console.log('[DineSplit] No valid context found. Directing to SCAN view.');
      setLoading(false);
      setCurrentView('SCAN');
    };

    initApp();
  }, [handleStartSession, resParam, tableParam]);

  const navigate = (view: AppView) => setCurrentView(view);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-5xl mb-4">error</span>
        <h2 className="text-white text-xl font-bold mb-4">No pudimos conectar con tu mesa</h2>
        <p className="text-text-secondary text-sm mb-8">{error}</p>
        <button onClick={() => window.location.href = '/'} className="bg-primary text-background-dark px-8 py-3 rounded-xl font-bold">Volver al inicio</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark">
        <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
        <div className="text-center px-10">
          <p className="text-primary text-xs font-black uppercase tracking-[0.2em] animate-pulse">Sincronizando Mesa</p>
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
            onBack={() => { localStorage.removeItem(SESSION_KEY); navigate('SCAN'); }} 
            onNext={() => navigate('MENU')} 
            guests={guests} setGuests={setGuests} table={currentTable} waiter={currentWaiter} restaurant={restaurant}
          />
        );
      case 'MENU':
        return (
          <MenuView 
            onNext={() => navigate('ORDER_SUMMARY')} guests={guests} setGuests={setGuests} cart={cart} 
            onAddToCart={(item, gId, ext, rem) => {
              const newItem = { id: Math.random().toString(36).substr(2, 9), itemId: item.id, guestId: gId, quantity: 1, extras: ext, removedIngredients: rem };
              setCart(prev => [...prev, newItem]);
            }} 
            onUpdateCartItem={(id, upd) => setCart(prev => prev.map(it => it.id === id ? {...it, ...upd} : it))}
            onIndividualShare={() => navigate('INDIVIDUAL_SHARE')}
            selectedGuestId={activeGuestId} onSelectGuest={setActiveGuestId}
            initialCategory={activeCategory} onCategoryChange={setActiveCategory}
            editingCartItem={editingCartItem} onCancelEdit={() => setEditingCartItem(null)}
            menuItems={menuItems} categories={categories} restaurantName={restaurant?.name} tableNumber={currentTable?.table_number}
          />
        );
      case 'ORDER_SUMMARY':
        return (
          <OrderSummaryView 
            guests={guests} cart={cart} onBack={() => navigate('MENU')}
            onNavigateToCategory={(gId, cat) => { setActiveGuestId(gId); setActiveCategory(cat); navigate('MENU'); }}
            onEditItem={(item) => { setEditingCartItem(item); navigate('MENU'); }}
            onSend={() => navigate('PROGRESS')}
            onUpdateQuantity={(id, d) => setCart(prev => prev.map(it => it.id === id ? {...it, quantity: Math.max(1, it.quantity + d)} : it))}
            menuItems={menuItems} categories={categories} tableNumber={currentTable?.table_number} waiter={currentWaiter}
          />
        );
      case 'PROGRESS':
        return <OrderProgressView cart={cart} onNext={() => navigate('SPLIT_BILL')} onBack={() => navigate('MENU')} tableNumber={currentTable?.table_number} waiter={currentWaiter} />;
      case 'SPLIT_BILL':
        return <SplitBillView guests={guests} cart={cart} onBack={() => navigate('PROGRESS')} onConfirm={() => navigate('CHECKOUT')} menuItems={menuItems} />;
      case 'CHECKOUT':
        return <CheckoutView onBack={() => navigate('SPLIT_BILL')} onConfirm={() => navigate('FEEDBACK')} cart={cart} guests={guests} menuItems={menuItems} tableNumber={currentTable?.table_number} />;
      case 'FEEDBACK':
        return <FeedbackView onNext={() => navigate('CONFIRMATION')} onSkip={() => navigate('CONFIRMATION')} cart={cart} menuItems={menuItems} waiter={currentWaiter} restaurant={restaurant} />;
      case 'CONFIRMATION':
        return <ConfirmationView onRestart={() => { localStorage.removeItem(SESSION_KEY); window.location.href = '/'; }} guests={guests} tableNumber={currentTable?.table_number} />;
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
