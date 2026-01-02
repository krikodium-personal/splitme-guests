
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

// --- CRITICAL PRODUCTION LOGGING ---
console.log("[DineSplit] Application Loaded at " + new Date().toISOString());

const SESSION_KEY = 'dinesplit_active_session';

const App: React.FC = () => {
  // 1. IMMEDIATE DETECTION & PERSISTENCE
  // We do this outside of any effect to ensure it's captured immediately
  const searchParams = new URLSearchParams(window.location.search);
  const resParam = searchParams.get('res');
  const tableParam = searchParams.get('table');

  if (resParam && tableParam) {
    console.log(`[DineSplit] Capturing URL params: Res=${resParam}, Table=${tableParam}`);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      res: resParam.toUpperCase(),
      table: tableParam,
      timestamp: Date.now()
    }));
    // Clean URL without reloading
    window.history.replaceState({}, '', window.location.pathname);
  }

  // App States
  const [currentView, setCurrentView] = useState<AppView>('INIT');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticMsg, setDiagnosticMsg] = useState('Iniciando sistema...');

  // Data States
  const [restaurant, setRestaurant] = useState<any>(null);
  const [currentTable, setCurrentTable] = useState<any>(null);
  const [currentWaiter, setCurrentWaiter] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [guests, setGuests] = useState<Guest[]>([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
  const [activeGuestId, setActiveGuestId] = useState<string>('1');
  const [activeCategory, setActiveCategory] = useState<string>('Destacados');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);

  const handleStartSession = useCallback(async (accessCode: string, tableNum: string) => {
    console.log(`[DineSplit] Fetching session for: ${accessCode}, Mesa ${tableNum}`);
    setLoading(true);
    setError(null);
    setDiagnosticMsg(`Conectando con local: ${accessCode}...`);

    try {
      if (!supabase) throw new Error("Supabase client is null. Check your env variables.");

      // Fetch Restaurant
      const { data: resData, error: resError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', accessCode.toUpperCase())
        .maybeSingle();

      if (resError) throw resError;
      if (!resData) throw new Error(`El local "${accessCode}" no existe.`);

      setDiagnosticMsg(`Localizado: ${resData.name}. Cargando mesa ${tableNum}...`);

      // Fetch Table
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', parseInt(tableNum))
        .maybeSingle();

      if (tableError) throw tableError;
      if (!tableData) throw new Error(`Mesa ${tableNum} no encontrada en este local.`);

      // Fetch Waiter and Menu Data in parallel
      setDiagnosticMsg("Cargando menú y personal...");
      const [waiterRes, catRes, itemRes] = await Promise.all([
        tableData.waiter_id 
          ? supabase.from('waiters').select('*').eq('id', tableData.waiter_id).maybeSingle()
          : supabase.from('waiters').select('*').eq('restaurant_id', resData.id).limit(1).maybeSingle(),
        supabase.from('categories').select('*').eq('restaurant_id', resData.id).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', resData.id).order('sort_order')
      ]);

      setRestaurant(resData);
      setCurrentTable(tableData);
      setCurrentWaiter(waiterRes.data);
      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      
      setCurrentView('GUEST_INFO');
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error("[DineSplit] Fatal Session Error:", err);
      setError(err.message || 'Error de conexión');
      setLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      console.log("[DineSplit] Running initApp useEffect...");
      const savedSession = localStorage.getItem(SESSION_KEY);
      
      if (savedSession) {
        try {
          const { res, table, timestamp } = JSON.parse(savedSession);
          // Only auto-restore if session is fresh (12h)
          if (Date.now() - timestamp < 12 * 60 * 60 * 1000) {
            const success = await handleStartSession(res, table);
            if (success) return;
          }
        } catch (e) {
          console.error("[DineSplit] Failed to parse saved session");
          localStorage.removeItem(SESSION_KEY);
        }
      }

      setLoading(false);
      setCurrentView('SCAN');
    };

    initApp();
  }, [handleStartSession]);

  const navigate = (view: AppView) => setCurrentView(view);

  // --- RECOVERY RENDER ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark p-8 text-center animate-fade-in">
        <div className="size-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-red-500 text-5xl">error</span>
        </div>
        <h2 className="text-white text-2xl font-black mb-4 uppercase tracking-tighter">Fallo de Conexión</h2>
        <p className="text-text-secondary text-sm mb-8 leading-relaxed px-4">{error}</p>
        <button 
          onClick={() => { localStorage.clear(); window.location.href = '/'; }} 
          className="w-full max-w-xs bg-primary text-background-dark py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all"
        >
          Reintentar Carga
        </button>
      </div>
    );
  }

  // --- LOADING RENDER ---
  if (loading || currentView === 'INIT') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark text-center p-10">
        <div className="relative mb-8">
          <div className="size-20 border-4 border-primary/10 rounded-full"></div>
          <div className="absolute top-0 size-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="space-y-2">
          <h2 className="text-primary text-xs font-black uppercase tracking-[0.4em]">CARGANDO MESA...</h2>
          <p className="text-white/40 text-[10px] font-mono animate-pulse">{diagnosticMsg}</p>
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
        return null;
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background-dark shadow-2xl relative flex flex-col overflow-hidden">
      {/* VISUAL PROOF TAG */}
      {currentTable && (
        <div className="absolute top-0 right-0 z-[100] px-2 py-1 bg-primary text-background-dark text-[8px] font-black uppercase tracking-widest rounded-bl-lg">
          Conectado a Mesa: {currentTable.table_number}
        </div>
      )}
      {renderView()}
    </div>
  );
};

export default App;
