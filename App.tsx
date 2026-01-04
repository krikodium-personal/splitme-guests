
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
      supabase.from('order_items').select('*').eq('order_id', orderId),
      supabase.from('order_batches').select('*').eq('order_id', orderId).order('batch_number', { ascending: true })
    ]);

    if (itemsRes.data) {
      const itemsFromDB: OrderItem[] = itemsRes.data.map(item => ({
        id: item.id,
        itemId: item.menu_item_id,
        guestId: item.guest_id || '1',
        quantity: item.quantity,
        order_id: item.order_id,
        batch_id: item.batch_id,
        isConfirmed: true,
        extras: item.notes?.includes('EXTRAS:') ? item.notes.split('|')[0].replace('EXTRAS:', '').split(',').map((s:string) => s.trim()) : [],
        removedIngredients: item.notes?.includes('SIN:') ? item.notes.split('|')[1]?.replace('SIN:', '').split(',').map((s:string) => s.trim()) : []
      }));
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
      .channel(`batches-${activeOrderId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'order_batches', filter: `order_id=eq.${activeOrderId}` }, 
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBatches(prev => [...prev, payload.new as OrderBatch]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedBatch = payload.new as OrderBatch;
            setBatches(prev => prev.map(b => b.id === updatedBatch.id ? { ...b, ...updatedBatch } : b));
            
            if (updatedBatch.status.toUpperCase() === 'LISTO') {
              const audio = new Audio(READY_SOUND_URL);
              audio.play().catch(e => console.log("[DineSplit] Audio play blocked", e));
              if (navigator.vibrate) navigator.vibrate(200);
              setShowReadyToast(true);
              setTimeout(() => setShowReadyToast(false), 6000);
            }
          }
        }
      )
      .subscribe();

    batchChannelRef.current = channel;

    return () => {
      if (batchChannelRef.current) supabase.removeChannel(batchChannelRef.current);
    };
  }, [activeOrderId]);

  const handleStartSession = useCallback(async (accessCode: string, tableNum: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase client is null.");
      
      const { data: resData } = await supabase.from('restaurants').select('*').eq('access_code', accessCode.toUpperCase()).maybeSingle();
      if (!resData) throw new Error(`El local "${accessCode}" no existe.`);

      const { data: tableData } = await supabase.from('tables').select('*').eq('restaurant_id', resData.id).eq('table_number', tableNum).maybeSingle();
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
        const { data: orderData, error: orderCheckErr } = await supabase
          .from('orders')
          .select('id, status')
          .eq('id', savedOrderId)
          .maybeSingle();

        if (orderCheckErr || !orderData || orderData.status.toUpperCase() !== 'ABIERTO') {
          localStorage.removeItem(ACTIVE_ORDER_KEY);
          setActiveOrderId(null);
          setCart([]);
          setBatches([]);
          setCurrentView('GUEST_INFO');
        } else {
          setActiveOrderId(savedOrderId);
          await fetchOrderItemsFromDB(savedOrderId);
          setCurrentView('MENU');
        }
      } else {
        setCurrentView('GUEST_INFO');
      }

      setLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
      setLoading(false);
      return false;
    }
  }, [fetchOrderItemsFromDB]);

  useEffect(() => {
    const initApp = async () => {
      if (resParam && tableParam) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          res: resParam.toUpperCase(),
          table: tableParam,
          timestamp: Date.now()
        }));
        await handleStartSession(resParam, tableParam);
        window.history.replaceState({}, '', window.location.pathname);
      } 
      else {
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
          try {
            const { res, table } = JSON.parse(savedSession);
            const success = await handleStartSession(res, table);
            if (!success) {
              setCurrentView('SCAN');
              setLoading(false);
            }
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

  useEffect(() => {
    if (paymentStatus === 'success' && activeOrderId) {
      localStorage.removeItem(ACTIVE_ORDER_KEY);
      localStorage.removeItem(SESSION_KEY);
      setCurrentView('FEEDBACK');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [paymentStatus, activeOrderId]);

  const handlePayIndividual = async (paymentData: { amount: number, method: string, tip: number }) => {
    if (!activeOrderId || !restaurant) return;
    if (paymentData.method === 'mercadopago') {
      try {
        const { data: config, error: configError } = await supabase.from('payment_configs').select('*').eq('restaurant_id', restaurant.id).eq('provider', 'mercadopago').maybeSingle();
        if (configError) throw new Error(configError.message);
        if (!config?.access_token) throw new Error("Mercado Pago no configurado en este local.");

        const cleanUrl = window.location.origin + window.location.pathname;
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ title: `Pago Mesa ${currentTable?.table_number}`, quantity: 1, unit_price: Number(paymentData.amount.toFixed(2)), currency_id: 'ARS' }],
            external_reference: activeOrderId,
            back_urls: { success: cleanUrl + "?status=success" },
            auto_return: 'approved'
          })
        });
        const pref = await response.json();
        if (pref.init_point) window.location.href = pref.init_point;
        else throw new Error("Error al generar preferencia.");
      } catch (err: any) { alert(err.message || "Error al conectar con Mercado Pago"); }
    } else { 
      localStorage.removeItem(ACTIVE_ORDER_KEY);
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
        const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
          restaurant_id: restaurant.id,
          table_id: currentTable.id,
          waiter_id: currentWaiter?.id || null, 
          status: 'ABIERTO',
          total_amount: 0,
          guest_count: guests.length,
          guest_name: guests[0].name
        }).select().single();
        
        if (orderErr) throw new Error(orderErr.message);
        orderId = newOrder.id;
      } else {
        const { data: existingOrder, error: fetchErr } = await supabase.from('orders').select('total_amount').eq('id', orderId).single();
        if (fetchErr) throw new Error(fetchErr.message);
        currentTotal = Number(existingOrder?.total_amount || 0);
      }

      const { count, error: countErr } = await supabase
        .from('order_batches')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', orderId);
      
      if (countErr) throw new Error(countErr.message);
      const nextBatchNumber = (count || 0) + 1;
      
      const { data: newBatch, error: batchErr } = await supabase.from('order_batches').insert({
        order_id: orderId,
        batch_number: nextBatchNumber,
        status: 'ABIERTO'
      }).select().single();

      if (batchErr) throw new Error(batchErr.message);

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

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw new Error(itemsErr.message);

      const newItemsTotal = pendingItems.reduce((sum, item) => {
        const menuItem = menuItems.find(m => m.id === item.itemId);
        return sum + (Number(menuItem?.price || 0) * item.quantity);
      }, 0);

      const { error: updateErr } = await supabase.from('orders').update({
        total_amount: currentTotal + newItemsTotal,
        status: 'ABIERTO'
      }).eq('id', orderId);
      
      if (updateErr) throw new Error(updateErr.message);

      localStorage.setItem(ACTIVE_ORDER_KEY, orderId!);
      setActiveOrderId(orderId);
      await fetchOrderItemsFromDB(orderId!);
      setCurrentView('PROGRESS');
    } catch (err: any) {
      alert(`Error al enviar pedido: ${err.message || "Error de conexión"}`);
    } finally {
      setIsSendingOrder(false);
    }
  };

  const handleUpdateCartItem = (id: string, updates: Partial<OrderItem>) => {
    setCart(prev => {
      const newCart = prev.map(item => item.id === id ? { ...item, ...updates } : item);
      return newCart.filter(item => item.isConfirmed || item.quantity > 0);
    });
  };

  const navigate = (v: AppView) => setCurrentView(v);

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-background-dark text-primary font-black animate-pulse">
    <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
    DINESPLIT
  </div>;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background-dark shadow-2xl relative flex flex-col overflow-hidden">
      {showReadyToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-sm animate-fade-in-up">
          <div className="bg-primary text-background-dark p-4 rounded-2xl shadow-2xl shadow-primary/30 flex items-center gap-4 border border-white/20">
            <div className="size-10 bg-background-dark rounded-full flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary font-black animate-bounce">notifications_active</span>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 leading-none mb-1">Aviso de Cocina</p>
              <p className="text-xs font-black uppercase tracking-widest leading-tight">¡Tu pedido está listo y en camino a la mesa!</p>
            </div>
            <button onClick={() => setShowReadyToast(false)} className="size-8 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
      )}

      {currentTable && currentView !== 'INIT' && currentView !== 'SCAN' && (
        <div className="absolute top-0 right-0 z-[100] px-3 py-1 bg-primary text-background-dark text-[10px] font-black uppercase tracking-widest rounded-bl-xl shadow-lg">
          Mesa {currentTable.table_number}
        </div>
      )}
      {(() => {
        switch (currentView) {
          case 'SCAN': return <ScanView onNext={handleStartSession} restaurantName={restaurant?.name} />;
          case 'GUEST_INFO': return <GuestInfoView onBack={() => navigate('SCAN')} onNext={() => navigate('MENU')} guests={guests} setGuests={setGuests} table={currentTable} waiter={currentWaiter} restaurant={restaurant} />;
          case 'MENU': return <MenuView onNext={() => navigate('ORDER_SUMMARY')} guests={guests} setGuests={setGuests} cart={cart} onAddToCart={(item, gId, ext, rem) => setCart(prev => [...prev, { id: Math.random().toString(), itemId: item.id, guestId: gId, quantity: 1, extras: ext, removedIngredients: rem, isConfirmed: false }])} onUpdateCartItem={handleUpdateCartItem} onIndividualShare={() => navigate('INDIVIDUAL_SHARE')} selectedGuestId={activeGuestId} onSelectGuest={setActiveGuestId} initialCategory={activeCategory} onCategoryChange={setActiveCategory} editingCartItem={editingCartItem} onCancelEdit={() => setEditingCartItem(null)} menuItems={menuItems} categories={categories} restaurant={restaurant} table={currentTable} />;
          case 'ORDER_SUMMARY': return <OrderSummaryView guests={guests} cart={cart} batches={batches} onBack={() => navigate('MENU')} onNavigateToCategory={(gId, cat) => { setActiveGuestId(gId); setActiveCategory(cat); navigate('MENU'); }} onEditItem={(item) => { setEditingCartItem(item); navigate('MENU'); }} onSend={handleSendOrder} onPay={() => navigate('SPLIT_BILL')} isSending={isSendingOrder} onUpdateQuantity={(id, d) => handleUpdateCartItem(id, { quantity: Math.max(0, (cart.find(it => it.id === id)?.quantity || 1) + d) })} menuItems={menuItems} categories={categories} tableNumber={currentTable?.table_number} waiter={currentWaiter} />;
          case 'PROGRESS': return <OrderProgressView cart={cart} batches={batches} activeOrderId={activeOrderId} onNext={() => navigate('SPLIT_BILL')} onBack={() => navigate('MENU')} onRedirectToFeedback={() => { localStorage.clear(); navigate('FEEDBACK'); }} tableNumber={currentTable?.table_number} menuItems={menuItems} />;
          case 'SPLIT_BILL': return <SplitBillView guests={guests} cart={cart} onBack={() => navigate('PROGRESS')} onConfirm={(shares) => { setSplitData(shares); navigate('CHECKOUT'); }} menuItems={menuItems} />;
          case 'CHECKOUT': return <CheckoutView onBack={() => navigate('SPLIT_BILL')} onConfirm={() => navigate('INDIVIDUAL_SHARE')} cart={cart} guests={guests} menuItems={menuItems} tableNumber={currentTable?.table_number} splitData={splitData} />;
          case 'INDIVIDUAL_SHARE': return <IndividualShareView onBack={() => navigate('CHECKOUT')} onPay={handlePayIndividual} cart={cart} menuItems={menuItems} splitData={splitData} restaurant={restaurant} />;
          case 'FEEDBACK': return <FeedbackView onNext={() => navigate('CONFIRMATION')} onSkip={() => navigate('CONFIRMATION')} cart={cart} menuItems={menuItems} waiter={currentWaiter} restaurant={restaurant} />;
          case 'CONFIRMATION': return <ConfirmationView onRestart={() => { localStorage.clear(); window.location.href = '/'; }} guests={guests} tableNumber={currentTable?.table_number} />;
          default: return null;
        }
      })()}
    </div>
  );
};

export default App;
