import React, { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { AppView, Guest, OrderItem, MenuItem, OrderBatch } from './types';
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
const ACTIVE_ORDER_KEY = 'dinesplit_active_order_id';
const READY_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

const App: React.FC = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const resParam = searchParams.get('res');
  const tableParam = searchParams.get('table');
  const paymentStatus = searchParams.get('status');
  const guestIdParam = searchParams.get('guestId');

  const [currentView, setCurrentView] = useState<AppView>('INIT');
  const [loading, setLoading] = useState(true);
  const [isSendingOrder, setIsSendingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [restaurant, setRestaurant] = useState<any>(null);
  const [currentTable, setCurrentTable] = useState<any>(null);
  const [currentWaiter, setCurrentWaiter] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [guests, setGuests] = useState<Guest[]>([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
  const [activeGuestId, setActiveGuestId] = useState<string>('1');
  const [activeCategory, setActiveCategory] = useState<string>('Destacados');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [batches, setBatches] = useState<OrderBatch[]>([]);
  const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [splitData, setSplitData] = useState<any[] | null>(null);
  const [showReadyToast, setShowReadyToast] = useState(false);

  const batchChannelRef = useRef<any>(null);

  const fetchOrderItemsFromDB = useCallback(async (orderId: string) => {
    if (!supabase) return;
    
    const [itemsRes, batchesRes] = await Promise.all([
      supabase.from('order_items').select('*, menu_items(name)').eq('order_id', orderId),
      supabase.from('order_batches').select('*').eq('order_id', orderId).order('batch_number', { ascending: true })
    ]);

    if (itemsRes.data) {
      const itemsFromDB: OrderItem[] = itemsRes.data.map(item => {
        let extras: string[] = [];
        let removedIngredients: string[] = [];
        
        if (item.notes) {
          // Parsear EXTRAS
          if (item.notes.includes('EXTRAS:')) {
            const extrasPart = item.notes.split('|')[0];
            const extrasStr = extrasPart.replace('EXTRAS:', '').trim();
            if (extrasStr) {
              extras = extrasStr.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
          }
          
          // Parsear SIN (puede estar antes o después del pipe)
          if (item.notes.includes('SIN:')) {
            const parts = item.notes.split('|');
            let sinPart = '';
            if (parts.length > 1) {
              // SIN está después del pipe
              sinPart = parts[1];
            } else if (item.notes.startsWith('SIN:')) {
              // SIN está al inicio (sin EXTRAS antes)
              sinPart = parts[0];
            }
            if (sinPart) {
              const sinStr = sinPart.replace('SIN:', '').trim();
              if (sinStr) {
                removedIngredients = sinStr.split(',').map((s: string) => s.trim()).filter(Boolean);
              }
            }
          }
        }
        
        return {
          id: item.id,
          itemId: item.menu_item_id,
          guestId: item.guest_id || '1',
          quantity: item.quantity,
          order_id: item.order_id,
          batch_id: item.batch_id,
          isConfirmed: true,
          extras,
          removedIngredients
        };
      });
      setCart(itemsFromDB);
    }
    if (batchesRes.data) {
      setBatches(batchesRes.data);
    }
  }, []);

  useEffect(() => {
    if (!activeOrderId || !supabase) return;

    if (batchChannelRef.current) {
      supabase.removeChannel(batchChannelRef.current);
    }

    const channel = supabase
      .channel(`batches-sync-${activeOrderId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'order_batches', filter: `order_id=eq.${activeOrderId}` }, 
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updatedBatch = payload.new as OrderBatch;
            setBatches(prev => prev.map(b => b.id === updatedBatch.id ? { ...b, ...updatedBatch } : b));
            if (updatedBatch.status.toUpperCase() === 'LISTO') {
              const audio = new Audio(READY_SOUND_URL);
              audio.play().catch(e => console.log("[DineSplit] Audio bloqueado", e));
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
              setShowReadyToast(true);
              setTimeout(() => setShowReadyToast(false), 6000);
            }
          }
        }
      )
      .subscribe();

    batchChannelRef.current = channel;
    return () => { if (batchChannelRef.current) supabase.removeChannel(batchChannelRef.current); };
  }, [activeOrderId]);

  /**
   * FUNCIÓN DE ACCESO (REVERTIDA Y CORREGIDA)
   * 1. Busca restaurante por access_code
   * 2. Busca mesa por table_number (String)
   */
  const handleStartSession = useCallback(async (accessCode: string, tableNum: string) => {
    setLoading(true);
    setError(null);
    try {
      // PASO 1: Buscar restaurante por access_code
      const { data: resData, error: resError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', accessCode.toUpperCase().trim())
        .maybeSingle();

      if (resError) {
        console.error("[DineSplit] Error al buscar restaurante:", resError);
        throw resError;
      }
      if (!resData) throw new Error(`Código de local "${accessCode}" inválido.`);

      // PASO 2: Buscar mesa por restaurant_id e ID de mesa (table_number como String)
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', tableNum.toString()) // Aseguramos que sea String
        .maybeSingle();

      if (tableError) {
        console.error("[DineSplit] Error al buscar mesa:", tableError);
        throw tableError;
      }
      if (!tableData) throw new Error(`Mesa ${tableNum} no encontrada en este local.`);

      // PERSISTENCIA
      localStorage.setItem(SESSION_KEY, JSON.stringify({ res: accessCode.toUpperCase(), table: tableNum.toString() }));

      // Cargar datos complementarios
      // Buscar el mesero asignado a la mesa usando waiter_id
      const [waiterRes, catRes, itemRes] = await Promise.all([
        tableData.waiter_id 
          ? supabase.from('waiters').select('*').eq('id', tableData.waiter_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('categories').select('*').eq('restaurant_id', resData.id).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', resData.id).order('sort_order')
      ]);

      setRestaurant(resData);
      setCurrentTable(tableData);
      setCurrentWaiter(waiterRes.data || null);
      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      
      // PASO 3: Verificar orden abierta
      const { data: activeTableOrder } = await supabase
        .from('orders')
        .select('id, status')
        .eq('table_id', tableData.id)
        .eq('status', 'ABIERTO')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeTableOrder) {
        localStorage.setItem(ACTIVE_ORDER_KEY, activeTableOrder.id);
        setActiveOrderId(activeTableOrder.id);
        await fetchOrderItemsFromDB(activeTableOrder.id);
        setCurrentView('MENU');
      } else {
        localStorage.removeItem(ACTIVE_ORDER_KEY);
        setActiveOrderId(null);
        setCart([]);
        setBatches([]);
        setCurrentView('GUEST_INFO');
      }

      setLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
      alert(err.message || 'No se pudo vincular la mesa.');
      setLoading(false);
      return false;
    }
  }, [fetchOrderItemsFromDB]);

  useEffect(() => {
    const initApp = async () => {
      if (resParam && tableParam) {
        await handleStartSession(resParam, tableParam);
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
          try {
            const { res, table } = JSON.parse(savedSession);
            await handleStartSession(res, table);
          } catch (e) {
            localStorage.clear();
            setCurrentView('SCAN');
            setLoading(false);
          }
        } else {
          setCurrentView('SCAN');
          setLoading(false);
        }
      }
    };
    initApp();
  }, [resParam, tableParam, handleStartSession]);

  // Efecto separado para manejar la navegación a INDIVIDUAL_SHARE cuando hay guestId en URL
  useEffect(() => {
    if (guestIdParam && activeOrderId && splitData && currentView !== 'INDIVIDUAL_SHARE') {
      setCurrentView('INDIVIDUAL_SHARE');
    }
  }, [guestIdParam, activeOrderId, splitData, currentView]);

  useEffect(() => {
    if (paymentStatus === 'success' && activeOrderId) {
      localStorage.clear();
      setCurrentView('FEEDBACK');
    }
  }, [paymentStatus, activeOrderId]);

  const handlePayIndividual = async (paymentData: { amount: number, method: string, tip: number }) => {
    if (!activeOrderId || !restaurant) return;
    if (paymentData.method === 'mercadopago') {
      try {
        const { data: config } = await supabase.from('payment_configs').select('*').eq('restaurant_id', restaurant.id).eq('provider', 'mercadopago').maybeSingle();
        if (!config?.access_token) throw new Error("Mercado Pago no configurado.");

        const cleanUrl = window.location.origin + window.location.pathname;
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ title: `Pago Mesa ${currentTable?.table_number}`, quantity: 1, unit_price: paymentData.amount, currency_id: 'ARS' }],
            external_reference: activeOrderId,
            back_urls: { success: cleanUrl + "?status=success" },
            auto_return: 'approved'
          })
        });
        const pref = await response.json();
        if (pref.init_point) window.location.href = pref.init_point;
      } catch (err: any) { alert(err.message); }
    } else { 
      localStorage.clear();
      setCurrentView('FEEDBACK'); 
    }
  };

  const handleSendOrder = async () => {
    if (!restaurant || !currentTable) return;
    const pendingItems = cart.filter(item => !item.isConfirmed);
    if (pendingItems.length === 0) return;

    setIsSendingOrder(true);
    try {
      let orderId = activeOrderId;
      let currentTotal = 0;

      if (!orderId) {
        const { data: newOrder } = await supabase.from('orders').insert({
          restaurant_id: restaurant.id,
          table_id: currentTable.id,
          waiter_id: currentWaiter?.id || null, 
          status: 'ABIERTO',
          total_amount: 0,
          guest_count: guests.length,
          guest_name: guests[0].name
        }).select().single();
        orderId = newOrder.id;
      } else {
        const { data: existingOrder } = await supabase.from('orders').select('total_amount').eq('id', orderId).single();
        currentTotal = Number(existingOrder?.total_amount || 0);
      }

      const { count } = await supabase.from('order_batches').select('*', { count: 'exact', head: true }).eq('order_id', orderId);
      const nextBatchNumber = (count || 0) + 1;
      
      const { data: newBatch } = await supabase.from('order_batches').insert({
        order_id: orderId,
        batch_number: nextBatchNumber,
        status: 'PREPARANDO'
      }).select().single();

      const itemsToInsert = pendingItems.map(item => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        const notes = [
          item.extras?.length ? `EXTRAS: ${item.extras.join(',')}` : '',
          item.removedIngredients?.length ? `SIN: ${item.removedIngredients.join(',')}` : ''
        ].filter(Boolean).join(' | ');
        return {
          order_id: orderId,
          batch_id: newBatch.id,
          guest_id: item.guestId,
          menu_item_id: item.itemId,
          quantity: item.quantity,
          unit_price: Number(menuItem?.price || 0),
          notes: notes || null
        };
      });

      await supabase.from('order_items').insert(itemsToInsert);
      const newItemsTotal = pendingItems.reduce((sum, item) => sum + (Number(menuItems.find(m => m.id === item.itemId)?.price || 0) * item.quantity), 0);
      await supabase.from('orders').update({ total_amount: currentTotal + newItemsTotal }).eq('id', orderId);

      localStorage.setItem(ACTIVE_ORDER_KEY, orderId!);
      setActiveOrderId(orderId);
      await fetchOrderItemsFromDB(orderId!);
      setCurrentView('PROGRESS');
    } catch (err: any) {
      alert(`Error al enviar pedido: ${err.message}`);
    } finally {
      setIsSendingOrder(false);
    }
  };

  const navigate = (view: AppView) => setCurrentView(view);

  const handleUpdateCartItem = (id: string, updates: Partial<OrderItem>) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item).filter(item => item.isConfirmed || item.quantity > 0));
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background-dark text-primary font-black animate-pulse">
        <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        DINESPLIT
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background-dark text-white p-4">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-xl mb-4">Error</div>
          <div className="text-text-secondary mb-6">{error}</div>
          <button
            onClick={() => {
              setError(null);
              setCurrentView('SCAN');
            }}
            className="px-6 py-3 bg-primary text-background-dark rounded-lg font-bold"
          >
            Volver a intentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background-dark shadow-2xl relative flex flex-col overflow-hidden">
      {showReadyToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-sm animate-fade-in-up">
          <div className="bg-primary text-background-dark p-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/20">
            <span className="material-symbols-outlined text-background-dark font-black animate-bounce">notifications_active</span>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Aviso de Cocina</p>
              <p className="text-xs font-black uppercase">¡Tu pedido está llegando a la mesa!</p>
            </div>
            <button onClick={() => setShowReadyToast(false)} className="opacity-40 hover:opacity-100">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
      )}

      {currentTable && currentView !== 'SCAN' && (
        <div className="absolute top-0 right-0 z-[100] px-3 py-1 bg-primary text-background-dark text-[10px] font-black uppercase tracking-widest rounded-bl-xl shadow-lg">
          Mesa {currentTable.table_number}
        </div>
      )}
      {(() => {
        switch (currentView) {
          case 'INIT':
          case 'SCAN': 
            return <ScanView onNext={handleStartSession} restaurantName={restaurant?.name} />;
          case 'GUEST_INFO': 
            return <GuestInfoView onBack={() => navigate('SCAN')} onNext={() => navigate('MENU')} guests={guests} setGuests={setGuests} table={currentTable} waiter={currentWaiter} restaurant={restaurant} />;
          case 'MENU': 
            return <MenuView onNext={() => navigate('ORDER_SUMMARY')} guests={guests} setGuests={setGuests} cart={cart} onAddToCart={(item, gId, ext, rem) => setCart(prev => [...prev, { id: Math.random().toString(), itemId: item.id, guestId: gId, quantity: 1, extras: ext, removedIngredients: rem, isConfirmed: false }])} onUpdateCartItem={handleUpdateCartItem} onIndividualShare={() => navigate('INDIVIDUAL_SHARE')} selectedGuestId={activeGuestId} onSelectGuest={setActiveGuestId} initialCategory={activeCategory} onCategoryChange={setActiveCategory} editingCartItem={editingCartItem} onCancelEdit={() => setEditingCartItem(null)} menuItems={menuItems} categories={categories} restaurant={restaurant} table={currentTable} />;
          case 'ORDER_SUMMARY': 
            return <OrderSummaryView guests={guests} cart={cart} batches={batches} onBack={() => navigate('MENU')} onNavigateToCategory={(gId, cat) => { setActiveGuestId(gId); setActiveCategory(cat); navigate('MENU'); }} onEditItem={(item) => { setEditingCartItem(item); navigate('MENU'); }} onSend={handleSendOrder} onPay={() => navigate('SPLIT_BILL')} isSending={isSendingOrder} onUpdateQuantity={(id, d) => handleUpdateCartItem(id, { quantity: Math.max(0, (cart.find(it => it.id === id)?.quantity || 1) + d) })} menuItems={menuItems} categories={categories} tableNumber={currentTable?.table_number} waiter={currentWaiter} />;
          case 'PROGRESS': 
            return <OrderProgressView cart={cart} batches={batches} activeOrderId={activeOrderId} onNext={() => navigate('SPLIT_BILL')} onBack={() => navigate('MENU')} onRedirectToFeedback={() => navigate('FEEDBACK')} tableNumber={currentTable?.table_number} menuItems={menuItems} />;
          case 'SPLIT_BILL': 
            return <SplitBillView guests={guests} cart={cart} onBack={() => navigate('PROGRESS')} onConfirm={(shares) => { setSplitData(shares); navigate('CHECKOUT'); }} menuItems={menuItems} />;
          case 'CHECKOUT': 
            return <CheckoutView onBack={() => navigate('SPLIT_BILL')} onConfirm={() => navigate('INDIVIDUAL_SHARE')} cart={cart} guests={guests} menuItems={menuItems} tableNumber={currentTable?.table_number} splitData={splitData} />;
          case 'INDIVIDUAL_SHARE': 
            return <IndividualShareView onBack={() => navigate('CHECKOUT')} onPay={handlePayIndividual} cart={cart} menuItems={menuItems} splitData={splitData} restaurant={restaurant} />;
          case 'FEEDBACK': 
            return <FeedbackView onNext={() => navigate('CONFIRMATION')} onSkip={() => navigate('CONFIRMATION')} cart={cart} menuItems={menuItems} waiter={currentWaiter} restaurant={restaurant} />;
          case 'CONFIRMATION': 
            return <ConfirmationView onRestart={() => { localStorage.clear(); window.location.href = '/'; }} guests={guests} tableNumber={currentTable?.table_number} />;
          default: 
            return <ScanView onNext={handleStartSession} restaurantName={restaurant?.name} />;
        }
      })()}
    </div>
  );
};

export default App;