
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

// --- DIAGNÓSTICO CRÍTICO ---
console.log("[DineSplit] JS Ejecutándose en producción - " + new Date().toISOString());

const SESSION_KEY = 'dinesplit_active_session';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('INIT');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState<string>('');

  // Estados de datos
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

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const resParam = searchParams.get('res');
  const tableParam = searchParams.get('table');

  const handleStartSession = useCallback(async (accessCode: string, tableNum: string) => {
    console.log(`[DineSplit] Iniciando handleStartSession: ${accessCode}, Mesa ${tableNum}`);
    setLoading(true);
    setError(null);
    const cleanCode = accessCode.trim().toUpperCase();

    try {
      if (!supabase) {
        throw new Error("El cliente de Supabase no se inicializó correctamente.");
      }

      console.log("[DineSplit] Consultando restaurante...");
      const { data: resData, error: resError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', cleanCode)
        .maybeSingle();

      if (resError) throw new Error(`Error Supabase (Restaurante): ${resError.message}`);
      if (!resData) {
        setError(`El local "${cleanCode}" no existe en nuestra base de datos.`);
        setLoading(false);
        return false;
      }

      console.log("[DineSplit] Consultando mesa...");
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', parseInt(tableNum))
        .maybeSingle();

      if (tableError) throw new Error(`Error Supabase (Mesa): ${tableError.message}`);
      if (!tableData) {
        setError(`La mesa ${tableNum} no está configurada para este local.`);
        setLoading(false);
        return false;
      }

      console.log("[DineSplit] Cargando staff y menú...");
      // Cargar personal
      let waiterInfo = null;
      if (tableData.waiter_id) {
        const { data: waiterData } = await supabase.from('waiters').select('*').eq('id', tableData.waiter_id).maybeSingle();
        waiterInfo = waiterData;
      }
      if (!waiterInfo) {
        const { data: staffData } = await supabase.from('waiters').select('*').eq('restaurant_id', resData.id).limit(1).maybeSingle();
        waiterInfo = staffData;
      }

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

      console.log("[DineSplit] Sesión establecida con éxito.");
      setCurrentView('GUEST_INFO');
      setLoading(false);
      return true;

    } catch (err: any) {
      console.error("[DineSplit] Error fatal en sesión:", err);
      setError(err.message || 'Error desconocido de conexión');
      setLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        setDiagnosticInfo("Analizando entorno...");
        console.log("[DineSplit] Inicializando App...");

        // Verificación de Supabase
        if (!supabase) {
          setDiagnosticInfo("FALLO: Cliente Supabase no disponible.");
          throw new Error("Supabase URL o Anon Key faltantes en lib/supabase.ts");
        }

        // 1. Bypass por URL
        if (resParam && tableParam) {
          setDiagnosticInfo(`Detectado Bypass URL: ${resParam} / ${tableParam}`);
          const success = await handleStartSession(resParam, tableParam);
          if (success) {
            window.history.replaceState({}, '', window.location.pathname);
            return;
          }
        }

        // 2. Recuperación de sesión
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
          setDiagnosticInfo("Recuperando sesión previa...");
          const { res, table, timestamp } = JSON.parse(savedSession);
          if (Date.now() - timestamp < 12 * 60 * 60 * 1000) {
            const success = await handleStartSession(res, table);
            if (success) return;
          }
        }

        // 3. Flujo normal
        setDiagnosticInfo("Iniciando pantalla de escaneo.");
        setCurrentView('SCAN');
        setLoading(false);

      } catch (err: any) {
        console.error("[DineSplit] Error en initApp:", err);
        setError(`Fallo de inicialización: ${err.message}`);
        setLoading(false);
      }
    };

    initApp();
  }, [handleStartSession, resParam, tableParam]);

  const navigate = (view: AppView) => setCurrentView(view);

  // --- RENDERS DE DIAGNÓSTICO ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark p-8 text-center">
        <div className="size-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-red-500 text-5xl">report</span>
        </div>
        <h2 className="text-white text-2xl font-black mb-4 uppercase tracking-tighter">Error de Conexión</h2>
        <div className="bg-white/5 border border-red-500/30 rounded-2xl p-4 mb-8 w-full">
          <p className="text-red-400 text-sm font-mono break-words">{error}</p>
        </div>
        <button 
          onClick={() => { localStorage.clear(); window.location.href = window.location.pathname; }} 
          className="bg-primary text-background-dark px-10 py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          Limpiar y Reintentar
        </button>
      </div>
    );
  }

  if (loading || currentView === 'INIT') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark text-center p-10">
        <div className="relative mb-10">
          <div className="size-24 border-4 border-primary/10 rounded-full"></div>
          <div className="absolute top-0 size-24 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <span className="material-symbols-outlined text-primary text-3xl animate-pulse">restaurant</span>
          </div>
        </div>
        <h2 className="text-primary text-xs font-black uppercase tracking-[0.4em] mb-4">DineSplit</h2>
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Cargando Mesa...</p>
        {diagnosticInfo && (
          <p className="text-primary/40 text-[9px] font-mono italic animate-pulse">{diagnosticInfo}</p>
        )}
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
        return <ConfirmationView onRestart={() => { localStorage.removeItem(SESSION_KEY); window.location.href = window.location.pathname; }} guests={guests} tableNumber={currentTable?.table_number} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background-dark shadow-2xl relative flex flex-col overflow-hidden">
      {renderView()}
    </div>
  );
};

export default App;
