
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

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('SCAN');
  const [loading, setLoading] = useState(false);
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

  const handleStartSession = useCallback(async (accessCode: string, tableNum: string) => {
    if (!accessCode || !tableNum) return;
    setLoading(true);
    const cleanCode = accessCode.trim().toUpperCase();

    try {
      const { data: resData, error: resError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('access_code', cleanCode)
        .maybeSingle();

      if (resError || !resData) {
        alert("Código de restaurante no encontrado. Verifica que sea LAP006");
        setLoading(false);
        return;
      }

      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', resData.id)
        .eq('table_number', parseInt(tableNum))
        .maybeSingle();

      if (tableError || !tableData) {
        alert(`La mesa ${tableNum} no existe en este restaurante`);
        setLoading(false);
        return;
      }

      setRestaurant(resData);
      setCurrentTable(tableData);

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
      
      setCurrentWaiter(waiterInfo);

      const [catRes, itemRes] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', resData.id),
        supabase.from('menu_items').select('*').eq('restaurant_id', resData.id)
      ]);

      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      
      setCurrentView('GUEST_INFO');
    } catch (err) {
      console.error("Error en la sesión:", err);
      alert("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSendOrder = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      // 1. Crear la Orden principal
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

      // 2. Insertar Items de la Orden
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

      // 3. Actualizar Carrito con IDs de DB (UUIDs) para el Feedback
      const updatedCart = cart.map(cartItem => {
        // Buscamos el item insertado que corresponde
        const dbItem = insertedItems.find(di => 
          di.menu_item_id === cartItem.itemId && 
          di.guest_id === cartItem.guestId
        );
        return {
          ...cartItem,
          id: dbItem ? dbItem.id : cartItem.id, // Reemplazar temporal por UUID
          order_id: orderData.id // Guardar referencia de orden
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const res = params.get('res');
    const table = params.get('table');

    if (res && table) {
      handleStartSession(res, table);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [handleStartSession]);

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
              <span className="material-symbols-outlined text-primary text-3xl animate-pulse">qr_code_scanner</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-primary text-xl font-black tracking-widest uppercase animate-pulse">Procesando...</p>
            <p className="text-text-secondary text-xs mt-2 font-medium">Sincronizando con el servidor</p>
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
            onBack={() => navigate('SCAN')} 
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
            onNext={() => navigate('CONFIRMATION')}
            onSkip={() => navigate('CONFIRMATION')}
            cart={cart}
            menuItems={menuItems}
            waiter={currentWaiter}
            restaurant={restaurant}
          />
        );
      case 'CONFIRMATION':
        return (
          <ConfirmationView 
            onRestart={() => window.location.reload()}
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
