
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

console.log("[DineSplit] Application Loaded at " + new Date().toISOString());

const SESSION_KEY = 'dinesplit_active_session';
const ACTIVE_ORDER_KEY = 'dinesplit_active_order_id';

const App: React.FC = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const resParam = searchParams.get('res');
  const tableParam = searchParams.get('table');

  if (resParam && tableParam) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      res: resParam.toUpperCase(),
      table: tableParam,
      timestamp: Date.now()
    }));
    window.history.replaceState({}, '', window.location.pathname);
  }

  const [currentView, setCurrentView] = useState<AppView>('INIT');
  const [loading, setLoading] = useState(true);
  const [isSendingOrder, setIsSendingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticMsg, setDiagnosticMsg] = useState('Iniciando sistema...');

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
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [splitData, setSplitData] = useState<any[] | null>(null);

  // Función para cargar los platos reales desde la DB
  const fetchOrderItemsFromDB = useCallback(async (orderId: string) => {
    if (!supabase) return;
    console.log("[DineSplit] Cargando platos existentes de la orden:", orderId);
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (error) {
      console.error("[DineSplit] Error cargando platos:", error);
      return;
    }

    if (data) {
      const itemsFromDB: OrderItem[] = data.map(item => ({
        id: item.id,
        itemId: item.menu_item_id,
        guest_id: item.guest_id, // Fix for consistency
        guestId: item.guest_id,
        quantity: item.quantity,
        order_id: item.order_id,
        isConfirmed: true,
        // Notas parseadas opcionalmente si se guardaron extras
        extras: item.notes?.includes('EXTRAS:') ? item.notes.split('|')[0].replace('EXTRAS:', '').split(',').map((s:string) => s.trim()) : [],
        removedIngredients: item.notes?.includes('SIN:') ? item.notes.split('|')[1]?.replace('SIN:', '').split(',').map((s:string) => s.trim()) : []
      }));
      setCart(itemsFromDB);
    }
  }, []);

  const handleStartSession = useCallback(async (accessCode: string, tableNum: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase client is null.");

      const { data: resData } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', accessCode.toUpperCase())
        .maybeSingle();

      if (!resData) throw new Error(`El local "${accessCode}" no existe.`);

      const { data: tableData } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', parseInt(tableNum))
        .maybeSingle();

      if (!tableData) throw new Error(`Mesa ${tableNum} no encontrada.`);

      const [waiterRes, catRes, itemRes] = await Promise.all([
        supabase.from('waiters').select('*').eq('restaurant_id', resData.id).limit(1).maybeSingle(),
        supabase.from('categories').select('*').eq('restaurant_id', resData.id).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', resData.id).order('sort_order')
      ]);

      setRestaurant(resData);
      setCurrentTable(tableData);
      setCurrentWaiter(waiterRes.data);
      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      
      const savedOrderId = localStorage.getItem(ACTIVE_ORDER_KEY);
      if (savedOrderId) {
        const { data: orderData } = await supabase.from('orders').select('status').eq('id', savedOrderId).maybeSingle();
        if (orderData && orderData.status !== 'PAGADO') {
          setActiveOrderId(savedOrderId);
          await fetchOrderItemsFromDB(savedOrderId);
          setCurrentView('MENU'); // Al recuperar sesión, vamos al menú directamente
          setLoading(false);
          return true;
        }
      }

      setCurrentView('GUEST_INFO');
      setLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
      setLoading(false);
      return false;
    }
  }, [fetchOrderItemsFromDB]);

  const handleSendOrder = async () => {
    if (!restaurant || !currentTable) return;
    
    // Solo enviamos los platos que NO están confirmados
    const pendingItems = cart.filter(item => !item.isConfirmed);
    if (pendingItems.length === 0) {
      alert("No hay platos nuevos para enviar.");
      return;
    }

    setIsSendingOrder(true);
    try {
      let orderId = activeOrderId;
      let currentTotal = 0;

      // 1. Resolver Orden Activa
      if (orderId) {
        const { data: order } = await supabase.from('orders').select('total_amount').eq('id', orderId).maybeSingle();
        currentTotal = Number(order?.total_amount || 0);
      } else {
        const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
          restaurant_id: restaurant.id,
          table_id: currentTable.id,
          status: 'PREPARANDO',
          total_amount: 0,
          guest_count: guests.length,
          guest_name: guests[0].name
        }).select().single();
        if (orderErr) throw orderErr;
        orderId = newOrder.id;
      }

      // 2. Insertar Items nuevos
      const itemsToInsert = pendingItems.map(item => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        const notes = [
          item.extras?.length ? `EXTRAS: ${item.extras.join(',')}` : '',
          item.removedIngredients?.length ? `SIN: ${item.removedIngredients.join(',')}` : ''
        ].filter(Boolean).join(' | ');

        return {
          order_id: orderId,
          menu_item_id: item.itemId,
          guest_id: item.guestId,
          quantity: item.quantity,
          unit_price: Number(menuItem?.price || 0),
          notes
        };
      });

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      // 3. Actualizar Total de Orden
      const newItemsTotal = pendingItems.reduce((sum, item) => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        return sum + (Number(menuItem?.price || 0) * item.quantity);
      }, 0);

      await supabase.from('orders').update({
        total_amount: currentTotal + newItemsTotal,
        status: 'PREPARANDO'
      }).eq('id', orderId);

      // 4. Sincronizar estado local
      localStorage.setItem(ACTIVE_ORDER_KEY, orderId!);
      setActiveOrderId(orderId);
      await fetchOrderItemsFromDB(orderId!);
      
      setCurrentView('PROGRESS');
    } catch (err: any) {
      alert("Error al enviar pedido: " + err.message);
    } finally {
      setIsSendingOrder(false);
    }
  };

  const handleSplitConfirm = (shares: any[]) => {
    setSplitData(shares);
    setCurrentView('CHECKOUT');
  };

  useEffect(() => {
    const init = async () => {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const { res, table } = JSON.parse(saved);
        await handleStartSession(res, table);
      } else {
        setLoading(false);
        setCurrentView('SCAN');
      }
    };
    init();
  }, [handleStartSession]);

  const navigate = (view: AppView) => setCurrentView(view);

  const handleUpdateCartItem = (id: string, updates: Partial<OrderItem>) => {
    setCart(prev => {
      const newCart = prev.map(item => {
        if (item.id === id) {
          const updated = { ...item, ...updates };
          return updated;
        }
        return item;
      });
      // Filtrar items que tengan cantidad 0 (solo si no están confirmados)
      return newCart.filter(item => item.isConfirmed || item.quantity > 0);
    });
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-background-dark text-primary">Cargando...</div>;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background-dark shadow-2xl relative flex flex-col overflow-hidden">
      {currentTable && (
        <div className="absolute top-0 right-0 z-[100] px-2 py-1 bg-primary text-background-dark text-[8px] font-black uppercase tracking-widest rounded-bl-lg">
          Mesa: {currentTable.table_number}
        </div>
      )}
      {(() => {
        switch (currentView) {
          case 'SCAN': return <ScanView onNext={handleStartSession} restaurantName={restaurant?.name} />;
          case 'GUEST_INFO': return <GuestInfoView onBack={() => navigate('SCAN')} onNext={() => navigate('MENU')} guests={guests} setGuests={setGuests} table={currentTable} waiter={currentWaiter} restaurant={restaurant} />;
          case 'MENU': return <MenuView onNext={() => navigate('ORDER_SUMMARY')} guests={guests} setGuests={setGuests} cart={cart} onAddToCart={(item, gId, ext, rem) => setCart(prev => [...prev, { id: Math.random().toString(), itemId: item.id, guestId: gId, quantity: 1, extras: ext, removedIngredients: rem, isConfirmed: false }])} onUpdateCartItem={handleUpdateCartItem} onIndividualShare={() => navigate('INDIVIDUAL_SHARE')} selectedGuestId={activeGuestId} onSelectGuest={setActiveGuestId} initialCategory={activeCategory} onCategoryChange={setActiveCategory} editingCartItem={editingCartItem} onCancelEdit={() => setEditingCartItem(null)} menuItems={menuItems} categories={categories} restaurant={restaurant} table={currentTable} />;
          case 'ORDER_SUMMARY': return <OrderSummaryView guests={guests} cart={cart} onBack={() => navigate('MENU')} onNavigateToCategory={(gId, cat) => { setActiveGuestId(gId); setActiveCategory(cat); navigate('MENU'); }} onEditItem={(item) => { setEditingCartItem(item); navigate('MENU'); }} onSend={handleSendOrder} isSending={isSendingOrder} onUpdateQuantity={(id, d) => handleUpdateCartItem(id, { quantity: Math.max(0, (cart.find(it => it.id === id)?.quantity || 1) + d) })} menuItems={menuItems} categories={categories} tableNumber={currentTable?.table_number} waiter={currentWaiter} />;
          case 'PROGRESS': return <OrderProgressView cart={cart} activeOrderId={activeOrderId} onNext={() => navigate('SPLIT_BILL')} onBack={() => navigate('MENU')} onRedirectToFeedback={() => { localStorage.clear(); navigate('FEEDBACK'); }} tableNumber={currentTable?.table_number} waiter={currentWaiter} />;
          case 'SPLIT_BILL': return <SplitBillView guests={guests} cart={cart} onBack={() => navigate('PROGRESS')} onConfirm={handleSplitConfirm} menuItems={menuItems} />;
          case 'CHECKOUT': return <CheckoutView onBack={() => navigate('SPLIT_BILL')} onConfirm={() => navigate('INDIVIDUAL_SHARE')} cart={cart} guests={guests} menuItems={menuItems} tableNumber={currentTable?.table_number} splitData={splitData} />;
          case 'INDIVIDUAL_SHARE': return <IndividualShareView onBack={() => navigate('CHECKOUT')} onPay={() => navigate('FEEDBACK')} cart={cart} menuItems={menuItems} splitData={splitData} />;
          case 'FEEDBACK': return <FeedbackView onNext={() => navigate('CONFIRMATION')} onSkip={() => navigate('CONFIRMATION')} cart={cart} menuItems={menuItems} waiter={currentWaiter} restaurant={restaurant} />;
          case 'CONFIRMATION': return <ConfirmationView onRestart={() => { localStorage.clear(); window.location.href = '/'; }} guests={guests} tableNumber={currentTable?.table_number} />;
          default: return null;
        }
      })()}
    </div>
  );
};

export default App;
