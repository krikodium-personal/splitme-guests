import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, useSearchParams } from 'react-router-dom';
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
import ConfirmationView from './views/ConfirmationView';
import { getSession, setSession, getOrderId, setOrderId, removeOrderId, clearSession, getActiveGuestId, setActiveGuestIdCookie } from './lib/sessionCookies';

const READY_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

/** Mensaje amigable según status_detail de Mercado Pago cuando el pago es rechazado. */
function getMessageFromStatusDetail(statusDetail: string | null): string {
  if (!statusDetail || typeof statusDetail !== 'string') {
    return 'El pago fue rechazado. Por favor, intentá con otro medio de pago.';
  }
  const d = statusDetail.toLowerCase();
  const map: Record<string, string> = {
    'cc_rejected_bad_filled_card_number': 'El número de tarjeta es incorrecto. Revisalo e intentá de nuevo.',
    'cc_rejected_bad_filled_date': 'La fecha de vencimiento es incorrecta o la tarjeta está vencida.',
    'cc_rejected_bad_filled_security_code': 'El código de seguridad (CVV) es incorrecto.',
    'cc_rejected_bad_filled_other': 'Revisá los datos de la tarjeta e intentá de nuevo.',
    'cc_rejected_insufficient_amount': 'Fondos o límite insuficiente en la tarjeta.',
    'cc_rejected_card_disabled': 'La tarjeta está deshabilitada o bloqueada.',
    'cc_rejected_high_risk': 'El pago fue rechazado por controles de seguridad. Probá con otro medio.',
    'cc_rejected_blacklist': 'No se pudo procesar con esta tarjeta. Usá otro medio de pago.',
    'cc_rejected_duplicated_payment': 'Este pago ya fue registrado. Si no lo ves, esperá unos minutos.',
    'cc_rejected_invalid_installments': 'El número de cuotas no es válido para esta tarjeta.',
    'cc_rejected_max_attempts': 'Superaste el máximo de intentos. Probá más tarde con otro medio.',
    'cc_rejected_call_for_authorize': 'El banco solicita autorización. Llamá al banco para habilitar la compra.',
    'cc_rejected_time_out': 'La operación tardó demasiado. Intentá de nuevo.',
    'cc_rejected_other_reason': 'El pago fue rechazado. Intentá con otra tarjeta o medio de pago.',
    'rejected_by_bank': 'El banco rechazó el pago. Probá con otra tarjeta o medio de pago.',
  };
  return map[d] || 'El pago fue rechazado. Por favor, intentá con otro medio de pago.';
}

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const resParam = searchParams.get('res');
  const tableParam = searchParams.get('table');
  const paymentStatus = searchParams.get('status');
  const guestIdParam = searchParams.get('guestId');
  const orderIdParam = searchParams.get('orderId');
  const clearParam = searchParams.get('clear');

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
  
  // Mantener el ref actualizado con el valor de activeGuestId
  useEffect(() => {
    activeGuestIdRef.current = activeGuestId;
  }, [activeGuestId]);
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
  const [pendingGuestSelection, setPendingGuestSelection] = useState(false);
  const [paymentReturnMessage, setPaymentReturnMessage] = useState<{ type: 'rejected'|'pending'; message: string; waitingGuestId?: string | null } | null>(null);

  const batchChannelRef = useRef<any>(null);
  const cartChannelRef = useRef<any>(null);
  const guestsChannelRef = useRef<any>(null);
  const activeGuestIdRef = useRef<string>('1');
  const prevPathRef = useRef<string | null>(null);

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

  // Suscripción real-time para actualizar el cart cuando otros comensales agregan items
  useEffect(() => {
    if (!activeOrderId || !supabase) return;

    if (cartChannelRef.current) {
      supabase.removeChannel(cartChannelRef.current);
    }

    const channel = supabase
      .channel(`cart-sync-${activeOrderId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${activeOrderId}` }, 
        async (payload) => {
          console.log('[App] Cambio detectado en order_items:', payload.eventType, payload.new);
          // Recargar todos los items desde la BD cuando hay cambios
          await fetchOrderItemsFromDB(activeOrderId);
        }
      )
      .subscribe();

    cartChannelRef.current = channel;
    return () => { 
      if (cartChannelRef.current) {
        supabase.removeChannel(cartChannelRef.current);
      }
    };
  }, [activeOrderId, fetchOrderItemsFromDB]);

  /**
   * FUNCIÓN DE ACCESO (REVERTIDA Y CORREGIDA)
   * 1. Busca restaurante por access_code
   * 2. Busca mesa por table_number (String)
   */
  const handleStartSession = useCallback(async (accessCode: string, tableNum: string, preferredGuestId?: string) => {
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

      // PERSISTENCIA (cookies para sobrevivir a recargas)
      setSession({ res: accessCode.toUpperCase(), table: tableNum.toString() });

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
      // Mientras el status de la orden esté en ABIERTO, la orden se tiene que seguir mostrando
      // Buscar órdenes que no estén PAGADO o CANCELADO (incluye ABIERTO y otros estados)
      let activeTableOrder;
      
      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, table_id')
        .eq('table_id', tableData.id)
        .order('created_at', { ascending: false });
      
      // Filtrar para excluir PAGADO y CANCELADO (incluye ABIERTO y otros estados activos)
      activeTableOrder = orders?.find(order => 
        order.status !== 'PAGADO' && order.status !== 'CANCELADO'
      );
      
      if (activeTableOrder) {
        console.log("[DineSplit] Orden activa encontrada:", activeTableOrder.id, "status:", activeTableOrder.status);
      } else {
        console.log("[DineSplit] No se encontró orden activa para la mesa:", tableData.id);
      }

      if (activeTableOrder) {
        // Verificar que la orden todavía esté activa (no PAGADO ni CANCELADO)
        const { data: orderCheck, error: orderCheckError } = await supabase
          .from('orders')
          .select('id, status')
          .eq('id', activeTableOrder.id)
          .maybeSingle();
        
        if (orderCheckError) {
          console.error("[DineSplit] Error al verificar orden:", orderCheckError);
          removeOrderId();
          setActiveOrderId(null);
          setCart([]);
          setBatches([]);
          navigateToView('GUEST_INFO');
        } else if (orderCheck && orderCheck.status !== 'PAGADO' && orderCheck.status !== 'CANCELADO') {
          console.log("[DineSplit] ✅ Orden activa validada. Cargando datos...");
          setOrderId(activeTableOrder.id);
          setActiveOrderId(activeTableOrder.id);
          // Cargar guests primero (preferredGuestId: URL > cookie para restaurar comensal tras refresh)
          await fetchOrderGuests(activeTableOrder.id, preferredGuestId);
          // Luego cargar items (que pueden referenciar guest_id)
          await fetchOrderItemsFromDB(activeTableOrder.id);
          navigateToView('MENU');
        } else {
          // La orden ya fue cerrada, limpiar y empezar de nuevo
          console.log("[DineSplit] ❌ La orden encontrada ya está cerrada (status:", orderCheck?.status || 'NO EXISTE', "). Limpiando sesión completamente.");
          clearSession();
          setActiveOrderId(null);
          setCart([]);
          setBatches([]);
          setGuests([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
          setActiveGuestId('1');
          navigateToView('GUEST_INFO');
        }
      } else {
        console.log("[DineSplit] No hay orden activa. Empezando nueva sesión.");
        removeOrderId();
        setActiveOrderId(null);
        setCart([]);
        setBatches([]);
        setGuests([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
        setActiveGuestId('1');
        navigateToView('GUEST_INFO');
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
      setOrderId(newOrder.id);
      setActiveGuestId(savedGuests[0].id);
      setActiveGuestIdCookie(savedGuests[0].id);
      
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
  // preferredGuestId: si se proporciona, no establecerá activeGuestId automáticamente al primer guest
  const fetchOrderGuests = useCallback(async (orderId: string, preferredGuestId?: string) => {
    if (!supabase) return;
    
    // Prioridad: preferredGuestId (caller) > URL > cookie (para restaurar comensal tras refresh)
    const guestIdFromUrl = searchParams.get('guestId');
    const guestIdToPreserve = preferredGuestId || guestIdFromUrl || getActiveGuestId() || undefined;
    
    console.log("[DineSplit] fetchOrderGuests - Buscando guests para order_id:", orderId, "preferredGuestId:", preferredGuestId, "guestIdFromUrl:", guestIdFromUrl, "guestIdToPreserve:", guestIdToPreserve);
    
    // Intentar primero sin order para ver si el problema es el order
    let { data: orderGuests, error } = await supabase
      .from('order_guests')
      .select('*')
      .eq('order_id', orderId);
    
    if (error) {
      console.error("[DineSplit] Error en query sin order:", error);
      // Intentar con order
      const result2 = await supabase
        .from('order_guests')
        .select('*')
        .eq('order_id', orderId)
        .order('position', { ascending: true });
      orderGuests = result2.data;
      error = result2.error;
    } else if (orderGuests && orderGuests.length > 0) {
      // Ordenar manualmente si la query funcionó
      orderGuests.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
    }

    if (error) {
      console.error("[DineSplit] ❌ Error al cargar guests:", error);
      console.error("[DineSplit] Error code:", error.code);
      console.error("[DineSplit] Error message:", error.message);
      console.error("[DineSplit] Error details:", JSON.stringify(error, null, 2));
      
      // Intentar una query más simple para verificar RLS
      const { data: testAccess, error: testError } = await supabase
        .from('order_guests')
        .select('id, order_id, name')
        .limit(10);
      
      if (testError) {
        console.error("[DineSplit] ❌ Error de RLS - no se puede acceder a order_guests:", testError);
      } else {
        console.log("[DineSplit] ✅ La tabla order_guests es accesible. Muestra de datos:", testAccess);
        // Buscar si hay algún guest con ese order_id en la muestra
        const matching = testAccess?.filter(g => g.order_id === orderId);
        console.log("[DineSplit] Guests con order_id", orderId, "en muestra:", matching?.length || 0);
      }
      
      return;
    }

    console.log("[DineSplit] fetchOrderGuests - Resultado de query:", orderGuests?.length || 0, "guests encontrados");
    
    // Si no hay resultados pero no hay error, verificar si hay un problema con el order_id
    if ((!orderGuests || orderGuests.length === 0) && !error) {
      console.warn("[DineSplit] ⚠️ Query exitosa pero sin resultados. Verificando order_id...");
      
      // Verificar que el order_id sea válido
      const { data: orderCheck } = await supabase
        .from('orders')
        .select('id, status, table_id')
        .eq('id', orderId)
        .single();
      
      if (orderCheck) {
        console.log("[DineSplit] ✅ La orden existe:", orderCheck);
        console.log("[DineSplit] Status de la orden:", orderCheck.status);
        console.log("[DineSplit] Verificando si hay guests con este order_id...");
        
        // Intentar una query más básica sin ningún filtro adicional
        const { data: allGuestsForOrder, error: simpleError } = await supabase
          .from('order_guests')
          .select('id, order_id, name, position')
          .eq('order_id', orderId);
        
        console.log("[DineSplit] Query simple (sin select *):", allGuestsForOrder?.length || 0, "guests");
        if (simpleError) {
          console.error("[DineSplit] Error en query simple:", simpleError);
        } else if (allGuestsForOrder && allGuestsForOrder.length > 0) {
          console.log("[DineSplit] ✅ Query simple funcionó! Usando estos resultados...");
          orderGuests = allGuestsForOrder;
        }
      } else {
        console.error("[DineSplit] ❌ La orden no existe o no se puede acceder:", orderId);
      }
    }
    
    if (orderGuests && orderGuests.length > 0) {
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
      // Establecer el activeGuestId al primer guest cargado solo si no hay un guestIdToPreserve
      // Si hay un guestIdToPreserve, establecerlo explícitamente
      // Si no hay guestIdToPreserve, verificar si el activeGuestId actual existe en la lista
      if (guestsFromDB.length > 0 && !guestIdToPreserve) {
        // Verificar si el activeGuestId actual existe en la lista de guests cargados
        const currentActiveGuestId = activeGuestIdRef.current;
        const currentGuestExists = guestsFromDB.some(g => g.id === currentActiveGuestId);
        if (currentGuestExists) {
          // Preservar el activeGuestId actual si existe en la lista
          console.log("[DineSplit] Preservando activeGuestId actual:", currentActiveGuestId);
          // No necesitamos llamar setActiveGuestId porque ya está establecido
        } else {
          setActiveGuestId(guestsFromDB[0].id);
          setActiveGuestIdCookie(guestsFromDB[0].id);
          console.log("[DineSplit] ActiveGuestId establecido a (nuevo):", guestsFromDB[0].id);
        }
      } else if (guestIdToPreserve) {
        const guestExists = guestsFromDB.some(g => g.id === guestIdToPreserve);
        if (guestExists) {
          setActiveGuestId(guestIdToPreserve);
          setActiveGuestIdCookie(guestIdToPreserve);
          console.log("[DineSplit] ActiveGuestId establecido a guestIdToPreserve:", guestIdToPreserve);
        } else {
          console.warn("[DineSplit] guestIdToPreserve no existe en guests cargados, usando primer guest:", guestIdToPreserve);
          setActiveGuestId(guestsFromDB[0].id);
          setActiveGuestIdCookie(guestsFromDB[0].id);
        }
      }
    } else {
      console.warn("[DineSplit] ⚠️ No se encontraron guests para order_id:", orderId);
      console.warn("[DineSplit] Intentando fallback: buscar guests por guest_ids de order_items...");
      
      // Si no hay guests pero hay items, intentar obtener los guest_ids únicos de los items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('guest_id')
        .eq('order_id', orderId);
      
      if (itemsError) {
        console.error("[DineSplit] Error al buscar items para fallback:", itemsError);
      }
      
      console.log("[DineSplit] Items encontrados para fallback:", itemsData?.length || 0);
      
      if (itemsData && itemsData.length > 0) {
        const uniqueGuestIds = [...new Set(itemsData.map(i => i.guest_id).filter(Boolean))];
        console.log("[DineSplit] Guest IDs únicos encontrados en order_items:", uniqueGuestIds.length, uniqueGuestIds);
        
        if (uniqueGuestIds.length > 0) {
          // Intentar obtener los guests directamente por sus IDs
          const { data: guestsById, error: guestsByIdError } = await supabase
            .from('order_guests')
            .select('*')
            .in('id', uniqueGuestIds)
            .order('position', { ascending: true });
          
          if (guestsByIdError) {
            console.error("[DineSplit] Error al buscar guests por IDs:", guestsByIdError);
          }
          
          console.log("[DineSplit] Guests encontrados por IDs (fallback):", guestsById?.length || 0);
          
          if (guestsById && guestsById.length > 0) {
            const guestsFromDB: Guest[] = guestsById.map(og => ({
              id: og.id,
              name: og.name,
              isHost: og.is_host || false,
              individualAmount: og.individual_amount || null,
              paid: og.paid || false,
              payment_id: og.payment_id || null,
              payment_method: og.payment_method || null
            }));
            console.log("[DineSplit] ✅ Guests cargados mediante fallback:", guestsFromDB.length, "guests");
            console.log("[DineSplit] Guest IDs:", guestsFromDB.map(g => g.id));
            setGuests(guestsFromDB);
            if (guestsFromDB.length > 0 && !guestIdToPreserve) {
              const currentActiveGuestId = activeGuestIdRef.current;
              const currentGuestExists = guestsFromDB.some(g => g.id === currentActiveGuestId);
              if (currentGuestExists) {
                console.log("[DineSplit] Preservando activeGuestId actual (fallback):", currentActiveGuestId);
              } else {
                setActiveGuestId(guestsFromDB[0].id);
                setActiveGuestIdCookie(guestsFromDB[0].id);
                console.log("[DineSplit] ActiveGuestId establecido a (fallback):", guestsFromDB[0].id);
              }
            } else if (guestIdToPreserve) {
              const guestExists = guestsFromDB.some(g => g.id === guestIdToPreserve);
              if (guestExists) {
                setActiveGuestId(guestIdToPreserve);
                setActiveGuestIdCookie(guestIdToPreserve);
                console.log("[DineSplit] ActiveGuestId establecido a guestIdToPreserve (fallback):", guestIdToPreserve);
              } else {
                console.warn("[DineSplit] guestIdToPreserve no existe en guests (fallback), usando primer guest:", guestIdToPreserve);
                setActiveGuestId(guestsFromDB[0].id);
                setActiveGuestIdCookie(guestsFromDB[0].id);
              }
            }
          } else {
            console.error("[DineSplit] ❌ Fallback falló: no se encontraron guests con esos IDs");
            console.error("[DineSplit] Guest IDs buscados:", uniqueGuestIds);
            
            // Verificar RLS específicamente para estos IDs
            console.error("[DineSplit] Verificando RLS: intentando query directa a order_guests...");
            const { data: directQuery, error: directError } = await supabase
              .from('order_guests')
              .select('id, order_id, name, is_host, position')
              .eq('order_id', orderId);
            
            if (directError) {
              console.error("[DineSplit] ❌ Error de RLS en query directa:", directError);
            } else {
              console.log("[DineSplit] Query directa sin .in() encontró:", directQuery?.length || 0, "guests");
              if (directQuery && directQuery.length > 0) {
                console.log("[DineSplit] IDs encontrados:", directQuery.map(g => g.id));
                // Usar estos resultados
                const guestsFromDB: Guest[] = directQuery.map(og => ({
                  id: og.id,
                  name: og.name,
                  isHost: og.is_host || false,
                  individualAmount: null,
                  paid: false,
                  payment_id: null,
                  payment_method: null
                }));
                setGuests(guestsFromDB);
                if (guestsFromDB.length > 0 && !guestIdToPreserve) {
                  const currentActiveGuestId = activeGuestIdRef.current;
                  const currentGuestExists = guestsFromDB.some(g => g.id === currentActiveGuestId);
                  if (currentGuestExists) {
                    console.log("[DineSplit] Preservando activeGuestId actual (directQuery):", currentActiveGuestId);
                  } else {
                    setActiveGuestId(guestsFromDB[0].id);
                    setActiveGuestIdCookie(guestsFromDB[0].id);
                    console.log("[DineSplit] ActiveGuestId establecido a (directQuery):", guestsFromDB[0].id);
                  }
                } else if (guestIdToPreserve) {
                  const guestExists = guestsFromDB.some(g => g.id === guestIdToPreserve);
                  if (guestExists) {
                    setActiveGuestId(guestIdToPreserve);
                    setActiveGuestIdCookie(guestIdToPreserve);
                    console.log("[DineSplit] ActiveGuestId establecido a guestIdToPreserve (directQuery):", guestIdToPreserve);
                  } else {
                    console.warn("[DineSplit] guestIdToPreserve no existe en guests (directQuery), usando primer guest:", guestIdToPreserve);
                    setActiveGuestId(guestsFromDB[0].id);
                    setActiveGuestIdCookie(guestsFromDB[0].id);
                  }
                }
              }
            }
          }
        } else {
          console.error("[DineSplit] ❌ No hay guest_ids válidos en los items");
        }
      } else {
        console.error("[DineSplit] ❌ No hay items para hacer fallback");
      }
    }
  }, [supabase, searchParams, setActiveGuestId, setGuests]);

  // Suscripción real-time para actualizar los guests cuando otros comensales se unen o cambian
  useEffect(() => {
    if (!activeOrderId || !supabase) return;

    if (guestsChannelRef.current) {
      supabase.removeChannel(guestsChannelRef.current);
    }

    const channel = supabase
      .channel(`guests-sync-${activeOrderId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'order_guests', filter: `order_id=eq.${activeOrderId}` }, 
        async (payload) => {
          console.log('[App] Cambio detectado en order_guests:', payload.eventType, payload.new);
          // Recargar todos los guests desde la BD cuando hay cambios
          // No pasar preferredGuestId aquí para que no sobrescriba la selección actual
          await fetchOrderGuests(activeOrderId);
          // Si el host definió la división (individual_amount), redirigir a no-host a su pantalla individual
          if (payload?.new?.individual_amount != null) {
            const path = window.location.pathname;
            const preSplitPaths = path === '/order-summary' || path === '/progress' || path.startsWith('/menu');
            if (!preSplitPaths) return;
            const currentId = getActiveGuestId();
            if (!currentId || !activeOrderId) return;
            const { data: rows } = await supabase.from('order_guests').select('id, individual_amount, is_host').eq('order_id', activeOrderId);
            const my = rows?.find((r: any) => r.id === currentId);
            if (!my || my.individual_amount == null || my.is_host === true) return;
            navigate(`/individual-share?orderId=${activeOrderId}&guestId=${currentId}`);
          }
        }
      )
      .subscribe();

    guestsChannelRef.current = channel;
    return () => { 
      if (guestsChannelRef.current) {
        supabase.removeChannel(guestsChannelRef.current);
      }
    };
  }, [activeOrderId, fetchOrderGuests, navigate]);

  // Si la división ya está hecha y el comensal (no host) está en una pantalla previa, redirigir a su pantalla individual
  useEffect(() => {
    const path = location.pathname;
    if (path !== '/order-summary' && path !== '/progress' && !path.startsWith('/menu')) return;
    const cid = getActiveGuestId() || activeGuestId;
    if (!cid || !activeOrderId) return;
    const g = guests.find(x => x.id === cid);
    if (!g || g.individualAmount == null || g.isHost) return;
    navigate(`/individual-share?orderId=${activeOrderId}&guestId=${cid}`);
  }, [location.pathname, guests, activeOrderId, activeGuestId, navigate]);

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
const routesRequiringSession = ['/menu', '/order-summary', '/progress', '/split-bill', '/checkout', '/individual-share', '/transfer-payment', '/cash-payment', '/confirmation', '/guest-selection'];
    
    const initApp = async () => {
      // ?clear=1: limpia cookies de sesión/mesa y muestra la pantalla de scan
      if (clearParam) {
        clearSession();
        setRestaurant(null);
        setCurrentTable(null);
        setCurrentWaiter(null);
        setMenuItems([]);
        setCategories([]);
        setActiveOrderId(null);
        setCart([]);
        setBatches([]);
        setGuests([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
        setActiveGuestId('1');
        setError(null);
        setLoading(false);
        navigate('/scan');
        return;
      }

      // Datos de retorno desde Mercado Pago (puede que la URL pierda orderId/guestId; usamos sessionStorage como respaldo)
      let mpReturn: { orderId?: string; guestId?: string } = {};
      try {
        const s = sessionStorage.getItem('splitme_mp_return');
        if (s) mpReturn = JSON.parse(s);
      } catch (e) {}

      const isPaymentReturn = paymentStatus === 'success' || paymentStatus === 'approved';
      const isAnyMpReturn = ['success','approved','rejected','failure','pending'].includes(paymentStatus || '');
      const orderIdForLoad = orderIdParam || (isAnyMpReturn && mpReturn?.orderId) || undefined;

      // Si hay orderId en la URL o en sessionStorage (return de MP), cargar datos
      if (orderIdForLoad) {
        setLoading(true);
        try {
          // Cargar la orden y obtener restaurant_id
          const { data: orderData } = await supabase
            .from('orders')
            .select('*, tables!inner(restaurant_id)')
            .eq('id', orderIdForLoad)
            .maybeSingle();

          if (!orderData) {
            setError("No se pudo cargar la orden. El link puede estar expirado.");
            setLoading(false);
            return;
          }

          const restaurantId = orderData.tables.restaurant_id;

          // Cargar restaurante, categories, menuItems, guests, items y batches en paralelo
          const [restaurantRes, categoriesRes, menuItemsRes, guestsRes] = await Promise.all([
            supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle(),
            supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('order_guests').select('*').eq('order_id', orderIdForLoad).order('position', { ascending: true })
          ]);

          if (restaurantRes.error || !restaurantRes.data) {
            throw new Error("No se pudo cargar el restaurante.");
          }

          setRestaurant(restaurantRes.data);
          setCategories(categoriesRes.data || []);
          setMenuItems(menuItemsRes.data || []);
          setActiveOrderId(orderIdForLoad);
          setOrderId(orderIdForLoad);

          // Cargar guests con sus montos individuales y estado de pago
          const guestIdToSet = guestIdParam || (isAnyMpReturn && mpReturn?.guestId) || undefined;
          if (guestsRes.data) {
            const guestsFromDB: Guest[] = guestsRes.data.map(og => ({
              id: og.id,
              name: og.name,
              isHost: og.is_host || false,
              individualAmount: og.individual_amount || null,
              paid: og.paid || false,
              payment_id: og.payment_id || null,
              payment_method: og.payment_method || null
            }));
            console.log("[DineSplit] Guests cargados desde link QR:", guestsFromDB.map(g => ({ id: g.id, name: g.name, individualAmount: g.individualAmount, paid: g.paid, payment_id: g.payment_id })));
            setGuests(guestsFromDB);
            if (guestIdToSet && guestsFromDB.some(g => g.id === guestIdToSet)) {
              setActiveGuestId(guestIdToSet);
              setActiveGuestIdCookie(guestIdToSet);
            }
          }

          await fetchOrderItemsFromDB(orderIdForLoad);
          
          const currentPath = location.pathname;
          const routesRequiringSession = ['/menu', '/order-summary', '/progress', '/split-bill', '/checkout', '/individual-share', '/transfer-payment', '/cash-payment', '/confirmation', '/guest-selection'];
          
          if (!routesRequiringSession.includes(currentPath)) {
            if (guestIdParam) {
              navigate('/individual-share');
            } else {
              navigate('/guest-selection');
            }
          }
          setLoading(false);
        } catch (error: any) {
          console.error("[DineSplit] Error al cargar orden desde link:", error);
          setError("No se pudo cargar la orden. El link puede estar expirado.");
          setLoading(false);
        }
      } else if (resParam && tableParam) {
        await handleStartSession(resParam, tableParam, guestIdParam || getActiveGuestId() || undefined);
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        // Sin parámetros en URL: intentar restaurar sesión desde cookies (o sessionStorage si volvemos de MP)
        const orderId = getOrderId() || (isPaymentReturn ? (mpReturn?.orderId || null) : null);
        const session = getSession();

        if (orderId) {
          // Restaurar desde orden guardada en cookie (p. ej. tras recargar en /menu)
          setLoading(true);
          try {
            const { data: orderData } = await supabase
              .from('orders')
              .select('*, tables!inner(restaurant_id)')
              .eq('id', orderId)
              .maybeSingle();

            if (!orderData) {
              clearSession();
              setRestaurant(null);
              setCurrentTable(null);
              setCurrentWaiter(null);
              setMenuItems([]);
              setCategories([]);
              setActiveOrderId(null);
              setCart([]);
              setBatches([]);
              setGuests([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
              setActiveGuestId('1');
              navigate('/scan');
              setLoading(false);
              return;
            }

            const { data: orderCheck } = await supabase
              .from('orders')
              .select('id, status')
              .eq('id', orderId)
              .maybeSingle();

            if (orderCheck && (orderCheck.status === 'PAGADO' || orderCheck.status === 'CANCELADO')) {
              clearSession();
              setRestaurant(null);
              setCurrentTable(null);
              setCurrentWaiter(null);
              setMenuItems([]);
              setCategories([]);
              setActiveOrderId(null);
              setCart([]);
              setBatches([]);
              setGuests([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
              setActiveGuestId('1');
              navigate('/scan');
              setLoading(false);
              return;
            }

            const restaurantId = orderData.tables.restaurant_id;
            const [restaurantRes, categoriesRes, menuItemsRes, guestsRes, tableRes] = await Promise.all([
              supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle(),
              supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
              supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
              supabase.from('order_guests').select('*').eq('order_id', orderId).order('position', { ascending: true }),
              supabase.from('tables').select('*').eq('id', orderData.table_id).maybeSingle()
            ]);

            setCurrentTable(tableRes?.data || null);

            if (restaurantRes.error || !restaurantRes.data) {
              clearSession();
              setError("No se pudo cargar el restaurante.");
              navigate('/scan');
              setLoading(false);
              return;
            }

            setRestaurant(restaurantRes.data);
            setCategories(categoriesRes.data || []);
            setMenuItems(menuItemsRes.data || []);
            setActiveOrderId(orderId);
            if (guestsRes.data) {
              const guestsFromDB: Guest[] = guestsRes.data.map(og => ({
                id: og.id,
                name: og.name,
                isHost: og.is_host || false,
                individualAmount: og.individual_amount || null,
                paid: og.paid || false,
                payment_id: og.payment_id || null,
                payment_method: og.payment_method || null
              }));
              setGuests(guestsFromDB);
              const preferred = (isPaymentReturn && mpReturn?.guestId) || getActiveGuestId();
              const toSelect = (preferred && guestsFromDB.some(g => g.id === preferred)) ? preferred : null;
              if (toSelect) {
                setActiveGuestId(toSelect);
                setActiveGuestIdCookie(toSelect);
              } else {
                setPendingGuestSelection(true);
              }
            }
            await fetchOrderItemsFromDB(orderId);

            if (location.pathname === '/' || location.pathname === '/scan') {
              navigate('/menu');
            }
            setLoading(false);
          } catch (e: any) {
            console.error("[DineSplit] Error al restaurar sesión desde cookie:", e);
            clearSession();
            setError("No se pudo restaurar la sesión.");
            navigate('/scan');
            setLoading(false);
          }
        } else if (session?.res && session?.table) {
          console.log("[DineSplit] Restaurando sesión desde cookie:", session.res, session.table);
          await handleStartSession(session.res, session.table, getActiveGuestId() || undefined);
          setLoading(false);
        } else {
          // Sin cookies válidas: ir a escanear
          clearSession();
          setRestaurant(null);
          setCurrentTable(null);
          setCurrentWaiter(null);
          setMenuItems([]);
          setCategories([]);
          setActiveOrderId(null);
          setCart([]);
          setBatches([]);
          setGuests([{ id: '1', name: 'Invitado 1 (Tú)', isHost: true }]);
          setActiveGuestId('1');
          navigate('/scan');
          setLoading(false);
        }
      }
    };
    
    initApp();
  }, [resParam, tableParam, orderIdParam, guestIdParam, clearParam, paymentStatus, handleStartSession, fetchOrderItemsFromDB, navigate]);

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

      // Paso 2: Actualizar order_guests con paid=true y payment_method
      // Intentar primero con payment_id, si falla intentar sin payment_id (por si la columna no existe)
      let guestUpdatePayload: any = {
        paid: true,
        payment_method: normalizedPaymentMethod
      };
      
      // Intentar agregar payment_id solo si tenemos un ID válido
      if (newPayment && newPayment.id) {
        guestUpdatePayload.payment_id = newPayment.id;
      }
      
      const { error: guestUpdateError } = await supabase
        .from('order_guests')
        .update(guestUpdatePayload)
        .eq('id', guestId);

      // Si el error es porque payment_id no existe, intentar sin payment_id
      if (guestUpdateError && guestUpdateError.code === 'PGRST204' && guestUpdateError.message?.includes('payment_id')) {
        console.warn("[DineSplit] La columna payment_id no existe, actualizando sin payment_id");
        const { error: retryError } = await supabase
          .from('order_guests')
          .update({
            paid: true,
            payment_method: normalizedPaymentMethod
          })
          .eq('id', guestId);
        
        if (retryError) {
          console.error("[DineSplit] Error al actualizar guest (sin payment_id):", retryError);
          throw retryError;
        }
        console.log("[DineSplit] ✅ Guest actualizado con paid=true y payment_method:", normalizedPaymentMethod, "(sin payment_id)");
      } else if (guestUpdateError) {
        console.error("[DineSplit] Error al actualizar guest:", guestUpdateError);
        throw guestUpdateError;
      } else {
        console.log("[DineSplit] ✅ Guest actualizado con paid=true, payment_id:", newPayment.id, "y payment_method:", normalizedPaymentMethod);
      }
      console.log("[DineSplit] ========================================");

      // Recargar guests para actualizar el estado local
      await fetchOrderGuests(activeOrderId);

      return true;
    } catch (error: any) {
      console.error("[DineSplit] ❌ Error al procesar pago exitoso:", error);
      return false;
    }
  }, [supabase, activeOrderId, fetchOrderGuests]);

  // ——— approved/success → pago exitoso, mensaje y avanzar a propina
  // ——— rejected/failure → pago no exitoso, mensaje por status_detail, permanece en pantalla de pago
  // ——— pending → pago pendiente, mensaje y esperar confirmación (Realtime) para approved
  useEffect(() => {
    const ps = paymentStatus || '';
    const isSuccess = ps === 'success' || ps === 'approved';
    const isRejected = ps === 'rejected' || ps === 'failure';
    const isPending = ps === 'pending';
    if (!isSuccess && !isRejected && !isPending) return;
    if (location.pathname === '/confirmation') return;

    const urlParams = new URLSearchParams(window.location.search);
    let guestIdFromUrl = urlParams.get('guestId');
    if (!guestIdFromUrl) {
      try {
        const s = sessionStorage.getItem('splitme_mp_return');
        if (s) guestIdFromUrl = (JSON.parse(s) as { guestId?: string }).guestId || null;
      } catch (e) {}
    }

    const clearMpReturn = () => {
      try { sessionStorage.removeItem('splitme_mp_return'); } catch (e) {}
    };

    if (isSuccess) {
      setPaymentReturnMessage(null);
      if (!activeOrderId) return;
      const paymentId = urlParams.get('payment_id');
      const payingGuest = guests.find(g => g.id === guestIdFromUrl);
      const paymentAmount = payingGuest?.individualAmount || 0;
      if (guestIdFromUrl && paymentAmount > 0) {
        handlePaymentSuccess(guestIdFromUrl, paymentAmount, 'mercadopago', paymentId || undefined).then(success => {
          clearMpReturn();
          if (success) {
            clearSession();
            navigateToView('CONFIRMATION');
          } else {
            alert("Hubo un error al registrar el pago. Por favor, contacta al restaurante.");
          }
        });
      } else {
        clearMpReturn();
        clearSession();
        navigateToView('CONFIRMATION');
      }
      return;
    }

    if (isRejected) {
      const statusDetail = urlParams.get('status_detail');
      const message = getMessageFromStatusDetail(statusDetail);
      setPaymentReturnMessage({ type: 'rejected', message, waitingGuestId: undefined });
      clearMpReturn();
      return;
    }

    if (isPending) {
      setPaymentReturnMessage({
        type: 'pending',
        message: 'Pago pendiente. Estamos esperando la confirmación de Mercado Pago.',
        waitingGuestId: guestIdFromUrl || null
      });
      clearMpReturn();
    }
  }, [paymentStatus, activeOrderId, guests, handlePaymentSuccess, location.pathname]);

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

  // Recargar guests cuando se ENTRÁ al MENU (no al cambiar categoría/subcategoría), SPLIT_BILL o INDIVIDUAL_SHARE
  useEffect(() => {
    const path = location.pathname;
    const prev = prevPathRef.current;
    prevPathRef.current = path;

    const wasOnMenu = prev === '/menu' || (prev != null && prev.startsWith('/menu/'));
    const isOnMenu = path === '/menu' || path.startsWith('/menu/');

    if (isOnMenu && activeOrderId && supabase) {
      if (!wasOnMenu && !pendingGuestSelection) {
        fetchOrderGuests(activeOrderId, guestIdParam || getActiveGuestId() || undefined);
      } else if (guestIdParam) {
        setActiveGuestId(guestIdParam);
        setActiveGuestIdCookie(guestIdParam);
      }
    } else if ((path === '/split-bill' || path === '/individual-share') && activeOrderId && supabase) {
      fetchOrderGuests(activeOrderId);
    }
  }, [location.pathname, activeOrderId, fetchOrderGuests, guestIdParam, pendingGuestSelection]);

  // Reconstruir splitData desde guests cuando se navega a individual-share y splitData está vacío
  useEffect(() => {
    if (location.pathname === '/individual-share' && (!splitData || splitData.length === 0) && guests.length > 0) {
      // Reconstruir splitData desde los guests con individualAmount
      const reconstructedSplitData = guests.map(guest => ({
        id: guest.id,
        name: guest.name,
        subtotal: guest.individualAmount || 0,
        total: guest.individualAmount || 0,
        items: cart
          .filter(item => item.guestId === guest.id)
          .map(item => {
            const menuItem = menuItems.find(m => m.id === item.itemId);
            return {
              name: menuItem?.name || 'Producto',
              quantity: item.quantity,
              price: menuItem?.price || 0
            };
          })
      }));
      
      if (reconstructedSplitData.length > 0 && reconstructedSplitData.some(s => s.total > 0)) {
        console.log('[App] Reconstruyendo splitData desde guests:', reconstructedSplitData);
        setSplitData(reconstructedSplitData);
      }
    }
  }, [location.pathname, splitData, guests, cart, menuItems]);

  const handlePayIndividual = async (paymentData: { amount: number, method: string }) => {
    if (!activeOrderId || !restaurant) return;
    
    // Obtener guestId de la URL si existe
    const urlParams = new URLSearchParams(window.location.search);
    const guestId = urlParams.get('guestId') || activeGuestId;
    
    if (paymentData.method === 'mercadopago') {
      try {
        // Validar que el monto sea válido
        const amount = Number(paymentData.amount);
        if (isNaN(amount) || amount <= 0) {
          throw new Error("El monto a pagar debe ser mayor a cero.");
        }

        const { data: config, error: configError } = await supabase
          .from('payment_configs')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('provider', 'mercadopago')
          .maybeSingle();
        
        if (configError) {
          console.error('[DineSplit] Error al obtener configuración de Mercado Pago:', configError);
          throw new Error(`Error al obtener configuración: ${configError.message}`);
        }
        
        if (!config) {
          console.error('[DineSplit] No se encontró configuración de Mercado Pago para restaurant_id:', restaurant.id);
          throw new Error("Mercado Pago no está configurado para este restaurante.");
        }
        
        console.log('[DineSplit] Configuración de Mercado Pago encontrada:', {
          restaurant_id: restaurant.id,
          provider: config.provider,
          has_token_cbu: !!config.token_cbu,
          has_user_account: !!config.user_account,
          has_key_alias: !!config.key_alias
        });
        
        // Para Mercado Pago, el access token está en token_cbu (renombrado desde access_token)
        const accessToken = config.token_cbu;
        if (!accessToken) {
          throw new Error("El token de acceso de Mercado Pago (token_cbu) no está configurado.");
        }
        if (!accessToken.trim()) {
          throw new Error("El token de acceso de Mercado Pago está vacío.");
        }
        
        // Detectar si el token es de TEST o PRODUCCIÓN
        // Los tokens de TEST suelen comenzar con "TEST-" o tener un formato específico
        // Los tokens de PRODUCCIÓN suelen ser más largos y no tienen el prefijo "TEST-"
        const isTestToken = accessToken.startsWith('TEST-') || accessToken.includes('test') || accessToken.length < 50;
        console.log('[DineSplit] Tipo de token detectado:', {
          isTestToken,
          tokenLength: accessToken.length,
          tokenPrefix: accessToken.substring(0, 10) + '...',
          note: isTestToken 
            ? '⚠️ Token de TEST detectado. En sandbox, Mercado Pago puede requerir credenciales de PRODUCCIÓN con usuarios de prueba.'
            : '✅ Token de PRODUCCIÓN detectado.'
        });

        const cleanUrl = window.location.origin + window.location.pathname;
        // Incluir guestId en la URL de retorno para poder identificar quién pagó
        const successUrl = `${cleanUrl}?status=success&orderId=${activeOrderId}&guestId=${guestId}`;
        const failureUrl = `${cleanUrl}?status=failure&orderId=${activeOrderId}&guestId=${guestId}`;
        const pendingUrl = `${cleanUrl}?status=pending&orderId=${activeOrderId}&guestId=${guestId}`;
        
        // Validar que las URLs estén bien formadas
        if (!successUrl || !successUrl.startsWith('http') || successUrl.trim().length === 0) {
          console.error('[DineSplit] URL de éxito inválida:', successUrl);
          throw new Error("La URL de éxito no está bien formada.");
        }
        
        // Construir back_urls primero y validarlo - asegurarse de que sean strings válidos
        const backUrls: { success: string; failure: string; pending: string } = {
          success: String(successUrl).trim(),
          failure: String(failureUrl).trim(),
          pending: String(pendingUrl).trim()
        };
        
        // Validar que success esté definido y no vacío - esto es crítico para auto_return
        if (!backUrls.success || backUrls.success.length === 0 || !backUrls.success.startsWith('http')) {
          console.error('[DineSplit] back_urls.success está vacío, undefined o inválido:', backUrls.success);
          throw new Error("La URL de éxito (back_urls.success) es requerida y debe ser una URL válida para usar auto_return.");
        }
        
        // Mercado Pago NO acepta localhost cuando se usa auto_return
        // Solo usar auto_return si la URL es pública (no localhost)
        const isLocalhost = cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1') || cleanUrl.includes('0.0.0.0');
        
        const tableNum = currentTable?.table_number || 'N/A';
        
        // Asegurar que el unit_price sea un número válido y esté en el formato correcto
        // Mercado Pago espera el precio como número, no string
        const unitPrice = parseFloat(amount.toFixed(2));
        if (isNaN(unitPrice) || unitPrice <= 0) {
          throw new Error(`El monto ${amount} no es válido. Debe ser un número mayor a cero.`);
        }
        
        // Construir el payload base según la documentación de Mercado Pago
        const preferencesPayload: any = {
          items: [{ 
            title: `Pago Mesa ${tableNum}`.substring(0, 127), // Título limitado a 127 caracteres
            description: `Pago individual de comensal para mesa ${tableNum}`.substring(0, 255), // Descripción opcional
            quantity: 1, 
            unit_price: unitPrice, // Número, no string
            currency_id: 'ARS' 
          }],
          external_reference: `${activeOrderId}|${guestId}`.substring(0, 256), // Máximo 256 caracteres
          back_urls: {
            success: backUrls.success,
            failure: backUrls.failure,
            pending: backUrls.pending
          },
          // Configuraciones adicionales para sandbox
          binary_mode: false, // Permitir estados pendientes
          statement_descriptor: `MESA ${tableNum}`.substring(0, 22) // Máximo 22 caracteres para el descriptor
        };
        
        // Solo agregar auto_return si NO es localhost (Mercado Pago requiere URLs públicas)
        if (!isLocalhost) {
          preferencesPayload.auto_return = 'approved';
          console.log('[DineSplit] Usando auto_return porque la URL es pública:', cleanUrl);
        } else {
          console.log('[DineSplit] Omitiendo auto_return porque la URL es localhost (Mercado Pago no lo permite):', cleanUrl);
        }
        
        // Validar que el título no esté vacío
        if (!preferencesPayload.items[0].title || preferencesPayload.items[0].title.trim().length === 0) {
          preferencesPayload.items[0].title = 'Pago de Mesa';
        }
        
        // Log del payload antes de enviar
        console.log('[DineSplit] Payload completo antes de enviar:', JSON.stringify(preferencesPayload, null, 2));
        
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${accessToken}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify(preferencesPayload)
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('[DineSplit] Error de Mercado Pago:', errorData);
          console.error('[DineSplit] Detalles del error:', {
            status: response.status,
            statusText: response.statusText,
            errorCode: errorData.error,
            errorMessage: errorData.message,
            isTestToken,
            accessTokenPrefix: accessToken.substring(0, 10)
          });
          
          // Detectar el error específico "Una de las partes con la que intentás hacer el pago es de prueba"
          const errorMessage = errorData.message || '';
          if (errorMessage.includes('prueba') || errorMessage.includes('test') || errorData.error === 'bad_request') {
            let helpfulMessage = 'Error de configuración de Mercado Pago:\n\n';
            helpfulMessage += 'El error "Una de las partes con la que intentás hacer el pago es de prueba" generalmente ocurre cuando:\n\n';
            helpfulMessage += '1. Estás usando un token de TEST en el sandbox\n';
            helpfulMessage += '2. O hay una inconsistencia entre el tipo de token y el entorno\n\n';
            helpfulMessage += `Tipo de token detectado: ${isTestToken ? 'TEST' : 'PRODUCCIÓN'}\n\n`;
            helpfulMessage += 'Solución:\n';
            helpfulMessage += '- Si estás en sandbox, verifica que el access token en payment_configs sea el correcto\n';
            helpfulMessage += '- Asegúrate de usar usuarios de prueba pero con credenciales apropiadas\n';
            helpfulMessage += '- Revisa la documentación de Mercado Pago para tu entorno específico';
            
            throw new Error(helpfulMessage);
          }
          
          throw new Error(`Error de Mercado Pago: ${errorData.message || response.statusText || 'Error desconocido'}`);
        }

        const pref = await response.json();
        console.log('[DineSplit] Preferencia creada exitosamente:', pref);
        console.log('[DineSplit] init_point:', pref.init_point);
        console.log('[DineSplit] Preference ID:', pref.id);
        console.log('[DineSplit] Sandbox URL:', pref.sandbox_init_point || 'No disponible');
        
        // Usar sandbox_init_point si está disponible y estamos en desarrollo, sino usar init_point
        const paymentUrl = pref.sandbox_init_point || pref.init_point;
        
        if (paymentUrl) {
          try {
            sessionStorage.setItem('splitme_mp_return', JSON.stringify({ orderId: activeOrderId, guestId }));
          } catch (e) { /* sessionStorage puede no estar disponible */ }
          console.log('[DineSplit] Redirigiendo a:', paymentUrl);
          window.location.href = paymentUrl;
        } else {
          console.error('[DineSplit] No se recibió ningún link de pago. Respuesta completa:', pref);
          throw new Error("No se recibió el link de pago de Mercado Pago. Verifica la configuración de tu cuenta.");
        }
      } catch (err: any) { 
        console.error('[DineSplit] Error al procesar pago con Mercado Pago:', err);
        alert(err.message || "Error al conectar con Mercado Pago. Por favor, intenta nuevamente."); 
      }
    } else { 
      // Para métodos de pago no-Mercado Pago (transferencia, efectivo), procesar directamente
      if (guestId) {
        await handlePaymentSuccess(guestId, paymentData.amount, paymentData.method);
      }
      clearSession();
      navigateToView('CONFIRMATION'); 
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

        // NO crear batch aquí. El batch se creará automáticamente cuando un comensal agregue el próximo plato.
        console.log("[DineSplit] Pedido enviado. El próximo batch se creará cuando se agregue un nuevo plato.");
        setActiveBatchId(null); // Limpiar batch activo, se creará uno nuevo al agregar el próximo plato

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
        navigateToView('PROGRESS');
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

      // NO crear batch aquí. El batch se creará automáticamente cuando un comensal agregue el próximo plato.
      console.log("[DineSplit] Pedido enviado. El próximo batch se creará cuando se agregue un nuevo plato.");
      setActiveBatchId(null); // Limpiar batch activo, se creará uno nuevo al agregar el próximo plato

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

  // Sincronizar currentView con la ruta actual
  useEffect(() => {
    const path = location.pathname;
    const viewMap: Record<string, AppView> = {
      '/': 'SCAN',
      '/scan': 'SCAN',
      '/guest-info': 'GUEST_INFO',
      '/menu': 'MENU',
      '/order-summary': 'ORDER_SUMMARY',
      '/progress': 'PROGRESS',
      '/split-bill': 'SPLIT_BILL',
      '/guest-selection': 'GUEST_SELECTION',
      '/checkout': 'CHECKOUT',
      '/individual-share': 'INDIVIDUAL_SHARE',
      '/transfer-payment': 'TRANSFER_PAYMENT',
      '/cash-payment': 'CASH_PAYMENT',
      '/confirmation': 'CONFIRMATION'
    };
    
    const view = viewMap[path] || (path.startsWith('/menu') ? 'MENU' : 'SCAN');
    if (view !== currentView) {
      setCurrentView(view);
    }
  }, [location.pathname, currentView]);
  
  const navigateToView = useCallback((view: AppView) => {
    const routeMap: Record<AppView, string> = {
      'INIT': '/scan',
      'SCAN': '/scan',
      'GUEST_INFO': '/guest-info',
      'MENU': '/menu',
      'ORDER_SUMMARY': '/order-summary',
      'PROGRESS': '/progress',
      'SPLIT_BILL': '/split-bill',
      'GUEST_SELECTION': '/guest-selection',
      'CHECKOUT': '/checkout',
      'INDIVIDUAL_SHARE': '/individual-share',
      'TRANSFER_PAYMENT': '/transfer-payment',
      'CASH_PAYMENT': '/cash-payment',
      'CONFIRMATION': '/confirmation'
    };
    
    const route = routeMap[view] || '/scan';
    navigate(route);
  }, [navigate]);

  // Cuando hay pending y el guest pasa a paid (p. ej. por webhook), ir a propina
  useEffect(() => {
    const pm = paymentReturnMessage;
    if (pm?.type !== 'pending' || !pm.waitingGuestId) return;
    const g = guests.find(x => x.id === pm.waitingGuestId);
    if (g?.paid) {
      setPaymentReturnMessage(null);
      navigateToView('CONFIRMATION');
    }
  }, [guests, paymentReturnMessage, navigateToView]);

  // Función para agregar item al carrito y guardarlo inmediatamente en la BD
  const handleAddToCart = useCallback(async (item: MenuItem, guestId: string, extras: string[], removedIngredients: string[]) => {
    if (!activeOrderId || !supabase) {
      console.error("[DineSplit] No hay orden activa o supabase no está disponible");
      return;
    }

    try {
      const menuItem = menuItems.find(m => m.id === item.id);
      
      // Buscar si existe un batch con status='CREADO', si no existe, crear uno nuevo
      let currentBatchId = activeBatchId;
      
      // Si no hay batch activo o el batch activo no tiene status='CREADO', buscar o crear uno
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
          // No existe batch con status='CREADO', crear uno nuevo
          console.log("[DineSplit] No se encontró batch con status='CREADO', creando uno nuevo...");
          const { count: batchCount } = await supabase
            .from('order_batches')
            .select('*', { count: 'exact', head: true })
            .eq('order_id', activeOrderId);
          const nextBatchNum = (batchCount || 0) + 1;
          
          const { data: newBatch, error: batchError } = await supabase
            .from('order_batches')
            .insert({
              order_id: activeOrderId,
              batch_number: nextBatchNum,
              status: 'CREADO'
            })
            .select()
            .single();
          
          if (batchError) {
            console.error("[DineSplit] Error al crear nuevo batch:", batchError);
            throw new Error(`Error al crear nuevo batch: ${batchError.message}`);
          }
          
          if (!newBatch || !newBatch.id) {
            throw new Error("No se pudo crear el nuevo batch. El batch no tiene ID.");
          }
          
          currentBatchId = newBatch.id;
          setActiveBatchId(newBatch.id);
          setBatches(prev => [...prev, newBatch]);
          console.log("[DineSplit] ✅ Nuevo batch creado. Batch ID:", newBatch.id, "batch_number:", newBatch.batch_number);
        }
      } else {
        // Verificar que el batch activo tenga status='CREADO'
        const { data: activeBatch } = await supabase
          .from('order_batches')
          .select('id, status, batch_number')
          .eq('id', currentBatchId)
          .single();
        
        if (activeBatch && activeBatch.status !== 'CREADO') {
          // El batch activo ya fue enviado, buscar o crear uno nuevo con status='CREADO'
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
            // No existe batch con status='CREADO', crear uno nuevo
            console.log("[DineSplit] No se encontró batch con status='CREADO', creando uno nuevo...");
            const { count: batchCount } = await supabase
              .from('order_batches')
              .select('*', { count: 'exact', head: true })
              .eq('order_id', activeOrderId);
            const nextBatchNum = (batchCount || 0) + 1;
            
            const { data: newBatch, error: batchError } = await supabase
              .from('order_batches')
              .insert({
                order_id: activeOrderId,
                batch_number: nextBatchNum,
                status: 'CREADO'
              })
              .select()
              .single();
            
            if (batchError) {
              console.error("[DineSplit] Error al crear nuevo batch:", batchError);
              throw new Error(`Error al crear nuevo batch: ${batchError.message}`);
            }
            
            if (!newBatch || !newBatch.id) {
              throw new Error("No se pudo crear el nuevo batch. El batch no tiene ID.");
            }
            
            currentBatchId = newBatch.id;
            setActiveBatchId(newBatch.id);
            setBatches(prev => [...prev, newBatch]);
            console.log("[DineSplit] ✅ Nuevo batch creado. Batch ID:", newBatch.id, "batch_number:", newBatch.batch_number);
          }
        }
      }
      
      if (!currentBatchId) {
        throw new Error("No se pudo encontrar o crear un batch activo con status='CREADO'.");
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
              navigate('/scan');
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

      {currentTable && location.pathname !== '/scan' && (
        <div className="absolute top-0 right-0 z-[100] px-3 py-1 bg-primary text-background-dark text-[10px] font-black uppercase tracking-widest rounded-bl-xl shadow-lg">
          Mesa {currentTable.table_number}
        </div>
      )}
      <Routes>
        <Route path="/" element={<Navigate to={`/scan${location.search || ''}`} replace />} />
        <Route path="/scan" element={<ScanView onNext={handleStartSession} restaurantName={undefined} />} />
        <Route path="/guest-info" element={
          <GuestInfoView 
            onBack={() => navigateToView('SCAN')} 
            onNext={async (finalGuests: Guest[]) => {
              const success = await handleCreateOrderWithGuests(finalGuests);
              if (success) {
                navigateToView('MENU');
              }
            }} 
            guests={guests} 
            setGuests={setGuests} 
            table={currentTable} 
            waiter={currentWaiter} 
            restaurant={restaurant} 
          />
        } />
        <Route path="/menu/:category?/:subcategory?" element={
          <MenuView 
            onNext={() => navigateToView('ORDER_SUMMARY')} 
            guests={guests} 
            setGuests={setGuests} 
            cart={cart} 
            onAddToCart={handleAddToCart} 
            onUpdateCartItem={handleUpdateCartItem} 
            onIndividualShare={() => navigateToView('INDIVIDUAL_SHARE')} 
            selectedGuestId={activeGuestId} 
            onSelectGuest={setActiveGuestId} 
            initialCategory={activeCategory} 
            onCategoryChange={setActiveCategory} 
            editingCartItem={editingCartItem} 
            onCancelEdit={() => setEditingCartItem(null)} 
            menuItems={menuItems} 
            categories={categories} 
            restaurant={restaurant} 
            table={currentTable} 
            onSaveGuestChanges={handleSaveGuestChanges}
            activeOrderId={activeOrderId}
            identifiedGuestId={getActiveGuestId()}
            pendingGuestSelection={pendingGuestSelection}
            onGuestIdentified={(id) => { setActiveGuestIdCookie(id); setPendingGuestSelection(false); }}
          />
        } />
        <Route path="/order-summary" element={
          <OrderSummaryView 
            guests={guests} 
            cart={cart} 
            batches={batches} 
            onBack={() => navigateToView('MENU')} 
            onNavigateToCategory={(gId, cat) => { 
              setActiveGuestId(gId); 
              setActiveCategory(cat);
              // Convertir nombre de categoría a slug para la URL
              const categoryToSlug = (name: string): string => {
                return name === 'Destacados' ? 'destacados' : name
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '');
              };
              navigate(`/menu/${categoryToSlug(cat)}`);
            }} 
            onEditItem={(item) => { 
              setEditingCartItem(item); 
              navigateToView('MENU'); 
            }} 
            onSend={handleSendOrder} 
            onPay={() => navigateToView('SPLIT_BILL')} 
            isSending={isSendingOrder} 
            onUpdateQuantity={(id, d) => handleUpdateCartItem(id, { quantity: Math.max(0, (cart.find(it => it.id === id)?.quantity || 1) + d) })} 
            menuItems={menuItems} 
            categories={categories} 
            tableNumber={currentTable?.table_number} 
            waiter={currentWaiter}
            currentGuestId={guestIdParam || getActiveGuestId() || activeGuestId}
          />
        } />
        <Route path="/progress" element={
          <OrderProgressView 
            cart={cart} 
            batches={batches} 
            activeOrderId={activeOrderId} 
            onNext={() => navigateToView('SPLIT_BILL')} 
            onBack={() => navigateToView('MENU')} 
            onRedirectToFeedback={() => navigateToView('CONFIRMATION')} 
            tableNumber={currentTable?.table_number} 
            menuItems={menuItems} 
          />
        } />
        <Route path="/split-bill" element={
          <SplitBillView 
            guests={guests} 
            cart={cart} 
            onBack={() => navigateToView('PROGRESS')} 
            onConfirm={async (shares) => { 
              console.log("[DineSplit] Confirmar División clickeado. Shares recibidos:", shares);
              setSplitData(shares);
              const saved = await handleSaveSplitAmounts(shares);
              if (saved) {
                navigateToView('CHECKOUT');
              } else {
                alert("Hubo un error al guardar la división de la cuenta. Intenta nuevamente.");
              }
            }} 
            menuItems={menuItems} 
          />
        } />
        <Route path="/guest-selection" element={
          <GuestSelectionView 
            guests={guests} 
            cart={cart} 
            menuItems={menuItems} 
            splitData={splitData} 
            onSelectGuest={(guestId) => { 
              navigate(`/individual-share?guestId=${guestId}`);
            }} 
            restaurant={restaurant} 
          />
        } />
        <Route path="/checkout" element={
          <CheckoutView 
            onBack={() => navigateToView('SPLIT_BILL')} 
            onConfirm={(guestId) => {
              if (guestId && activeOrderId) {
                navigate(`/individual-share?orderId=${activeOrderId}&guestId=${guestId}`);
              } else {
                navigateToView('INDIVIDUAL_SHARE');
              }
            }}
            onNavigateToTip={() => navigateToView('CONFIRMATION')}
            cart={cart} 
            guests={guests} 
            menuItems={menuItems} 
            tableNumber={currentTable?.table_number} 
            splitData={splitData} 
            activeOrderId={activeOrderId}
            currentGuestId={guestIdParam || activeGuestId}
          />
        } />
        <Route path="/individual-share" element={
          <IndividualShareView 
            onBack={() => {
              const urlParams = new URLSearchParams(window.location.search);
              const hasOrderId = urlParams.get('orderId');
              if (hasOrderId && !urlParams.get('res')) {
                navigate('/guest-selection');
              } else {
                navigateToView('CHECKOUT');
              }
            }} 
            onPay={handlePayIndividual}
            onShowTransfer={(amount) => {
              setPaymentAmount(amount);
              // Navegar a /transfer-payment con los parámetros de la URL actual
              const urlParams = new URLSearchParams(location.search);
              const guestIdFromUrl = urlParams.get('guestId');
              const orderIdFromUrl = urlParams.get('orderId');
              const guestIdToUse = guestIdFromUrl || activeGuestId;
              const orderIdToUse = orderIdFromUrl || activeOrderId || '';
              if (orderIdToUse && guestIdToUse) {
                navigate(`/transfer-payment?orderId=${orderIdToUse}&guestId=${guestIdToUse}`);
              } else {
                navigate('/transfer-payment');
              }
            }}
            onShowCash={(amount, guestName) => {
              setPaymentAmount(amount);
              setPaymentGuestName(guestName);
              navigateToView('CASH_PAYMENT');
            }}
            onUpdatePaymentMethod={updatePaymentMethod}
            paymentReturnMessage={paymentReturnMessage}
            onDismissPaymentMessage={() => setPaymentReturnMessage(null)}
            cart={cart} 
            menuItems={menuItems} 
            splitData={splitData} 
            restaurant={restaurant} 
            guests={guests} 
          />
        } />
        <Route path="/transfer-payment" element={
          <TransferPaymentView 
            onBack={() => navigateToView('INDIVIDUAL_SHARE')}
            amount={paymentAmount || 0}
            restaurant={restaurant}
            guestId={guestIdParam || activeGuestId}
            orderId={activeOrderId || ''}
          />
        } />
        <Route path="/cash-payment" element={
          <CashPaymentView 
            onBack={() => navigateToView('INDIVIDUAL_SHARE')}
            onNext={() => {
              clearSession();
              navigateToView('CONFIRMATION');
            }}
            amount={(() => {
              // Calcular el amount basándose en el guestId de la URL o activeGuestId
              const targetGuestId = guestIdParam || activeGuestId;
              if (targetGuestId) {
                // Buscar en splitData primero
                if (splitData) {
                  const guestShare = splitData.find(s => s.id === targetGuestId);
                  if (guestShare?.total) {
                    return guestShare.total;
                  }
                }
                // Si no está en splitData, buscar en guests
                const targetGuest = guests.find(g => g.id === targetGuestId);
                if (targetGuest?.individualAmount) {
                  return targetGuest.individualAmount;
                }
                // Si no hay individualAmount, calcular desde el cart
                const guestCartItems = cart.filter(item => item.guestId === targetGuestId);
                const calculatedAmount = guestCartItems.reduce((sum, item) => {
                  const menuItem = menuItems.find(m => m.id === item.itemId);
                  return sum + (menuItem ? menuItem.price * item.quantity : 0);
                }, 0);
                if (calculatedAmount > 0) {
                  return calculatedAmount;
                }
              }
              // Fallback a paymentAmount si está disponible
              return paymentAmount || 0;
            })()}
            guestId={guestIdParam || activeGuestId}
            orderId={activeOrderId || ''}
            guestName={paymentGuestName}
            cart={cart}
            menuItems={menuItems}
            waiter={currentWaiter}
            restaurant={restaurant}
          />
        } />
        <Route path="/confirmation" element={
          <ConfirmationView 
            onRestart={() => { 
              clearSession(); 
              navigate('/scan'); 
            }}
            onBackToStart={() => {
              clearSession();
              navigate('/scan');
            }}
            guests={guests} 
            tableNumber={currentTable?.table_number}
            activeOrderId={activeOrderId}
            currentGuestId={guestIdParam || activeGuestId}
          />
        } />
        <Route path="*" element={<Navigate to="/scan" replace />} />
      </Routes>
    </div>
  );
};

export default App;