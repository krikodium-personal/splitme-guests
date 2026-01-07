import React, { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { AppView, Guest, OrderItem, MenuItem, OrderBatch } from './types';
import ScanView from './views/ScanView';
import GuestInfoView from './views/GuestInfoView';
import MenuView from './views/MenuView';
import OrderSummaryView from './views/OrderSummaryView';
import OrderProgressView from './views/OrderProgressView';
import SplitBillView from './views/SplitBillView';
import GuestSelectionView from './views/GuestSelectionView';
import IndividualShareView from './views/IndividualShareView';
import TransferPaymentView from './views/TransferPaymentView';
import CashPaymentView from './views/CashPaymentView';
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
  const orderIdParam = searchParams.get('orderId');

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
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null); // Batch actual para nuevos items
  const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [splitData, setSplitData] = useState<any[] | null>(null);
  const [showReadyToast, setShowReadyToast] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentGuestName, setPaymentGuestName] = useState<string>('');

  const batchChannelRef = useRef<any>(null);

  const fetchOrderItemsFromDB = useCallback(async (orderId: string) => {
    if (!supabase) return;
    
    const [itemsRes, batchesRes] = await Promise.all([
      supabase.from('order_items').select('*, menu_items(name)').eq('order_id', orderId),
      supabase.from('order_batches').select('*').eq('order_id', orderId).order('batch_number', { ascending: true })
    ]);

    if (itemsRes.data) {
      const itemsFromDB: OrderItem[] = itemsRes.data.map(item => {
        // Cargar extras y removed_ingredients desde columnas separadas o desde notes (retrocompatibilidad)
        let extras: string[] = [];
        let removedIngredients: string[] = [];
        
        // Prioridad: columnas extras/removed_ingredients > notes (parseado)
        if (item.extras && Array.isArray(item.extras)) {
          extras = item.extras;
        } else if (item.extras && typeof item.extras === 'string') {
          extras = item.extras.split(',').map((s: string) => s.trim()).filter(Boolean);
        } else if (item.notes && item.notes.includes('EXTRAS:')) {
          // Retrocompatibilidad: parsear desde notes
          const extrasPart = item.notes.split('|')[0];
          const extrasStr = extrasPart.replace('EXTRAS:', '').trim();
          if (extrasStr) {
            extras = extrasStr.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        }
        
        if (item.removed_ingredients && Array.isArray(item.removed_ingredients)) {
          removedIngredients = item.removed_ingredients;
        } else if (item.removed_ingredients && typeof item.removed_ingredients === 'string') {
          removedIngredients = item.removed_ingredients.split(',').map((s: string) => s.trim()).filter(Boolean);
        } else if (item.notes && item.notes.includes('SIN:')) {
          // Retrocompatibilidad: parsear desde notes
          const parts = item.notes.split('|');
          let sinPart = '';
          if (parts.length > 1) {
            sinPart = parts[1];
          } else if (item.notes.startsWith('SIN:')) {
            sinPart = parts[0];
          }
          if (sinPart) {
            const sinStr = sinPart.replace('SIN:', '').trim();
            if (sinStr) {
              removedIngredients = sinStr.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
          }
        }
        
        // Usar el guest_id directamente de la base de datos (UUID de order_guests)
        const guestId = item.guest_id;
        const status = item.status || (item.batch_id ? 'pedido' : 'elegido'); // Retrocompatibilidad
        
        return {
          id: item.id,
          itemId: item.menu_item_id,
          guestId: guestId || '1',
          quantity: item.quantity,
          order_id: item.order_id,
          batch_id: item.batch_id,
          isConfirmed: status === 'pedido', // Confirmado si status es 'pedido'
          status: status, // Guardar el status
          extras,
          removedIngredients
        };
      });
      
      console.log("[DineSplit] Items cargados desde DB:", itemsFromDB.length, "items");
      console.log("[DineSplit] Guest IDs en items:", [...new Set(itemsFromDB.map(i => i.guestId))]);
      
      // Log detallado de items por status
      const itemsByStatus = itemsFromDB.reduce((acc, item) => {
        const status = item.status || (item.batch_id ? 'pedido' : 'elegido');
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log("[DineSplit] Items por status:", itemsByStatus);
      console.log("[DineSplit] Items con batch_id:", itemsFromDB.filter(i => i.batch_id).length);
      
      setCart(itemsFromDB);
    }
    if (batchesRes.data) {
      setBatches(batchesRes.data);
      
      // Establecer el batch activo: buscar un batch con status='CREADO', si no existe, crear uno nuevo
      if (batchesRes.data.length > 0) {
        // Buscar un batch con status='CREADO' (el batch activo para agregar items)
        const createdBatch = batchesRes.data.find(b => b.status === 'CREADO');
        
        if (createdBatch) {
          // Hay un batch con status='CREADO', usarlo
          setActiveBatchId(createdBatch.id);
          console.log("[DineSplit] Batch activo establecido a:", createdBatch.id, "batch_number:", createdBatch.batch_number, "status:", createdBatch.status);
        } else {
          // No hay batch con status='CREADO', NO crear uno nuevo aquí
          // Solo establecer el último batch como activo (pero no servirá para agregar items hasta que se envíe un pedido)
          const sortedBatches = [...batchesRes.data].sort((a, b) => b.batch_number - a.batch_number);
          const latestBatch = sortedBatches[0];
          
          console.log("[DineSplit] No hay batch con status='CREADO'. Último batch tiene status:", latestBatch.status);
          console.log("[DineSplit] El nuevo batch se creará automáticamente al enviar el próximo pedido.");
          
          // NO establecer batch activo si no hay uno con status='CREADO'
          // Esto forzará a handleAddToCart a buscar uno o mostrar error
          setActiveBatchId(null);
        }
      } else {
        // Si no hay batches, crear uno nuevo (caso de retrocompatibilidad para órdenes antiguas)
        console.warn("[DineSplit] No hay batches para esta orden, creando uno nuevo...");
        // Crear batch de forma asíncrona
        (async () => {
          if (!supabase) return;
          const { data: newBatch, error: batchError } = await supabase
            .from('order_batches')
            .insert({
              order_id: orderId,
              batch_number: 1,
              status: 'PREPARANDO'
            })
            .select()
            .single();
          
          if (!batchError && newBatch?.id) {
            setActiveBatchId(newBatch.id);
            setBatches([newBatch]);
            console.log("[DineSplit] Batch creado para orden existente. Batch ID:", newBatch.id);
          } else {
            console.error("[DineSplit] Error al crear batch para orden existente:", batchError);
            setActiveBatchId(null);
          }
        })();
      }
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
      
      // PASO 3: Verificar orden activa
      // Si la mesa está OCUPADA, buscar la orden más reciente (excluyendo PAGADO y CANCELADO)
      // Si la mesa no está OCUPADA, solo buscar órdenes ABIERTAS
      let activeTableOrder;
      
      if (tableData.status === 'OCUPADA') {
        // Mesa ocupada: buscar la orden más reciente que no esté PAGADO o CANCELADO
        const { data: orders } = await supabase
          .from('orders')
          .select('id, status')
          .eq('table_id', tableData.id)
          .order('created_at', { ascending: false });
        
        // Filtrar en el código para excluir PAGADO y CANCELADO
        activeTableOrder = orders?.find(order => 
          order.status !== 'PAGADO' && order.status !== 'CANCELADO'
        );
      } else {
        // Mesa no ocupada: solo buscar órdenes ABIERTAS
        const { data: openOrder } = await supabase
          .from('orders')
          .select('id, status')
          .eq('table_id', tableData.id)
          .eq('status', 'ABIERTO')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeTableOrder = openOrder;
      }

      if (activeTableOrder) {
        localStorage.setItem(ACTIVE_ORDER_KEY, activeTableOrder.id);
        setActiveOrderId(activeTableOrder.id);
        // Cargar guests primero para tener los IDs correctos
        await fetchOrderGuests(activeTableOrder.id);
        // Luego cargar items (que pueden referenciar guest_id)
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

  // Función para crear orden y guardar guests cuando se completa GUEST_INFO
  const handleCreateOrderWithGuests = useCallback(async (guestsToSave: Guest[]) => {
    if (!restaurant || !currentTable || !supabase) return false;
    
    try {
      // Crear la orden
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurant.id,
          table_id: currentTable.id,
          waiter_id: currentWaiter?.id || null,
          status: 'ABIERTO',
          total_amount: 0,
          guest_count: guestsToSave.length,
          guest_name: guestsToSave[0]?.name || 'Invitado 1'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Guardar los guests en order_guests
      // El primer comensal (position 1) es el host (is_host=TRUE), el resto FALSE
      // Todos los guests se crean con paid=false por defecto
      const guestsToInsert = guestsToSave.map((guest, index) => ({
        order_id: newOrder.id,
        name: guest.name,
        is_host: index === 0, // TRUE para el primer comensal (position 1), FALSE para los demás
        position: index + 1, // position 1 para el host, 2, 3, 4... para los demás
        paid: false // Por defecto, ningún comensal ha pagado
      }));

      const { data: savedGuests, error: guestsError } = await supabase
        .from('order_guests')
        .insert(guestsToInsert)
        .select();

      if (guestsError) throw guestsError;

      // Actualizar el estado guests con los IDs reales de la base de datos
      const updatedGuests = guestsToSave.map((guest, index) => ({
        ...guest,
        id: savedGuests[index].id // Reemplazar el ID local con el UUID real
      }));

      setGuests(updatedGuests);
      setActiveOrderId(newOrder.id);
      localStorage.setItem(ACTIVE_ORDER_KEY, newOrder.id);
      
      // Crear el PRIMER batch para esta orden
      console.log("[DineSplit] Creando primer batch para la orden:", newOrder.id);
      const { data: firstBatch, error: batchError } = await supabase
        .from('order_batches')
        .insert({
          order_id: newOrder.id,
          batch_number: 1,
          status: 'CREADO' // Estado inicial: CREADO (cambiará a ENVIADO cuando se envíe)
        })
        .select()
        .single();
      
      if (batchError) {
        console.error("[DineSplit] Error al crear primer batch:", batchError);
        throw batchError;
      }
      
      if (!firstBatch || !firstBatch.id) {
        throw new Error("No se pudo crear el primer batch. El batch no tiene ID.");
      }
      
      console.log("[DineSplit] Primer batch creado exitosamente. Batch ID:", firstBatch.id);
      
      // IMPORTANTE: Establecer el batch_id activo ANTES de permitir que se agreguen items
      setActiveBatchId(firstBatch.id);
      setBatches([firstBatch]); // Guardar el batch en el estado
      
      console.log("[DineSplit] ActiveBatchId establecido a:", firstBatch.id);
      
      // Actualizar el estado de la mesa a "OCUPADA"
      const { error: tableUpdateError } = await supabase
        .from('tables')
        .update({ status: 'OCUPADA' })
        .eq('id', currentTable.id);
      
      if (tableUpdateError) {
        console.error("[DineSplit] Error al actualizar estado de mesa:", tableUpdateError);
        // No lanzamos error para no bloquear el flujo, solo lo registramos
      }
      
      return true;
    } catch (error: any) {
      console.error("[DineSplit] Error al crear orden con guests:", error);
      alert(`Error al crear la orden: ${error.message}`);
      return false;
    }
  }, [restaurant, currentTable, currentWaiter]);

  // Función para recuperar guests de una orden existente
  const fetchOrderGuests = useCallback(async (orderId: string) => {
    if (!supabase) return;
    
    const { data: orderGuests, error } = await supabase
      .from('order_guests')
      .select('*')
      .eq('order_id', orderId)
      .order('position', { ascending: true });

    if (error) {
      console.error("[DineSplit] Error al cargar guests:", error);
      return;
    }

    if (orderGuests) {
      const guestsFromDB: Guest[] = orderGuests.map(og => ({
        id: og.id, // Usar el UUID real de la base de datos
        name: og.name,
        isHost: og.is_host || false,
        individualAmount: og.individual_amount || null, // Monto individual guardado
        paid: og.paid || false, // Estado de pago
        payment_id: og.payment_id || null, // ID del pago relacionado
        payment_method: og.payment_method || null // Método de pago seleccionado
      }));
      console.log("[DineSplit] Guests cargados desde DB:", guestsFromDB.length, "guests");
      console.log("[DineSplit] Guest IDs:", guestsFromDB.map(g => g.id));
      setGuests(guestsFromDB);
      // Establecer el activeGuestId al primer guest cargado para que se muestren sus items
      if (guestsFromDB.length > 0) {
        setActiveGuestId(guestsFromDB[0].id);
        console.log("[DineSplit] ActiveGuestId establecido a:", guestsFromDB[0].id);
      }
    }
  }, []);

  // Función para guardar montos individuales en order_guests
  // Esta función se llama CADA VEZ que se hace click en "Confirmar División"
  const handleSaveSplitAmounts = useCallback(async (shares: any[]) => {
    if (!supabase || !activeOrderId) {
      console.error("[DineSplit] No se puede guardar montos: supabase o activeOrderId no disponible");
      return false;
    }
    
    try {
      console.log("[DineSplit] ========================================");
      console.log("[DineSplit] Guardando montos individuales para", shares.length, "guests");
      console.log("[DineSplit] Montos a guardar:", shares.map(s => ({ id: s.id, name: s.name, total: s.total })));
      
      // CRÍTICO: Actualizar CADA guest con su monto individual (incluso si es 0)
      // Esto asegura que todos los guests en order_guests tengan su individual_amount actualizado
      const updatePromises = shares.map(share => {
        const amount = Number(share.total) || 0;
        console.log("[DineSplit] Actualizando guest", share.id, "con monto:", amount);
        return supabase
          .from('order_guests')
          .update({ individual_amount: amount })
          .eq('id', share.id)
          .select(); // Incluir select para verificar que se actualizó
      });
      
      const results = await Promise.all(updatePromises);
      
      // Verificar si hubo errores y mostrar detalles
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error("[DineSplit] ❌ Errores al guardar montos:", errors);
        errors.forEach((err, idx) => {
          console.error(`[DineSplit] Error ${idx + 1}:`, err.error);
        });
        throw new Error(`Error al guardar algunos montos: ${errors.map(e => e.error?.message).join(', ')}`);
      }
      
      // Verificar que se actualizaron correctamente
      const updatedCounts = results.filter(r => r.data && r.data.length > 0);
      console.log("[DineSplit] ✅ Montos individuales guardados exitosamente");
      console.log("[DineSplit] Registros actualizados:", updatedCounts.length, "de", results.length);
      console.log("[DineSplit] ========================================");
      
      // Recargar guests para actualizar el estado local con los nuevos montos
      await fetchOrderGuests(activeOrderId);
      
      return true;
    } catch (error: any) {
      console.error("[DineSplit] ❌ Error al guardar montos individuales:", error);
      return false;
    }
  }, [supabase, activeOrderId, fetchOrderGuests]);

  // Función para actualizar el nombre de un comensal en la base de datos
  const handleUpdateGuestName = useCallback(async (guestId: string, newName: string) => {
    if (!supabase || !activeOrderId) return;
    
    try {
      // Actualizar en la base de datos
      // El estado local ya se actualiza en MenuView para mejor UX
      const { error } = await supabase
        .from('order_guests')
        .update({ name: newName.trim() || newName })
        .eq('id', guestId);

      if (error) {
        console.error("[DineSplit] Error al actualizar nombre de comensal:", error);
        throw error;
      }
    } catch (error: any) {
      console.error("[DineSplit] Error al actualizar nombre:", error);
      // No mostrar alert para no interrumpir la UX, solo loguear
    }
  }, [supabase, activeOrderId]);

  // Función para actualizar múltiples nombres de comensales y agregar nuevos
  const handleSaveGuestChanges = useCallback(async (updatedGuests: Guest[], newGuests: Guest[]) => {
    if (!supabase || !activeOrderId) return false;
    
    try {
      // Actualizar nombres de comensales existentes
      if (updatedGuests.length > 0) {
        const updatePromises = updatedGuests.map(guest => 
          supabase
            .from('order_guests')
            .update({ name: guest.name.trim() || guest.name })
            .eq('id', guest.id)
        );
        
        await Promise.all(updatePromises);
      }

      // Agregar nuevos comensales
      if (newGuests.length > 0) {
        // Obtener el último position para agregar nuevos comensales
        const { data: existingGuests } = await supabase
          .from('order_guests')
          .select('position')
          .eq('order_id', activeOrderId)
          .order('position', { ascending: false })
          .limit(1);
        
        const lastPosition = existingGuests && existingGuests.length > 0 ? existingGuests[0].position : 0;

        const guestsToInsert = newGuests.map((guest, index) => ({
          order_id: activeOrderId,
          name: guest.name.trim() || guest.name,
          is_host: false,
          position: lastPosition + index + 1,
          paid: false // Los nuevos guests se crean sin pagar
        }));

        const { data: savedNewGuests, error: insertError } = await supabase
          .from('order_guests')
          .insert(guestsToInsert)
          .select();

        if (insertError) throw insertError;

        // Actualizar el estado reemplazando los guests temporales con los reales de la DB
        setGuests(prev => {
          // Filtrar los guests temporales (nuevos) y mantener los existentes con nombres actualizados
          const existingGuestsList = prev.filter(g => !newGuests.find(ng => ng.id === g.id));
          const updatedExistingGuests = existingGuestsList.map(g => {
            const updated = updatedGuests.find(ug => ug.id === g.id);
            return updated || g;
          });
          
          // Agregar los nuevos guests con sus IDs reales
          const updatedNewGuests = newGuests.map((guest, index) => ({
            ...guest,
            id: savedNewGuests[index].id
          }));
          
          return [...updatedExistingGuests, ...updatedNewGuests];
        });

        // Actualizar guest_count en orders
        const { count } = await supabase
          .from('order_guests')
          .select('*', { count: 'exact', head: true })
          .eq('order_id', activeOrderId);
        
        if (count !== null) {
          await supabase
            .from('orders')
            .update({ guest_count: count })
            .eq('id', activeOrderId);
        }
      }

      return true;
    } catch (error: any) {
      console.error("[DineSplit] Error al guardar cambios de comensales:", error);
      return false;
    }
  }, [supabase, activeOrderId]);

  useEffect(() => {
    const initApp = async () => {
      // Si hay orderId en la URL (con o sin guestId), cargar datos para el link compartido
      if (orderIdParam) {
        setLoading(true);
        try {
          // Cargar la orden y obtener restaurant_id
          const { data: orderData } = await supabase
            .from('orders')
            .select('*, tables!inner(restaurant_id)')
            .eq('id', orderIdParam)
            .maybeSingle();

          if (!orderData) {
            setError("No se pudo cargar la orden. El link puede estar expirado.");
            setLoading(false);
            return;
          }

          const restaurantId = orderData.tables.restaurant_id;

          // Cargar restaurante, menuItems, guests, items y batches en paralelo
          const [restaurantRes, menuItemsRes, guestsRes] = await Promise.all([
            supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle(),
            supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('order_guests').select('*').eq('order_id', orderIdParam).order('position', { ascending: true })
          ]);

          if (restaurantRes.error || !restaurantRes.data) {
            throw new Error("No se pudo cargar el restaurante.");
          }

          setRestaurant(restaurantRes.data);
          setMenuItems(menuItemsRes.data || []);
          setActiveOrderId(orderIdParam);
          localStorage.setItem(ACTIVE_ORDER_KEY, orderIdParam);

          // Cargar guests con sus montos individuales y estado de pago
          if (guestsRes.data) {
            const guestsFromDB: Guest[] = guestsRes.data.map(og => ({
              id: og.id,
              name: og.name,
              isHost: og.is_host || false,
              individualAmount: og.individual_amount || null, // CRÍTICO: Incluir individual_amount para que IndividualShareView lo use
              paid: og.paid || false, // Estado de pago
              payment_id: og.payment_id || null, // ID del pago relacionado
              payment_method: og.payment_method || null // Método de pago seleccionado
            }));
            console.log("[DineSplit] Guests cargados desde link QR:", guestsFromDB.map(g => ({ id: g.id, name: g.name, individualAmount: g.individualAmount, paid: g.paid, payment_id: g.payment_id })));
            setGuests(guestsFromDB);
          }

          // Cargar items y batches
          await fetchOrderItemsFromDB(orderIdParam);
          
          // Si hay guestId, navegar directamente a INDIVIDUAL_SHARE
          // Si no hay guestId, navegar a GUEST_SELECTION para que el usuario elija
          if (guestIdParam) {
            setCurrentView('INDIVIDUAL_SHARE');
          } else {
            setCurrentView('GUEST_SELECTION');
          }
          setLoading(false);
        } catch (error: any) {
          console.error("[DineSplit] Error al cargar orden desde link:", error);
          setError("No se pudo cargar la orden. El link puede estar expirado.");
          setLoading(false);
        }
      } else if (resParam && tableParam) {
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
  }, [resParam, tableParam, orderIdParam, guestIdParam, handleStartSession, fetchOrderItemsFromDB]);

  // Función para procesar el pago exitoso
  const handlePaymentSuccess = useCallback(async (guestId: string, paymentAmount: number, paymentMethod: string, mpTransactionId?: string) => {
    if (!supabase || !activeOrderId || !guestId) {
      console.error("[DineSplit] No se puede procesar pago: faltan datos");
      return false;
    }

    try {
      console.log("[DineSplit] ========================================");
      console.log("[DineSplit] Procesando pago exitoso");
      console.log("[DineSplit] Guest ID:", guestId);
      console.log("[DineSplit] Amount:", paymentAmount);
      console.log("[DineSplit] Method:", paymentMethod);
      console.log("[DineSplit] MP Transaction ID:", mpTransactionId);

      // Paso 1: Crear registro en la tabla payments
      const { data: newPayment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: activeOrderId,
          amount: paymentAmount,
          payment_method: paymentMethod,
          mp_transaction_id: mpTransactionId || null,
          status: 'approved' // Mercado Pago devuelve 'approved' cuando es exitoso
        })
        .select()
        .single();

      if (paymentError) {
        console.error("[DineSplit] Error al crear registro de pago:", paymentError);
        throw paymentError;
      }

      if (!newPayment || !newPayment.id) {
        throw new Error("No se pudo crear el registro de pago. El pago no tiene ID.");
      }

      console.log("[DineSplit] ✅ Registro de pago creado. Payment ID:", newPayment.id);

      // Normalizar el nombre del método de pago
      let normalizedPaymentMethod = paymentMethod;
      if (paymentMethod === 'transfer') {
        normalizedPaymentMethod = 'transferencia';
      } else if (paymentMethod === 'cash') {
        normalizedPaymentMethod = 'efectivo';
      }

      // Paso 2: Actualizar order_guests con paid=true, payment_id y payment_method
      const { error: guestUpdateError } = await supabase
        .from('order_guests')
        .update({
          paid: true,
          payment_id: newPayment.id,
          payment_method: normalizedPaymentMethod
        })
        .eq('id', guestId);

      if (guestUpdateError) {
        console.error("[DineSplit] Error al actualizar guest:", guestUpdateError);
        throw guestUpdateError;
      }

      console.log("[DineSplit] ✅ Guest actualizado con paid=true, payment_id:", newPayment.id, "y payment_method:", normalizedPaymentMethod);
      console.log("[DineSplit] ========================================");

      // Recargar guests para actualizar el estado local
      await fetchOrderGuests(activeOrderId);

      return true;
    } catch (error: any) {
      console.error("[DineSplit] ❌ Error al procesar pago exitoso:", error);
      return false;
    }
  }, [supabase, activeOrderId, fetchOrderGuests]);

  useEffect(() => {
    if (paymentStatus === 'success' && activeOrderId) {
      // Obtener guestId de la URL o del estado
      const urlParams = new URLSearchParams(window.location.search);
      const guestIdFromUrl = urlParams.get('guestId');
      
      // Obtener información del pago de la URL (Mercado Pago pasa estos parámetros)
      const paymentId = urlParams.get('payment_id');
      const preferenceId = urlParams.get('preference_id');
      const status = urlParams.get('status');
      const paymentType = urlParams.get('payment_type_id');

      console.log("[DineSplit] Pago exitoso detectado. Parámetros de URL:", {
        guestId: guestIdFromUrl,
        payment_id: paymentId,
        preference_id: preferenceId,
        status: status,
        payment_type: paymentType
      });

      // Obtener el monto del pago desde el guest
      const payingGuest = guests.find(g => g.id === guestIdFromUrl);
      const paymentAmount = payingGuest?.individualAmount || 0;

      if (guestIdFromUrl && paymentAmount > 0) {
        // Procesar el pago
        handlePaymentSuccess(
          guestIdFromUrl,
          paymentAmount,
          'mercadopago',
          paymentId || undefined
        ).then(success => {
          if (success) {
            localStorage.clear();
            setCurrentView('FEEDBACK');
          } else {
            alert("Hubo un error al registrar el pago. Por favor, contacta al restaurante.");
          }
        });
      } else {
        console.warn("[DineSplit] No se pudo procesar el pago: guestId o amount faltante");
        localStorage.clear();
        setCurrentView('FEEDBACK');
      }
    }
  }, [paymentStatus, activeOrderId, guests, handlePaymentSuccess]);

  // Función para actualizar el método de pago en order_guests
  const updatePaymentMethod = useCallback(async (guestId: string, method: 'mercadopago' | 'transfer' | 'cash') => {
    if (!supabase || !activeOrderId || !guestId) {
      console.error("[DineSplit] No se puede actualizar método de pago: faltan datos");
      return false;
    }

    try {
      // Normalizar el nombre del método de pago
      let normalizedMethod = method;
      if (method === 'transfer') {
        normalizedMethod = 'transferencia' as any;
      } else if (method === 'cash') {
        normalizedMethod = 'efectivo' as any;
      }

      const { error } = await supabase
        .from('order_guests')
        .update({ payment_method: normalizedMethod })
        .eq('id', guestId);

      if (error) {
        console.error("[DineSplit] Error al actualizar método de pago:", error);
        return false;
      }

      console.log("[DineSplit] ✅ Método de pago actualizado:", normalizedMethod, "para guest:", guestId);
      return true;
    } catch (error: any) {
      console.error("[DineSplit] Error al actualizar método de pago:", error);
      return false;
    }
  }, [supabase, activeOrderId]);

  // Recargar guests cuando se navega al MENU si hay una orden activa
  useEffect(() => {
    if (currentView === 'MENU' && activeOrderId && supabase) {
      fetchOrderGuests(activeOrderId);
    }
  }, [currentView, activeOrderId, fetchOrderGuests]);

  const handlePayIndividual = async (paymentData: { amount: number, method: string, tip: number }) => {
    if (!activeOrderId || !restaurant) return;
    
    // Obtener guestId de la URL si existe
    const urlParams = new URLSearchParams(window.location.search);
    const guestId = urlParams.get('guestId') || activeGuestId;
    
    if (paymentData.method === 'mercadopago') {
      try {
        const { data: config } = await supabase.from('payment_configs').select('*').eq('restaurant_id', restaurant.id).eq('provider', 'mercadopago').maybeSingle();
        if (!config?.token_cbu) throw new Error("Mercado Pago no configurado.");

        const cleanUrl = window.location.origin + window.location.pathname;
        // Incluir guestId en la URL de retorno para poder identificar quién pagó
        const successUrl = cleanUrl + `?status=success&orderId=${activeOrderId}&guestId=${guestId}`;
        
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.token_cbu}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ title: `Pago Mesa ${currentTable?.table_number}`, quantity: 1, unit_price: paymentData.amount, currency_id: 'ARS' }],
            external_reference: `${activeOrderId}|${guestId}`, // Incluir guestId en external_reference
            back_urls: { success: successUrl },
            auto_return: 'approved'
          })
        });
        const pref = await response.json();
        if (pref.init_point) window.location.href = pref.init_point;
      } catch (err: any) { alert(err.message); }
    } else { 
      // Para métodos de pago no-Mercado Pago (transferencia, efectivo), procesar directamente
      if (guestId) {
        const totalAmount = paymentData.amount + paymentData.tip;
        await handlePaymentSuccess(guestId, totalAmount, paymentData.method);
      }
      localStorage.clear();
      setCurrentView('FEEDBACK'); 
    }
  };

  const handleSendOrder = async () => {
    if (!restaurant || !currentTable) return;
    // Filtrar items con status='elegido' (aún no enviados) del batch actual
    const pendingItems = cart.filter(item => 
      item.status === 'elegido' && // Solo items con status='elegido'
      item.batch_id === activeBatchId // Solo items del batch actual
    );
    
    console.log("[DineSplit] handleSendOrder - Total items en cart:", cart.length);
    console.log("[DineSplit] handleSendOrder - Pending items filtrados:", pendingItems.length);
    console.log("[DineSplit] handleSendOrder - Active batch ID:", activeBatchId);
    
    if (pendingItems.length === 0) {
      console.warn("[DineSplit] No hay items pendientes para enviar en el batch actual");
      return;
    }

    setIsSendingOrder(true);
    try {
      let orderId = activeOrderId;
      let currentTotal = 0;

      // La orden ya debería existir (se crea en handleCreateOrderWithGuests)
      if (!orderId) {
        throw new Error("No hay una orden activa. Por favor, completa la información de comensales primero.");
      }
      
      if (!activeBatchId) {
        throw new Error("No hay un batch activo. Por favor, completa la información de comensales primero.");
      }

      // Actualizar el total de la orden
      const { data: existingOrder } = await supabase.from('orders').select('total_amount').eq('id', orderId).single();
      currentTotal = Number(existingOrder?.total_amount || 0);
      
      // Los items ya tienen el batch_id asignado, solo necesitamos cambiar su status a 'pedido'
      const itemIds = pendingItems.map(item => item.id).filter(id => id && typeof id === 'string' && id.length > 10);
      console.log("[DineSplit] Enviando pedido - Items a actualizar:", itemIds.length, "items");
      console.log("[DineSplit] Batch ID del batch actual:", activeBatchId);
      
      if (itemIds.length === 0) {
        console.error("[DineSplit] No hay items válidos. Pending items:", pendingItems.map(i => ({ id: i.id, type: typeof i.id })));
        throw new Error("No hay items válidos para enviar. Asegúrate de que los platos se hayan guardado correctamente.");
      }
      
      // Actualizar solo el status de los items a 'pedido' (ya tienen batch_id)
      console.log("[DineSplit] Actualizando items con status='elegido' a 'pedido' para batch:", activeBatchId);
      console.log("[DineSplit] IDs de items a actualizar:", itemIds);
      console.log("[DineSplit] Criterios: IDs=", itemIds.length, "batch_id=", activeBatchId, "status='elegido'");
      
      // Actualizar por IDs específicos (más confiable que solo por batch_id y status)
      const { error: updateError, data: updatedItems } = await supabase
        .from('order_items')
        .update({ 
          status: 'pedido' // Cambiar el status a 'pedido'
        })
        .in('id', itemIds) // Actualizar por IDs específicos de los pendingItems
        .eq('status', 'elegido') // Solo actualizar si tienen status='elegido' (seguridad extra)
        .select();
      
      if (updateError) {
        console.error("[DineSplit] Error al actualizar order_items:", updateError);
        throw new Error(`Error al actualizar items: ${updateError.message}`);
      }
      
      if (!updatedItems || updatedItems.length === 0) {
        console.error("[DineSplit] ❌ No se actualizaron items con el filtro de status.");
        console.error("[DineSplit] Posible problema de RLS o con el filtro. Intentando sin filtro de status...");
        
        // Si falla con el filtro de status, intentar actualizar solo por IDs (puede ser un problema de RLS)
        const { error: retryError, data: retryItems } = await supabase
          .from('order_items')
          .update({ status: 'pedido' })
          .in('id', itemIds) // Solo por IDs, sin filtro de status
          .select();
        
        if (retryError) {
          console.error("[DineSplit] ❌ Error en retry (posible problema de RLS):", retryError);
          console.error("[DineSplit] Verifica las políticas RLS de la tabla order_items en Supabase.");
          console.error("[DineSplit] La tabla debe permitir UPDATE para los order_items.");
          throw new Error(`Error al actualizar items (posible problema de RLS): ${retryError.message}`);
        }
        
        if (!retryItems || retryItems.length === 0) {
          console.error("[DineSplit] ❌ No se actualizaron items ni con retry.");
          // Verificar qué items hay en la BD
          const { data: dbItems } = await supabase
            .from('order_items')
            .select('id, status, batch_id')
            .in('id', itemIds);
          
          console.error("[DineSplit] Items en BD con esos IDs:", dbItems);
          throw new Error("No se pudieron actualizar los items. Verifica las políticas RLS de order_items en Supabase.");
        }
        
        // Si el retry funcionó, continuar con esos items
        console.log("[DineSplit] ✅ Items actualizados sin filtro de status:", retryItems.length);
        // Usar retryItems como updatedItems para continuar el flujo
        const finalUpdatedItems = retryItems;
        
        // Continuar con el flujo usando finalUpdatedItems
        console.log("[DineSplit] ✅ Items actualizados exitosamente:", finalUpdatedItems.length);
        console.log("[DineSplit] Items actualizados:", finalUpdatedItems.map(i => ({ id: i.id, status: i.status, batch_id: i.batch_id })));

        // Actualizar el batch
        console.log("[DineSplit] Actualizando batch a status='ENVIADO'");
        const { error: batchUpdateError } = await supabase
          .from('order_batches')
          .update({ status: 'ENVIADO' })
          .eq('id', activeBatchId);
        
        if (batchUpdateError) {
          console.error("[DineSplit] Error al actualizar batch:", batchUpdateError);
          throw new Error(`Error al actualizar batch: ${batchUpdateError.message}`);
        }
        
        console.log("[DineSplit] ✅ Batch actualizado a status='ENVIADO'");

        // Actualizar total_amount de la orden
        const newItemsTotal = pendingItems.reduce((sum, item) => sum + (Number(menuItems.find(m => m.id === item.itemId)?.price || 0) * item.quantity), 0);
        await supabase.from('orders').update({ total_amount: currentTotal + newItemsTotal }).eq('id', orderId);

        // Crear INMEDIATAMENTE un NUEVO batch para los próximos items que se agreguen
        const { count: batchCount } = await supabase.from('order_batches').select('*', { count: 'exact', head: true }).eq('order_id', orderId);
        const nextBatchNum = (batchCount || 0) + 1;
        
        console.log("[DineSplit] Creando nuevo batch #", nextBatchNum, "inmediatamente después de enviar el pedido");
        
        const { data: nextBatch, error: nextBatchError } = await supabase
          .from('order_batches')
          .insert({
            order_id: orderId,
            batch_number: nextBatchNum,
            status: 'CREADO' // Estado inicial: CREADO (cambiará a ENVIADO cuando se envíe)
          })
          .select()
          .single();

        if (nextBatchError) {
          console.error("[DineSplit] Error al crear nuevo batch:", nextBatchError);
          throw new Error(`Error al crear nuevo batch: ${nextBatchError.message}`);
        }
        
        if (!nextBatch || !nextBatch.id) {
          throw new Error("No se pudo crear el nuevo batch. El batch no tiene ID.");
        }
        
        console.log("[DineSplit] ✅ Nuevo batch creado inmediatamente. Batch ID:", nextBatch.id);
        setActiveBatchId(nextBatch.id); // Establecer como batch activo para los próximos items

        // Recargar items desde la BD
        await fetchOrderItemsFromDB(orderId!);
        
        // También recargar batches
        const { data: updatedBatches } = await supabase
          .from('order_batches')
          .select('*')
          .eq('order_id', orderId)
          .order('batch_number', { ascending: true });
        
        if (updatedBatches) {
          setBatches(updatedBatches);
          console.log("[DineSplit] Batches actualizados:", updatedBatches.length);
        }
        setCurrentView('PROGRESS');
        return; // Salir temprano ya que manejamos el flujo aquí
      }
      
      console.log("[DineSplit] ✅ Items actualizados exitosamente:", updatedItems.length);
      console.log("[DineSplit] Items actualizados:", updatedItems.map(i => ({ id: i.id, status: i.status, batch_id: i.batch_id })));

      // PASO 2: Actualizar el status del batch de 'CREADO' a 'ENVIADO'
      console.log("[DineSplit] Actualizando batch a status='ENVIADO'");
      const { error: batchUpdateError } = await supabase
        .from('order_batches')
        .update({ status: 'ENVIADO' })
        .eq('id', activeBatchId);
      
      if (batchUpdateError) {
        console.error("[DineSplit] Error al actualizar batch:", batchUpdateError);
        throw new Error(`Error al actualizar batch: ${batchUpdateError.message}`);
      }
      
      console.log("[DineSplit] ✅ Batch actualizado a status='ENVIADO'");

      // Actualizar total_amount de la orden
      const newItemsTotal = pendingItems.reduce((sum, item) => sum + (Number(menuItems.find(m => m.id === item.itemId)?.price || 0) * item.quantity), 0);
      await supabase.from('orders').update({ total_amount: currentTotal + newItemsTotal }).eq('id', orderId);

      // Crear INMEDIATAMENTE un NUEVO batch para los próximos items que se agreguen
      // Esto asegura que cuando el usuario vuelva al menú y agregue más platos, ya tenga un batch disponible
      const { count: batchCount } = await supabase.from('order_batches').select('*', { count: 'exact', head: true }).eq('order_id', orderId);
      const nextBatchNum = (batchCount || 0) + 1;
      
      console.log("[DineSplit] Creando nuevo batch #", nextBatchNum, "inmediatamente después de enviar el pedido");
      
      const { data: nextBatch, error: nextBatchError } = await supabase
        .from('order_batches')
        .insert({
          order_id: orderId,
          batch_number: nextBatchNum,
          status: 'CREADO' // Estado inicial: CREADO (cambiará a ENVIADO cuando se envíe)
        })
        .select()
        .single();

      if (nextBatchError) {
        console.error("[DineSplit] Error al crear nuevo batch:", nextBatchError);
        throw new Error(`Error al crear nuevo batch: ${nextBatchError.message}`);
      }
      
      if (!nextBatch || !nextBatch.id) {
        throw new Error("No se pudo crear el nuevo batch. El batch no tiene ID.");
      }
      
      console.log("[DineSplit] ✅ Nuevo batch creado inmediatamente. Batch ID:", nextBatch.id);
      setActiveBatchId(nextBatch.id); // Establecer como batch activo para los próximos items que se agreguen

      // Recargar items desde la BD para reflejar el status actualizado
      await fetchOrderItemsFromDB(orderId!);
      
      // También recargar batches
      const { data: updatedBatches } = await supabase
        .from('order_batches')
        .select('*')
        .eq('order_id', orderId)
        .order('batch_number', { ascending: true });
      
      if (updatedBatches) {
        setBatches(updatedBatches);
        console.log("[DineSplit] Batches actualizados:", updatedBatches.length);
      }
      setCurrentView('PROGRESS');
    } catch (err: any) {
      alert(`Error al enviar pedido: ${err.message}`);
    } finally {
      setIsSendingOrder(false);
    }
  };

  const navigate = (view: AppView) => setCurrentView(view);

  // Función para agregar item al carrito y guardarlo inmediatamente en la BD
  const handleAddToCart = useCallback(async (item: MenuItem, guestId: string, extras: string[], removedIngredients: string[]) => {
    if (!activeOrderId || !supabase) {
      console.error("[DineSplit] No hay orden activa o supabase no está disponible");
      return;
    }

    try {
      const menuItem = menuItems.find(m => m.id === item.id);
      
      // Verificar si existe un batch con status='CREADO' (NO crear uno nuevo aquí, solo buscarlo)
      // El nuevo batch se crea SOLO cuando se envía un batch en handleSendOrder
      let currentBatchId = activeBatchId;
      
      // Si no hay batch activo o el batch activo no tiene status='CREADO', buscar uno
      if (!currentBatchId) {
        console.log("[DineSplit] No hay batch activo, buscando uno con status='CREADO'...");
        const { data: existingBatches } = await supabase
          .from('order_batches')
          .select('*')
          .eq('order_id', activeOrderId)
          .order('batch_number', { ascending: false });
        
        const createdBatch = existingBatches?.find(b => b.status === 'CREADO');
        
        if (createdBatch) {
          currentBatchId = createdBatch.id;
          setActiveBatchId(createdBatch.id);
          console.log("[DineSplit] Batch con status='CREADO' encontrado:", createdBatch.id, "batch_number:", createdBatch.batch_number);
        } else {
          console.error("[DineSplit] ❌ No se encontró ningún batch con status='CREADO'. Debe enviar un pedido primero para crear un batch.");
          throw new Error("No hay batch disponible para agregar items. Debe enviar un pedido primero.");
        }
      } else {
        // Verificar que el batch activo tenga status='CREADO'
        const { data: activeBatch } = await supabase
          .from('order_batches')
          .select('id, status, batch_number')
          .eq('id', currentBatchId)
          .single();
        
        if (activeBatch && activeBatch.status !== 'CREADO') {
          // El batch activo ya fue enviado, buscar uno nuevo con status='CREADO'
          console.log("[DineSplit] Batch activo tiene status='", activeBatch.status, "'. Buscando batch con status='CREADO'...");
          const { data: allBatches } = await supabase
            .from('order_batches')
            .select('*')
            .eq('order_id', activeOrderId)
            .order('batch_number', { ascending: false });
          
          const createdBatch = allBatches?.find(b => b.status === 'CREADO');
          
          if (createdBatch) {
            currentBatchId = createdBatch.id;
            setActiveBatchId(createdBatch.id);
            console.log("[DineSplit] Batch con status='CREADO' encontrado:", createdBatch.id, "batch_number:", createdBatch.batch_number);
          } else {
            console.error("[DineSplit] ❌ No se encontró ningún batch con status='CREADO'. Debe enviar un pedido primero para crear un batch.");
            throw new Error("No hay batch disponible para agregar items. Debe enviar un pedido primero.");
          }
        }
      }
      
      if (!currentBatchId) {
        throw new Error("No se pudo encontrar un batch activo con status='CREADO'.");
      }

      console.log("[DineSplit] Agregando item al carrito con batch_id:", currentBatchId);
      
      // Insertar con batch_id del batch activo (que ahora sabemos que tiene status='CREADO')
      const insertPayload: any = {
        order_id: activeOrderId,
        guest_id: guestId, // UUID de order_guests
        menu_item_id: item.id,
        quantity: 1,
        unit_price: Number(menuItem?.price || 0),
        extras: extras.length > 0 ? extras : null, // Guardar en columna extras
        removed_ingredients: removedIngredients.length > 0 ? removedIngredients : null, // Guardar en columna removed_ingredients
        batch_id: currentBatchId, // CRÍTICO: Usar el batch_id del batch activo (con status='CREADO')
        status: 'elegido' // Estado inicial: elegido (aún no enviado a cocina)
      };
      
      console.log("[DineSplit] Insertando order_item con payload:", { ...insertPayload, extras: insertPayload.extras?.length, removed_ingredients: insertPayload.removed_ingredients?.length });
      
      const { data: newItem, error } = await supabase
        .from('order_items')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error("[DineSplit] Error al insertar item:", error);
        console.error("[DineSplit] Error details:", JSON.stringify(error, null, 2));
        throw error;
      }

      // Validar que newItem tenga un ID válido y batch_id correcto
      if (!newItem || !newItem.id) {
        console.error("[DineSplit] Error: El item insertado no tiene ID válido:", newItem);
        throw new Error("Error al insertar item: no se recibió un ID válido de la base de datos");
      }

      if (newItem.batch_id !== currentBatchId) {
        console.error("[DineSplit] ⚠️ ADVERTENCIA: El batch_id del item insertado no coincide con currentBatchId", {
          itemBatchId: newItem.batch_id,
          currentBatchId: currentBatchId
        });
      }

      console.log("[DineSplit] ✅ Item insertado correctamente. ID:", newItem.id, "Batch ID:", newItem.batch_id, "Menu Item ID:", item.id);
      
      // Agregar al estado local
      setCart(prev => [...prev, {
        id: newItem.id, // UUID de Supabase
        itemId: item.id,
        guestId: guestId,
        quantity: 1,
        order_id: activeOrderId,
        batch_id: newItem.batch_id || currentBatchId, // Usar el batch_id de la BD
        isConfirmed: false,
        status: newItem.status || 'elegido',
        extras,
        removedIngredients
      }]);
    } catch (err: any) {
      console.error("[DineSplit] Error al agregar item al carrito:", err);
      alert(`Error al agregar plato: ${err.message}`);
      throw err; // Re-lanzar el error para que el componente pueda manejarlo
    }
  }, [activeOrderId, activeBatchId, supabase, menuItems]);

  // Función para actualizar item en el carrito y en la BD
  const handleUpdateCartItem = useCallback(async (id: string, updates: Partial<OrderItem>) => {
    if (!supabase) return;

    const cartItem = cart.find(item => item.id === id);
    if (!cartItem) return;

    // Si la cantidad llega a 0, eliminar el item
    const newQuantity = updates.quantity !== undefined ? updates.quantity : cartItem.quantity;
    if (newQuantity <= 0) {
      try {
        // Eliminar de la BD
        const { error } = await supabase
          .from('order_items')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        
        // Actualizar estado local
        setCart(prev => prev.filter(item => item.id !== id));
      } catch (err: any) {
        console.error("[DineSplit] Error al eliminar item:", err);
        alert(`Error al eliminar plato: ${err.message}`);
      }
      return;
    }

    // Actualizar en la BD
    try {
      const updateData: any = {};
      if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
      if (updates.extras !== undefined) updateData.extras = updates.extras.length > 0 ? updates.extras : null;
      if (updates.removedIngredients !== undefined) updateData.removed_ingredients = updates.removedIngredients.length > 0 ? updates.removedIngredients : null;

      const { error } = await supabase
        .from('order_items')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Actualizar estado local
      setCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    } catch (err: any) {
      console.error("[DineSplit] Error al actualizar item:", err);
      alert(`Error al actualizar plato: ${err.message}`);
    }
  }, [cart, supabase]);

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
            return <GuestInfoView 
              onBack={() => navigate('SCAN')} 
              onNext={async (finalGuests: Guest[]) => {
                // Crear orden y guardar guests antes de navegar a MENU
                const success = await handleCreateOrderWithGuests(finalGuests);
                if (success) {
                  navigate('MENU');
                }
              }} 
              guests={guests} 
              setGuests={setGuests} 
              table={currentTable} 
              waiter={currentWaiter} 
              restaurant={restaurant} 
            />;
          case 'MENU': 
            return <MenuView onNext={() => navigate('ORDER_SUMMARY')} guests={guests} setGuests={setGuests} cart={cart} onAddToCart={handleAddToCart} onUpdateCartItem={handleUpdateCartItem} onIndividualShare={() => navigate('INDIVIDUAL_SHARE')} selectedGuestId={activeGuestId} onSelectGuest={setActiveGuestId} initialCategory={activeCategory} onCategoryChange={setActiveCategory} editingCartItem={editingCartItem} onCancelEdit={() => setEditingCartItem(null)} menuItems={menuItems} categories={categories} restaurant={restaurant} table={currentTable} onSaveGuestChanges={handleSaveGuestChanges} />;
          case 'ORDER_SUMMARY': 
            return <OrderSummaryView guests={guests} cart={cart} batches={batches} onBack={() => navigate('MENU')} onNavigateToCategory={(gId, cat) => { setActiveGuestId(gId); setActiveCategory(cat); navigate('MENU'); }} onEditItem={(item) => { setEditingCartItem(item); navigate('MENU'); }} onSend={handleSendOrder} onPay={() => navigate('SPLIT_BILL')} isSending={isSendingOrder} onUpdateQuantity={(id, d) => handleUpdateCartItem(id, { quantity: Math.max(0, (cart.find(it => it.id === id)?.quantity || 1) + d) })} menuItems={menuItems} categories={categories} tableNumber={currentTable?.table_number} waiter={currentWaiter} />;
          case 'PROGRESS': 
            return <OrderProgressView cart={cart} batches={batches} activeOrderId={activeOrderId} onNext={() => navigate('SPLIT_BILL')} onBack={() => navigate('MENU')} onRedirectToFeedback={() => navigate('FEEDBACK')} tableNumber={currentTable?.table_number} menuItems={menuItems} />;
          case 'SPLIT_BILL': 
            return <SplitBillView guests={guests} cart={cart} onBack={() => navigate('PROGRESS')} onConfirm={async (shares) => { 
              console.log("[DineSplit] Confirmar División clickeado. Shares recibidos:", shares);
              setSplitData(shares);
              // Guardar montos individuales en order_guests - IMPORTANTE: Se actualiza CADA VEZ que se confirma
              const saved = await handleSaveSplitAmounts(shares);
              if (saved) {
                navigate('CHECKOUT');
              } else {
                alert("Hubo un error al guardar la división de la cuenta. Intenta nuevamente.");
              }
            }} menuItems={menuItems} />;
          case 'GUEST_SELECTION':
            return <GuestSelectionView guests={guests} cart={cart} menuItems={menuItems} splitData={splitData} onSelectGuest={(guestId) => { 
              // Actualizar URL con guestId y navegar a INDIVIDUAL_SHARE
              const url = new URL(window.location.href);
              url.searchParams.set('guestId', guestId);
              window.history.pushState({}, '', url.toString());
              setCurrentView('INDIVIDUAL_SHARE');
            }} restaurant={restaurant} />;
          case 'CHECKOUT': 
            return <CheckoutView 
              onBack={() => navigate('SPLIT_BILL')} 
              onConfirm={(guestId) => {
                // Si hay guestId, agregarlo a la URL antes de navegar
                if (guestId && activeOrderId) {
                  const url = new URL(window.location.href);
                  url.searchParams.set('orderId', activeOrderId);
                  url.searchParams.set('guestId', guestId);
                  window.history.pushState({}, '', url.toString());
                }
                navigate('INDIVIDUAL_SHARE');
              }} 
              cart={cart} 
              guests={guests} 
              menuItems={menuItems} 
              tableNumber={currentTable?.table_number} 
              splitData={splitData} 
              activeOrderId={activeOrderId} 
            />;
          case 'INDIVIDUAL_SHARE': 
            return <IndividualShareView 
              onBack={() => {
                // Si venimos de un link compartido (hay orderId en URL), volver a GUEST_SELECTION
                // Si no, volver a CHECKOUT
                const urlParams = new URLSearchParams(window.location.search);
                const hasOrderId = urlParams.get('orderId');
                if (hasOrderId && !urlParams.get('res')) {
                  // Viene de link compartido, volver a selección de comensal
                  const url = new URL(window.location.href);
                  url.searchParams.delete('guestId');
                  window.history.pushState({}, '', url.toString());
                  navigate('GUEST_SELECTION');
                } else {
                  navigate('CHECKOUT');
                }
              }} 
              onPay={handlePayIndividual}
              onShowTransfer={(amount) => {
                setPaymentAmount(amount);
                navigate('TRANSFER_PAYMENT');
              }}
              onShowCash={(amount, guestName) => {
                setPaymentAmount(amount);
                setPaymentGuestName(guestName);
                navigate('CASH_PAYMENT');
              }}
              onUpdatePaymentMethod={updatePaymentMethod}
              cart={cart} 
              menuItems={menuItems} 
              splitData={splitData} 
              restaurant={restaurant} 
              guests={guests} 
            />;
          case 'TRANSFER_PAYMENT':
            return <TransferPaymentView 
              onBack={() => navigate('INDIVIDUAL_SHARE')}
              amount={paymentAmount}
              restaurant={restaurant}
            />;
          case 'CASH_PAYMENT':
            return <CashPaymentView 
              onBack={() => navigate('INDIVIDUAL_SHARE')}
              amount={paymentAmount}
              guestName={paymentGuestName}
            />;
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