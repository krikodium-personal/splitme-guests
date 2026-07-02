import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { AppView, Guest, OrderGuestCharge, OrderItem, MenuItem, MenuSectionHeader, OrderBatch } from './types';
import ScanView from './views/ScanView';
import GuestInfoView from './views/GuestInfoView';
import MenuView from './views/MenuView';
import OrderSummaryView from './views/OrderSummaryView';
import OrderProgressView from './views/OrderProgressView';
import SplitBillView from './views/SplitBillView';
import SplitStatusView from './views/SplitStatusView';
import GuestSelectionView from './views/GuestSelectionView';
import IndividualShareView from './views/IndividualShareView';
import TransferPaymentView from './views/TransferPaymentView';
import CashPaymentView from './views/CashPaymentView';
import CheckoutView from './views/CheckoutView';
import ConfirmationView from './views/ConfirmationView';
import FeedbackView from './views/FeedbackView';
import TipView from './views/TipView';
import MercadoPagoPaymentView from './views/MercadoPagoPaymentView';
import JoinTableView from './views/JoinTableView';
import BuildBadge from './BuildBadge';
import { getSession, setSession, getOrderId, setOrderId, removeOrderId, clearSession, getActiveGuestId, setActiveGuestIdCookie, setTableAndRestaurant, getTableAndRestaurant, isGuestEntryPath } from './lib/sessionCookies';
import { getGroupKeyForCategoryId, type OrderGroupKey } from './lib/orderGroups';
import { getVariantGroups } from './lib/variantDisplay';

const READY_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

async function mapOrderGuestsWithPayments(supabaseClient: any, orderGuests: any[]): Promise<Guest[]> {
  const paymentIds = [...new Set(orderGuests.map(og => og.payment_id).filter(Boolean))];
  const paymentCreatedAtById: Record<string, string> = {};
  const paymentTotalByGuestId: Record<string, number> = {};
  const latestPaymentCreatedAtByGuestId: Record<string, string> = {};
  const orderId = orderGuests.find(og => og.order_id)?.order_id;

  if (paymentIds.length > 0) {
    const { data, error } = await supabaseClient
      .from('payments')
      .select('id, created_at')
      .in('id', paymentIds);

    if (error) {
      console.warn('[DineSplit] No se pudieron cargar fechas de pagos:', error);
    } else {
      (data || []).forEach((payment: any) => {
        if (payment.id && payment.created_at) {
          paymentCreatedAtById[payment.id] = payment.created_at;
        }
      });
    }
  }

  if (orderId) {
    const { data, error } = await supabaseClient
      .from('payments')
      .select('guest_id, amount, created_at')
      .eq('order_id', orderId)
      .eq('status', 'approved');

    if (error) {
      console.warn('[DineSplit] No se pudo cargar ledger de payments por guest:', error);
    } else {
      (data || []).forEach((payment: any) => {
        if (!payment.guest_id) return;
        paymentTotalByGuestId[payment.guest_id] =
          (paymentTotalByGuestId[payment.guest_id] || 0) + (Number(payment.amount) || 0);

        const createdAt = payment.created_at || null;
        if (!createdAt) return;
        const current = latestPaymentCreatedAtByGuestId[payment.guest_id];
        if (!current || new Date(createdAt).getTime() > new Date(current).getTime()) {
          latestPaymentCreatedAtByGuestId[payment.guest_id] = createdAt;
        }
      });
    }
  }

  return orderGuests.map(og => ({
    id: og.id,
    name: og.name,
    isHost: og.is_host || false,
    individualAmount: og.individual_amount || null,
    paid: og.paid || false,
    payment_id: og.payment_id || null,
    payment_method: og.payment_method || null,
    payment_created_at: latestPaymentCreatedAtByGuestId[og.id] || (og.payment_id ? paymentCreatedAtById[og.payment_id] || null : null),
    payment_total: paymentTotalByGuestId[og.id] ?? null,
  }));
}

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

/** Enriquece menu items con variant_groups si no los tienen (fallback cuando la relación no viene en el select) */
async function enrichMenuItemsWithVariants(menuItemsData: any[], supabaseClient: typeof supabase): Promise<any[]> {
  if (!menuItemsData?.length || menuItemsData.some((m: any) => (m.variant_groups ?? m.variant_group)?.length > 0)) {
    return menuItemsData;
  }
  try {
    const { data: vgData } = await supabaseClient.from('variant_groups').select('*, variant_options(*)').in('menu_item_id', menuItemsData.map((m: any) => m.id));
    if (!vgData?.length) return menuItemsData;
    const vgByMenu = (vgData as any[]).reduce((acc: any, vg) => {
      const mid = vg.menu_item_id;
      if (!acc[mid]) acc[mid] = [];
      acc[mid].push({ ...vg, variant_options: vg.variant_options ?? vg.variant_option ?? [] });
      return acc;
    }, {});
    return menuItemsData.map((m: any) => ({ ...m, variant_groups: vgByMenu[m.id] || [] }));
  } catch (_) {
    return menuItemsData;
  }
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
  const amountParam = searchParams.get('amount');
  const chargeIdParam = searchParams.get('chargeId');
  const clearParam = searchParams.get('clear');

  const [currentView, setCurrentView] = useState<AppView>('INIT');
  const [loading, setLoading] = useState(false);
  const [sendingGroup, setSendingGroup] = useState<OrderGroupKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [restaurant, setRestaurant] = useState<any>(null);
  const [currentTable, setCurrentTable] = useState<any>(null);
  const [currentWaiter, setCurrentWaiter] = useState<any>(null);

  // Debug: Log waiter changes
  useEffect(() => {
    console.log('[App] currentWaiter changed:', currentWaiter);
  }, [currentWaiter]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuItemsReady, setMenuItemsReady] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [sectionHeaders, setSectionHeaders] = useState<MenuSectionHeader[]>([]);
  const [guests, setGuests] = useState<Guest[]>([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
  const [activeGuestId, setActiveGuestId] = useState<string>('1');
  
  // Mantener el ref actualizado con el valor de activeGuestId
  useEffect(() => {
    activeGuestIdRef.current = activeGuestId;
  }, [activeGuestId]);
  const [activeCategory, setActiveCategory] = useState<string>(() => {
    const match = window.location.pathname.match(/^\/menu\/([^/]+)/);
    const slug = match?.[1]?.toLowerCase();
    if (!slug || slug === 'inicio') return 'Inicio';
    if (slug === 'destacados') return 'Destacados';
    return 'Inicio';
  });
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [batches, setBatches] = useState<OrderBatch[]>([]);
  const [orderGuestCharges, setOrderGuestCharges] = useState<OrderGuestCharge[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null); // Batch actual para nuevos items

  // Cart filtrado para SplitBill: solo items ya enviados (excluir CREADO y sin batch_id)
  const cartForSplit = React.useMemo(() => {
    return cart.filter(item => {
      const isInCreatedBatch = !item.batch_id || batches.some(b => b.id === item.batch_id && (b.status || '').toUpperCase() === 'CREADO');
      return !isInCreatedBatch;
    });
  }, [cart, batches]);
  const [editingCartItem, setEditingCartItem] = useState<OrderItem | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [splitData, setSplitData] = useState<any[] | null>(null);
  const [showReadyToast, setShowReadyToast] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentChargeId, setPaymentChargeId] = useState<string | null>(null);
  const mpPaymentAmount =
    paymentAmount > 0
      ? paymentAmount
      : amountParam
        ? Number.parseFloat(amountParam)
        : 0;
  const [paymentGuestName, setPaymentGuestName] = useState<string>('');
  const [pendingGuestSelection, setPendingGuestSelection] = useState(false);
  const [paymentReturnMessage, setPaymentReturnMessage] = useState<{ type: 'rejected'|'pending'; message: string; waitingGuestId?: string | null } | null>(null);

  const batchChannelRef = useRef<any>(null);
  const cartChannelRef = useRef<any>(null);
  const guestsChannelRef = useRef<any>(null);
  const activeGuestIdRef = useRef<string>('1');
  const prevPathRef = useRef<string | null>(null);
  const menuItemsRef = useRef<MenuItem[]>([]);
  useEffect(() => { menuItemsRef.current = menuItems; }, [menuItems]);

  const pendingChargeSplitData = React.useMemo(() => {
    const pendingCharges = orderGuestCharges.filter(charge => charge.status === 'pending' && (Number(charge.amount) || 0) > 0);
    if (pendingCharges.length === 0) return null;

    const sorted = [...pendingCharges].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
    const latestRoundId = sorted[0]?.split_round_id || null;
    const latestCharges = latestRoundId
      ? pendingCharges.filter(charge => charge.split_round_id === latestRoundId)
      : pendingCharges;

    return latestCharges.map(charge => {
      const guest = guests.find(g => g.id === charge.guest_id);
      return {
        ...(guest || { id: charge.guest_id, name: 'Comensal' }),
        id: charge.guest_id,
        charge_id: charge.id,
        subtotal: Number(charge.amount) || 0,
        total: Number(charge.amount) || 0,
        amount: Number(charge.amount) || 0,
        paid: false,
        status: charge.status,
      };
    });
  }, [orderGuestCharges, guests]);

  const latestChargeSplitData = React.useMemo(() => {
    const billableCharges = orderGuestCharges.filter(charge => charge.status !== 'cancelled' && (Number(charge.amount) || 0) > 0);
    if (billableCharges.length === 0) return null;

    const sorted = [...billableCharges].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
    const latestRoundId = sorted[0]?.split_round_id || null;
    const latestCharges = latestRoundId
      ? billableCharges.filter(charge => charge.split_round_id === latestRoundId)
      : billableCharges;

    return latestCharges.map(charge => {
      const guest = guests.find(g => g.id === charge.guest_id);
      return {
        ...(guest || { id: charge.guest_id, name: 'Comensal' }),
        id: charge.guest_id,
        charge_id: charge.id,
        subtotal: Number(charge.amount) || 0,
        total: Number(charge.amount) || 0,
        amount: Number(charge.amount) || 0,
        paid: charge.status === 'paid',
        status: charge.status,
        payment_method: charge.payment_method || null,
        payment_id: charge.payment_id || null,
        paid_at: charge.paid_at || null,
        split_round_id: charge.split_round_id || null,
      };
    });
  }, [orderGuestCharges, guests]);

  const activeSplitData = splitData || pendingChargeSplitData;
  const existingSplitStatusData = splitData || latestChargeSplitData;
  const confirmationSplitData = latestChargeSplitData || activeSplitData;
  const mpPaymentChargeId = React.useMemo(() => {
    if (paymentChargeId) return paymentChargeId;
    if (chargeIdParam) return chargeIdParam;

    let sessionChargeId: string | null = null;
    try {
      sessionChargeId = sessionStorage.getItem('splitme_payment_charge_id');
    } catch (e) {}
    if (sessionChargeId) return sessionChargeId;

    const guestId = guestIdParam || activeGuestId;
    return activeSplitData?.find(s => s.id === guestId)?.charge_id || null;
  }, [activeSplitData, activeGuestId, chargeIdParam, guestIdParam, paymentChargeId]);

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
        
        // Cargar variantes: prioridad variant_selections (columna) > notes (retrocompatibilidad)
        let selectedReplaceOptionId: string | undefined;
        let selectedAddOptionIds: string[] | undefined;
        let variantSelections: string[] = [];
        if (item.variant_selections && Array.isArray(item.variant_selections)) {
          variantSelections = item.variant_selections.filter((id: any) => typeof id === 'string' && id.length > 0);
        }
        if (variantSelections.length > 0) {
          // Resolver replace vs add usando menuItem (si está disponible)
          const menuItem = menuItemsRef.current?.find((m: MenuItem) => m.id === item.menu_item_id);
          if (menuItem?.variant_groups) {
            const allOpts = menuItem.variant_groups.flatMap(g => g.variant_options || []);
            variantSelections.forEach((id: string) => {
              const opt = allOpts.find((o: any) => o.id === id);
              if (opt && (opt.price_type || '').toLowerCase() === 'replace') selectedReplaceOptionId = id;
              else if (opt && (opt.price_type || '').toLowerCase() === 'add') selectedAddOptionIds = [...(selectedAddOptionIds || []), id];
            });
          } else {
            // Sin menuItem: asumir primer ID es replace, resto add (heurística)
            if (variantSelections.length > 0) selectedReplaceOptionId = variantSelections[0];
            if (variantSelections.length > 1) selectedAddOptionIds = variantSelections.slice(1);
          }
        } else if (item.notes && typeof item.notes === 'string') {
          // Retrocompatibilidad: parsear desde notes
          const variantReplaceMatch = item.notes.match(/VARIANT_REPLACE:([a-fA-F0-9-]+)/i);
          if (variantReplaceMatch) selectedReplaceOptionId = variantReplaceMatch[1];
          const variantAddMatch = item.notes.match(/VARIANT_ADD:([^|]*)/i);
          if (variantAddMatch && variantAddMatch[1]) {
            selectedAddOptionIds = variantAddMatch[1].split(',').map(s => s.trim()).filter(Boolean);
          }
          variantSelections = [selectedReplaceOptionId, ...(selectedAddOptionIds || [])].filter(Boolean) as string[];
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
          removedIngredients,
          unitPrice: item.unit_price != null ? Number(item.unit_price) : undefined,
          selectedReplaceOptionId,
          selectedAddOptionIds,
          variant_selections: variantSelections.length > 0 ? variantSelections : undefined
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

      // Cargar datos complementarios (sin menu_items para poder navegar antes y mostrar skeleton)
      const [waiterRes, catRes, sectionHeadersRes] = await Promise.all([
        tableData.waiter_id
          ? supabase.from('waiters').select('*').eq('id', tableData.waiter_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('categories').select('*').eq('restaurant_id', resData.id).order('sort_order'),
        supabase.from('menu_section_headers').select('*').eq('restaurant_id', resData.id).order('sort_order')
      ]);

      setRestaurant(resData);
      setCurrentTable(tableData);
      setCurrentWaiter(waiterRes.data || null);
      setCategories(catRes.data || []);
      setSectionHeaders((sectionHeadersRes.data as MenuSectionHeader[]) || []);
      setMenuItems([]);
      setMenuItemsReady(false);
      setTableAndRestaurant(tableData, resData);

      // Cargar menu_items en background (el skeleton se muestra mientras tanto)
      const loadMenuItems = async () => {
        const itemRes = await supabase.from('menu_items').select('*, variant_groups(*, variant_options(*))').eq('restaurant_id', resData.id).order('sort_order');
        let menuItemsData = itemRes.data || [];
        if (itemRes.error) {
          const fallback = await supabase.from('menu_items').select('*').eq('restaurant_id', resData.id).order('sort_order');
          menuItemsData = fallback.data || [];
        }
        menuItemsData = await enrichMenuItemsWithVariants(menuItemsData, supabase);
        setMenuItems(menuItemsData);
        setMenuItemsReady(true);
      };
      loadMenuItems();
      
      // PASO 3: Verificar orden activa
      // Si la mesa está Libre (cerrada en admin), siempre iniciar sesión nueva — no buscar órdenes previas
      const tableStatus = (tableData.status || '').toString().toUpperCase().trim();
      if (tableStatus === 'LIBRE') {
        console.log("[DineSplit] Mesa con status=Libre. Iniciando sesión nueva (sin orden previa).");
        removeOrderId();
        setActiveOrderId(null);
        setCart([]);
        setBatches([]);
        setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
        setActiveGuestId('1');
        navigateToView('GUEST_INFO');
        setLoading(false);
        return true;
      }

      // Buscar órdenes que no estén PAGADO o CANCELADO (incluye ABIERTO y otros estados activos)
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
          setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
          setActiveGuestId('1');
          navigateToView('GUEST_INFO');
        }
      } else {
        console.log("[DineSplit] No hay orden activa. Empezando nueva sesión.");
        removeOrderId();
        setActiveOrderId(null);
        setCart([]);
        setBatches([]);
        setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
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
  // Acepta table y restaurant opcionales para evitar problemas de closure cuando vienen de GuestInfoView
  const handleCreateOrderWithGuests = useCallback(async (
    guestsToSave: Guest[],
    tableOverride?: { id: string; [key: string]: any } | null,
    restaurantOverride?: { id: string; [key: string]: any } | null
  ) => {
    let tableToUse = tableOverride ?? currentTable;
    let restaurantToUse = restaurantOverride ?? restaurant;
    if (!tableToUse || !restaurantToUse) {
      const stored = getTableAndRestaurant();
      tableToUse = tableToUse ?? stored.table;
      restaurantToUse = restaurantToUse ?? stored.restaurant;
    }
    if (!restaurantToUse || !tableToUse || !supabase) {
      console.error('[DineSplit] handleCreateOrderWithGuests: faltan datos', { tableToUse: !!tableToUse, restaurantToUse: !!restaurantToUse, supabase: !!supabase });
      throw new Error('Faltan datos de mesa o restaurante. Volvé a escanear el código QR.');
    }
    
    try {
      // Crear la orden
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurantToUse.id,
          table_id: tableToUse.id,
          waiter_id: currentWaiter?.id || null,
          status: 'ABIERTO',
          total_amount: 0,
          guest_count: guestsToSave.length,
          guest_name: guestsToSave[0]?.name || 'Comensal 1'
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
      setPendingGuestSelection(false); // Quien abre la mesa es el host, no preguntar "¿Quién sos?"
      
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
        .eq('id', tableToUse.id);
      
      if (tableUpdateError) {
        console.error("[DineSplit] Error al actualizar estado de mesa:", tableUpdateError);
        // No lanzamos error para no bloquear el flujo, solo lo registramos
      }
      
      return savedGuests[0].id; // Devolver ID del host para usarlo en la navegación
    } catch (error: any) {
      console.error("[DineSplit] Error al crear orden con guests:", error);
      const msg = error?.message || error?.error_description || 'Error desconocido';
      throw new Error(`Error al crear la orden: ${msg}`);
    }
  }, [restaurant, currentTable, currentWaiter]);

  const fetchOrderGuestCharges = useCallback(async (orderId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('order_guest_charges')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[DineSplit] No se pudieron cargar order_guest_charges:', error);
      setOrderGuestCharges([]);
      return;
    }

    const charges: OrderGuestCharge[] = (data || []).map((charge: any) => ({
      id: charge.id,
      order_id: charge.order_id,
      guest_id: charge.guest_id,
      amount: Number(charge.amount) || 0,
      status: charge.status || 'pending',
      payment_method: charge.payment_method || null,
      payment_id: charge.payment_id || null,
      split_round_id: charge.split_round_id || null,
      created_at: charge.created_at,
      paid_at: charge.paid_at || null,
    }));
    setOrderGuestCharges(charges);
  }, []);

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
      const guestsFromDB = await mapOrderGuestsWithPayments(supabase, orderGuests);
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
            const guestsFromDB = await mapOrderGuestsWithPayments(supabase, guestsById);
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
                const guestsFromDB = await mapOrderGuestsWithPayments(supabase, directQuery);
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

  useEffect(() => {
    if (!activeOrderId || !supabase) {
      setOrderGuestCharges([]);
      return;
    }

    fetchOrderGuestCharges(activeOrderId);

    const channel = supabase
      .channel(`order-guest-charges-${activeOrderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_guest_charges', filter: `order_id=eq.${activeOrderId}` },
        () => fetchOrderGuestCharges(activeOrderId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId, fetchOrderGuestCharges]);

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

  // Función para crear cargos individuales a partir de una división.
  // Esta función se llama CADA VEZ que se hace click en "Confirmar División"
  const handleSaveSplitAmounts = useCallback(async (shares: any[]) => {
    if (!supabase || !activeOrderId) {
      console.error("[DineSplit] No se puede guardar montos: supabase o activeOrderId no disponible");
      return null;
    }
    
    try {
      console.log("[DineSplit] ========================================");
      console.log("[DineSplit] Creando cargos individuales para", shares.length, "guests");
      console.log("[DineSplit] Montos a guardar:", shares.map(s => ({ id: s.id, name: s.name, total: s.total })));

      const splitRoundId = crypto.randomUUID();
      const payableShares = shares
        .map(share => ({ ...share, total: Number(share.total) || 0 }))
        .filter(share => share.total > 0);

      if (payableShares.length === 0) {
        return shares;
      }

      const { data, error } = await supabase
        .from('order_guest_charges')
        .insert(payableShares.map(share => ({
          order_id: activeOrderId,
          guest_id: share.id,
          amount: share.total,
          status: 'pending',
          split_round_id: splitRoundId,
        })))
        .select('*');

      if (error) {
        console.error("[DineSplit] ❌ Error al crear cargos individuales:", error);
        throw error;
      }

      const chargeByGuestId = new Map((data || []).map((charge: any) => [charge.guest_id, charge]));
      const sharesWithCharges = shares.map(share => {
        const charge = chargeByGuestId.get(share.id) as any;
        return charge ? { ...share, charge_id: charge.id, status: charge.status || 'pending' } : share;
      });

      console.log("[DineSplit] ✅ Cargos individuales creados:", data?.length || 0);
      console.log("[DineSplit] ========================================");

      await fetchOrderGuestCharges(activeOrderId);
      return sharesWithCharges;
    } catch (error: any) {
      console.error("[DineSplit] ❌ Error al crear cargos individuales:", error);
      return null;
    }
  }, [activeOrderId, fetchOrderGuestCharges]);

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

  /** Refresca menu items (disponibilidad y stock) para visibilidad en tiempo real al cambiar sección/subsección. */
  const refreshMenuItems = useCallback(async () => {
    if (!restaurant?.id || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, variant_groups(*, variant_options(*))')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order');
      if (error) {
        const fallback = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id).order('sort_order');
        if (fallback.data) {
          const enriched = await enrichMenuItemsWithVariants(fallback.data, supabase);
          setMenuItems(enriched);
          setMenuItemsReady(true);
        }
        return;
      }
      if (data) {
        const enriched = await enrichMenuItemsWithVariants(data, supabase);
        setMenuItems(enriched);
        setMenuItemsReady(true);
      }
    } catch (e) {
      console.warn('[DineSplit] Error al refrescar menu items:', e);
    }
  }, [restaurant?.id, supabase]);

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

  // Agregar un comensal a la mesa (para JoinTableView - escanear QR)
  const handleAddGuestForJoin = useCallback(async (name: string): Promise<string | null> => {
    if (!supabase || !activeOrderId) return null;
    const tableCapacity = currentTable?.capacity || 10;
    if (guests.length >= tableCapacity) return null;
    try {
      const { data: existingGuests } = await supabase
        .from('order_guests')
        .select('position')
        .eq('order_id', activeOrderId)
        .order('position', { ascending: false })
        .limit(1);
      const lastPosition = existingGuests?.[0]?.position ?? 0;
      const { data: saved, error } = await supabase
        .from('order_guests')
        .insert({
          order_id: activeOrderId,
          name: name.trim() || name,
          is_host: false,
          position: lastPosition + 1,
          paid: false,
        })
        .select('id')
        .single();
      if (error) throw error;
      const newId = saved?.id;
      if (newId) {
        setGuests(prev => [...prev, {
          id: newId,
          name: name.trim() || name,
          isHost: false,
          individualAmount: null,
          paid: false,
          payment_id: null,
          payment_method: null,
        }]);
        const { count } = await supabase.from('order_guests').select('*', { count: 'exact', head: true }).eq('order_id', activeOrderId);
        if (count != null) {
          await supabase.from('orders').update({ guest_count: count }).eq('id', activeOrderId);
        }
      }
      return newId ?? null;
    } catch (e) {
      console.error('[App] Error adding guest:', e);
      return null;
    }
  }, [supabase, activeOrderId, currentTable, guests.length]);

  useEffect(() => {
  const routesRequiringSession = ['/menu', '/order-summary', '/progress', '/split-bill', '/split-status', '/checkout', '/individual-share', '/mp-payment', '/transfer-payment', '/cash-payment', '/tip', '/feedback', '/confirmation', '/guest-selection', '/join-table'];
    let cancelled = false;
    
    const initApp = async () => {
      // ?clear=1: limpia cookies de sesión/mesa y muestra la pantalla de scan
      if (clearParam) {
        clearSession();
        setRestaurant(null);
        setCurrentTable(null);
        setCurrentWaiter(null);
        setMenuItems([]);
        setCategories([]);
        setSectionHeaders([]);
        setActiveOrderId(null);
        setCart([]);
        setBatches([]);
        setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
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

      // Entrada nueva en / o /scan sin parámetros: no restaurar cookies (permitir otra mesa/sesión).
      // Sí restauramos si hay res/table/orderId/guestId en URL o retorno de Mercado Pago.
      const isFreshEntry =
        isGuestEntryPath(location.pathname) &&
        !resParam &&
        !tableParam &&
        !orderIdParam &&
        !guestIdParam &&
        !isAnyMpReturn;

      if (isFreshEntry) {
        clearSession();
        setRestaurant(null);
        setCurrentTable(null);
        setCurrentWaiter(null);
        setMenuItems([]);
        setCategories([]);
        setSectionHeaders([]);
        setActiveOrderId(null);
        setCart([]);
        setBatches([]);
        setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
        setActiveGuestId('1');
        setError(null);
        setLoading(false);
        navigate('/scan');
        return;
      }

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
          const tableId = orderData.table_id || orderData.tables?.id;

          // Cargar restaurante, mesa (con capacity), categories, menuItems, guests en paralelo
          const [restaurantRes, tableRes, categoriesRes, menuItemsRes, guestsRes, sectionHeadersRes] = await Promise.all([
            supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle(),
            tableId ? supabase.from('tables').select('*').eq('id', tableId).maybeSingle() : Promise.resolve({ data: orderData.tables, error: null }),
            supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('menu_items').select('*, variant_groups(*, variant_options(*))').eq('restaurant_id', restaurantId).order('sort_order'),
            supabase.from('order_guests').select('*').eq('order_id', orderIdForLoad).order('position', { ascending: true }),
            supabase.from('menu_section_headers').select('*').eq('restaurant_id', restaurantId).order('sort_order')
          ]);

          if (restaurantRes.error || !restaurantRes.data) {
            throw new Error("No se pudo cargar el restaurante.");
          }

          const finalTableData = tableRes?.data || orderData.tables || null;
          const orderStatus = (orderData.status || '').toString().toUpperCase().trim();
          const tableStatusFromOrder = (finalTableData?.status || '').toString().toUpperCase().trim();

          // Si la orden está cerrada o la mesa está Libre, redirigir a scan para iniciar sesión nueva
          if (orderStatus === 'PAGADO' || orderStatus === 'CANCELADO' || tableStatusFromOrder === 'LIBRE') {
            console.log("[DineSplit] Orden cerrada o mesa Libre (order:", orderStatus, ", table:", tableStatusFromOrder, "). Redirigiendo a nueva sesión.");
            clearSession();
            setRestaurant(null);
            setCurrentTable(null);
            setCurrentWaiter(null);
            setMenuItems([]);
            setCategories([]);
            setActiveOrderId(null);
            setCart([]);
            setBatches([]);
            setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
            setActiveGuestId('1');
            const accessCode = restaurantRes.data.access_code || '';
            const tableNum = finalTableData?.table_number ?? '';
            navigate(accessCode && tableNum ? `/scan?res=${accessCode}&table=${tableNum}` : '/scan');
            setLoading(false);
            return;
          }

          setRestaurant(restaurantRes.data);
          setCurrentTable(finalTableData);
          setCategories(categoriesRes.data || []);
          setSectionHeaders((sectionHeadersRes.data as MenuSectionHeader[]) || []);
          setMenuItems(await enrichMenuItemsWithVariants(menuItemsRes.data || [], supabase));
          setMenuItemsReady(true);
          setActiveOrderId(orderIdForLoad);
          setOrderId(orderIdForLoad);

          // Cargar waiter si la mesa tiene waiter_id
          if (finalTableData?.waiter_id) {
            const { data: waiterData } = await supabase
              .from('waiters')
              .select('*')
              .eq('id', finalTableData.waiter_id)
              .maybeSingle();
            setCurrentWaiter(waiterData || null);
          } else {
            setCurrentWaiter(null);
          }

          // Cargar guests con sus montos individuales y estado de pago
          const guestIdToSet = guestIdParam || (isAnyMpReturn && mpReturn?.guestId) || undefined;
          let guestsFromDB: Guest[] = [];
          if (guestsRes.data) {
            guestsFromDB = await mapOrderGuestsWithPayments(supabase, guestsRes.data);
            console.log("[DineSplit] Guests cargados desde link QR:", guestsFromDB.map(g => ({ id: g.id, name: g.name, individualAmount: g.individualAmount, paid: g.paid, payment_id: g.payment_id })));
            setGuests(guestsFromDB);
            if (guestIdToSet && guestsFromDB.some(g => g.id === guestIdToSet)) {
              setActiveGuestId(guestIdToSet);
              setActiveGuestIdCookie(guestIdToSet);
            }
          }

          await fetchOrderItemsFromDB(orderIdForLoad);
          
          const currentPath = location.pathname;
          const routesRequiringSession = ['/menu', '/order-summary', '/progress', '/split-bill', '/split-status', '/checkout', '/individual-share', '/mp-payment', '/transfer-payment', '/cash-payment', '/tip', '/feedback', '/confirmation', '/guest-selection'];
          
          if (!routesRequiringSession.includes(currentPath) && !isGuestEntryPath(currentPath)) {
            const preserveQuery = location.search || '';
            if (guestIdParam) {
              navigate('/individual-share' + (preserveQuery || `?orderId=${orderIdForLoad}&guestId=${guestIdParam}`));
            } else {
              const preferredId = getActiveGuestId();
              if (preferredId && guestsFromDB.some(g => g.id === preferredId)) {
                navigate('/individual-share' + (preserveQuery || `?orderId=${orderIdForLoad}&guestId=${preferredId}`));
              } else {
                navigate('/join-table' + (preserveQuery || `?orderId=${orderIdForLoad}`));
              }
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
        const onEntryPath = isGuestEntryPath(location.pathname);

        if (orderId && !onEntryPath) {
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
              setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
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

            // Si la orden está PAGADA/CERRADA pero volvemos de MP con success/approved, no redirigir a /scan:
            // cargar el estado y dejar que el efecto de paymentStatus lleve a /confirmation
            if (orderCheck && (orderCheck.status === 'PAGADO' || orderCheck.status === 'CANCELADO') && !isPaymentReturn) {
              clearSession();
              setRestaurant(null);
              setCurrentTable(null);
              setCurrentWaiter(null);
              setMenuItems([]);
              setCategories([]);
              setActiveOrderId(null);
              setCart([]);
              setBatches([]);
              setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
              setActiveGuestId('1');
              navigate('/scan');
              setLoading(false);
              return;
            }

            const restaurantId = orderData.tables.restaurant_id;
            const [restaurantRes, categoriesRes, menuItemsRes, guestsRes, tableRes, sectionHeadersRes] = await Promise.all([
              supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle(),
              supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
              supabase.from('menu_items').select('*, variant_groups(*, variant_options(*))').eq('restaurant_id', restaurantId).order('sort_order'),
              supabase.from('order_guests').select('*').eq('order_id', orderId).order('position', { ascending: true }),
              supabase.from('tables').select('*').eq('id', orderData.table_id).maybeSingle(),
              supabase.from('menu_section_headers').select('*').eq('restaurant_id', restaurantId).order('sort_order')
            ]);

            const finalTableData = tableRes?.data || null;
            const tableStatusFromCookie = (finalTableData?.status || '').toString().toUpperCase().trim();

            // Si la mesa está Libre (cerrada en admin), limpiar y redirigir a scan
            if (tableStatusFromCookie === 'LIBRE') {
              console.log("[DineSplit] Mesa Libre al restaurar desde cookie. Redirigiendo a scan.");
              clearSession();
              setRestaurant(null);
              setCurrentTable(null);
              setCurrentWaiter(null);
              setMenuItems([]);
              setCategories([]);
              setActiveOrderId(null);
              setCart([]);
              setBatches([]);
              setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
              setActiveGuestId('1');
              navigate('/scan');
              setLoading(false);
              return;
            }

            setCurrentTable(finalTableData);

            if (restaurantRes.error || !restaurantRes.data) {
              clearSession();
              setError("No se pudo cargar el restaurante.");
              navigate('/scan');
              setLoading(false);
              return;
            }

            setRestaurant(restaurantRes.data);
            setCategories(categoriesRes.data || []);
            setSectionHeaders((sectionHeadersRes.data as MenuSectionHeader[]) || []);
            setMenuItems(await enrichMenuItemsWithVariants(menuItemsRes.data || [], supabase));
            setMenuItemsReady(true);
            setActiveOrderId(orderId);

            // Cargar waiter si la mesa tiene waiter_id
            if (finalTableData?.waiter_id) {
              const { data: waiterData } = await supabase
                .from('waiters')
                .select('*')
                .eq('id', finalTableData.waiter_id)
                .maybeSingle();
              setCurrentWaiter(waiterData || null);
            } else {
              setCurrentWaiter(null);
            }
            if (guestsRes.data) {
              const guestsFromDB = await mapOrderGuestsWithPayments(supabase, guestsRes.data);
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

            // Mantener la ruta actual al refrescar (p. ej. /menu, /individual-share).
            // Ya no redirigimos desde /scan: la entrada fresca limpia cookies arriba.
            setLoading(false);
          } catch (e: any) {
            console.error("[DineSplit] Error al restaurar sesión desde cookie:", e);
            clearSession();
            setError("No se pudo restaurar la sesión.");
            navigate('/scan');
            setLoading(false);
          }
        } else if (session?.res && session?.table && !onEntryPath) {
          console.log("[DineSplit] Restaurando sesión desde cookie:", session.res, session.table);
          await handleStartSession(session.res, session.table, getActiveGuestId() || undefined);
          setLoading(false);
        } else if (onEntryPath) {
          clearSession();
          setRestaurant(null);
          setCurrentTable(null);
          setCurrentWaiter(null);
          setMenuItems([]);
          setCategories([]);
          setSectionHeaders([]);
          setActiveOrderId(null);
          setCart([]);
          setBatches([]);
          setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
          setActiveGuestId('1');
          setError(null);
          setLoading(false);
          navigate('/scan');
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
          setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
          setActiveGuestId('1');
          navigate('/scan');
          setLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      console.warn('[DineSplit] Init timeout — showing scan view');
      setLoading(false);
      navigate('/scan');
    }, 8000);

    initApp()
      .catch((err) => {
        if (cancelled) return;
        console.error("[DineSplit] Error en initApp:", err);
        setLoading(false);
        setError(null);
        navigate('/scan');
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [resParam, tableParam, orderIdParam, guestIdParam, clearParam, paymentStatus, location.pathname, handleStartSession, fetchOrderItemsFromDB, navigate]);

  // Función para procesar el pago exitoso
  const handlePaymentSuccess = useCallback(async (guestId: string, paymentAmount: number, paymentMethod: string, mpTransactionId?: string, chargeId?: string | null) => {
    if (!supabase || !activeOrderId || !guestId) {
      console.error("[DineSplit] No se puede procesar pago: faltan datos");
      return false;
    }

    try {
      if (mpTransactionId) {
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('mp_transaction_id', mpTransactionId)
          .maybeSingle();

        if (existingPayment?.id) {
          console.log("[DineSplit] Pago MP ya registrado, idempotente → éxito:", existingPayment.id);
          await fetchOrderGuests(activeOrderId);
          return true;
        }
      }

      console.log("[DineSplit] ========================================");
      console.log("[DineSplit] Procesando pago exitoso");
      console.log("[DineSplit] Guest ID:", guestId);
      console.log("[DineSplit] Amount:", paymentAmount);
      console.log("[DineSplit] Method:", paymentMethod);
      console.log("[DineSplit] MP Transaction ID:", mpTransactionId);

      const paymentPayload: any = {
        order_id: activeOrderId,
        guest_id: guestId,
        charge_id: chargeId || null,
        amount: paymentAmount,
        payment_method: paymentMethod,
        mp_transaction_id: mpTransactionId || null,
        status: 'approved' // Mercado Pago devuelve 'approved' cuando es exitoso
      };

      // Paso 1: Crear registro en la tabla payments
      let { data: newPayment, error: paymentError } = await supabase
        .from('payments')
        .insert(paymentPayload)
        .select()
        .single();

      if (paymentError && paymentError.code === 'PGRST204' && (paymentError.message?.includes('guest_id') || paymentError.message?.includes('charge_id'))) {
        console.warn("[DineSplit] La columna payments.guest_id/charge_id no existe, registrando pago con payload legacy");
        const { guest_id, charge_id, ...fallbackPayload } = paymentPayload;
        const retry = await supabase
          .from('payments')
          .insert(fallbackPayload)
          .select()
          .single();
        newPayment = retry.data;
        paymentError = retry.error;
      }

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

      if (chargeId && newPayment?.id) {
        const { error: chargeError } = await supabase
          .from('order_guest_charges')
          .update({
            status: 'paid',
            payment_method: normalizedPaymentMethod,
            payment_id: newPayment.id,
            paid_at: new Date().toISOString(),
          })
          .eq('id', chargeId);

        if (chargeError) {
          console.error("[DineSplit] Error al marcar cargo como pagado:", chargeError);
          throw chargeError;
        }
      }
      
      if (!chargeId) {
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
      }
      console.log("[DineSplit] ========================================");

      // Recargar guests para actualizar el estado local
      await fetchOrderGuests(activeOrderId);
      await fetchOrderGuestCharges(activeOrderId);

      return true;
    } catch (error: any) {
      console.error("[DineSplit] ❌ Error al procesar pago exitoso:", error);
      return false;
    }
  }, [supabase, activeOrderId, fetchOrderGuests, fetchOrderGuestCharges]);

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
      let chargeIdFromSession: string | null = null;
      try { chargeIdFromSession = sessionStorage.getItem('splitme_payment_charge_id'); } catch (e) {}
      const payingShare = activeSplitData?.find(s => s.id === guestIdFromUrl || s.charge_id === chargeIdFromSession);
      const amountToRegister = payingShare?.total || payingShare?.amount || paymentAmount;
      if (guestIdFromUrl && amountToRegister > 0) {
        handlePaymentSuccess(guestIdFromUrl, amountToRegister, 'mercadopago', paymentId || undefined, chargeIdFromSession || payingShare?.charge_id || null).then(success => {
          clearMpReturn();
          try { sessionStorage.removeItem('splitme_payment_charge_id'); } catch (e) {}
          if (success) {
            clearSession();
            navigate('/tip');
          } else {
            alert("Hubo un error al registrar el pago. Por favor, contacta al restaurante.");
          }
        });
      } else {
        clearMpReturn();
        clearSession();
        navigate('/tip');
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
  }, [paymentStatus, activeOrderId, activeSplitData, handlePaymentSuccess, location.pathname]);

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

      const chargeId = activeSplitData?.find(s => s.id === guestId)?.charge_id || paymentChargeId;
      if (chargeId) {
        const { error } = await supabase
          .from('order_guest_charges')
          .update({ payment_method: normalizedMethod })
          .eq('id', chargeId);

        if (error) {
          console.error("[DineSplit] Error al actualizar método de pago en cargo:", error);
          return false;
        }

        await fetchOrderGuestCharges(activeOrderId);
        return true;
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
  }, [supabase, activeOrderId, activeSplitData, paymentChargeId, fetchOrderGuestCharges]);

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

  const handlePayIndividual = async (paymentData: { amount: number, method: string, chargeId?: string | null }) => {
    if (!activeOrderId || !restaurant) {
      console.warn('[DineSplit] handlePayIndividual abortado: falta orden o restaurante', {
        activeOrderId,
        restaurantId: restaurant?.id,
      });
      alert('No se pudo iniciar el pago. Recargá la página o volvé a escanear el QR de la mesa.');
      return;
    }
    
    // Obtener guestId de la URL si existe
    const urlParams = new URLSearchParams(window.location.search);
    const guestId = urlParams.get('guestId') || activeGuestId;
    
    if (paymentData.method === 'mercadopago') {
      try {
        const amount = Number(paymentData.amount);
        if (isNaN(amount) || amount <= 0) {
          throw new Error("El monto a pagar debe ser mayor a cero.");
        }
        if (!guestId) {
          throw new Error('No se pudo identificar al comensal. Volvé a intentar desde tu link.');
        }

        const { data: config, error: configError } = await supabase
          .from('payment_configs')
          .select('id, oauth_connected_at, oauth_requires_reconnect, token_cbu, refresh_token')
          .eq('restaurant_id', restaurant.id)
          .eq('provider', 'mercadopago')
          .maybeSingle();

        if (configError) throw configError;
        if (!config?.token_cbu && !config?.refresh_token) {
          throw new Error('Este restaurante aún no conectó Mercado Pago. Pedile al local que lo haga en Admin → Settings.');
        }
        if (config.oauth_requires_reconnect) {
          throw new Error('Mercado Pago del restaurante requiere reconexión. Pedile al local que vuelva a autorizar en Admin → Settings.');
        }

        setPaymentAmount(amount);
        setPaymentChargeId(paymentData.chargeId || null);
        try {
          if (paymentData.chargeId) sessionStorage.setItem('splitme_payment_charge_id', paymentData.chargeId);
          else sessionStorage.removeItem('splitme_payment_charge_id');
        } catch (e) {}
        console.log('[DineSplit] Navegando a checkout MP (Brick):', { orderId: activeOrderId, guestId, amount, chargeId: paymentData.chargeId || null });
        const chargeQuery = paymentData.chargeId ? `&chargeId=${encodeURIComponent(paymentData.chargeId)}` : '';
        navigate(`/mp-payment?orderId=${activeOrderId}&guestId=${guestId}&amount=${amount}${chargeQuery}`);
      } catch (err: any) {
        console.error('[DineSplit] Error al iniciar pago MP:', err);
        alert(err.message || 'Error al conectar con Mercado Pago.');
      }
    } else {
      // Para métodos de pago no-Mercado Pago (transferencia, efectivo), procesar directamente
      if (guestId) {
        await handlePaymentSuccess(guestId, paymentData.amount, paymentData.method, undefined, paymentData.chargeId || null);
      }
      clearSession();
      navigateToView('CONFIRMATION'); 
    }
  };

  /** Envía a cocina solo los items de un grupo de categorías. Cada grupo crea su propio batch. */
  const handleSendGroup = async (groupKey: OrderGroupKey) => {
    if (!restaurant || !currentTable || !activeOrderId || !supabase) return;

    const pendingItems = cart.filter(item => {
      const isElegido = item.status === 'elegido' || (!item.status && !item.isConfirmed);
      const isPending = !item.batch_id || batches.some(b => b.id === item.batch_id && b.status === 'CREADO');
      if (!isElegido || !isPending) return false;
      const menuItem = menuItems.find(m => m.id === item.itemId);
      if (!menuItem) return false;
      return getGroupKeyForCategoryId(menuItem.category_id, categories) === groupKey;
    });

    if (pendingItems.length === 0) return;

    setSendingGroup(groupKey);
    try {
      const itemIds = pendingItems.map(i => i.id).filter(id => id && typeof id === 'string' && id.length > 10);
      if (itemIds.length === 0) throw new Error("No hay items válidos para enviar.");

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
          status: 'ENVIADO'
        })
        .select()
        .single();

      if (batchError || !newBatch?.id) throw new Error(`Error al crear batch: ${batchError?.message || 'sin ID'}`);

      const { error: updateError } = await supabase
        .from('order_items')
        .update({ batch_id: newBatch.id, status: 'pedido' })
        .in('id', itemIds)
        .eq('status', 'elegido');
      
      if (updateError) {
        const { error: retryErr } = await supabase
          .from('order_items')
          .update({ batch_id: newBatch.id, status: 'pedido' })
          .in('id', itemIds);
        if (retryErr) throw new Error(`Error al actualizar items: ${retryErr.message}`);
      }

      // Increment times_ordered for each confirmed menu item
      const menuItemCounts: Record<string, number> = {};
      for (const item of pendingItems) {
        const mid = item.itemId as string;
        menuItemCounts[mid] = (menuItemCounts[mid] || 0) + (item.quantity || 1);
      }
      await Promise.all(
        Object.entries(menuItemCounts).map(([menuItemId, qty]) =>
          supabase.rpc('increment_times_ordered', { item_id: menuItemId, qty })
        )
      );

      // total_amount se actualiza por trigger en la BD (excluyendo batches CREADO)
      // No actualizar manualmente para evitar sobrescribir el valor correcto

      await fetchOrderItemsFromDB(activeOrderId);
      const { data: updatedBatches } = await supabase
        .from('order_batches')
        .select('*')
        .eq('order_id', activeOrderId)
        .order('batch_number', { ascending: true });
      if (updatedBatches) setBatches(updatedBatches);
    } catch (err: any) {
      alert(`Error al enviar pedido: ${err.message}`);
    } finally {
      setSendingGroup(null);
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
      '/split-status': 'SPLIT_STATUS',
      '/guest-selection': 'GUEST_SELECTION',
      '/checkout': 'CHECKOUT',
      '/individual-share': 'INDIVIDUAL_SHARE',
      '/mp-payment': 'MP_PAYMENT',
      '/transfer-payment': 'TRANSFER_PAYMENT',
      '/cash-payment': 'CASH_PAYMENT',
      '/tip': 'TIP',
      '/feedback': 'FEEDBACK',
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
      'SPLIT_STATUS': '/split-status',
      'GUEST_SELECTION': '/guest-selection',
      'CHECKOUT': '/checkout',
      'INDIVIDUAL_SHARE': '/individual-share',
      'MP_PAYMENT': '/mp-payment',
      'TRANSFER_PAYMENT': '/transfer-payment',
      'CASH_PAYMENT': '/cash-payment',
      'TIP': '/tip',
      'FEEDBACK': '/feedback',
      'CONFIRMATION': '/confirmation'
    };
    
    const route = routeMap[view] || '/scan';
    const preserveQuery =
      location.search &&
      (view === 'INDIVIDUAL_SHARE' || view === 'MP_PAYMENT' || view === 'TRANSFER_PAYMENT' || view === 'CASH_PAYMENT');
    navigate(preserveQuery ? `${route}${location.search}` : route);
  }, [navigate, location.search]);

  const handleResetPendingSplit = useCallback(async () => {
    if (!supabase || !activeOrderId) {
      navigateToView('SPLIT_BILL');
      return;
    }

    try {
      const { error } = await supabase
        .from('order_guest_charges')
        .delete()
        .eq('order_id', activeOrderId)
        .eq('status', 'pending');

      if (error) {
        console.error("[DineSplit] ❌ Error al resetear división pendiente:", error);
        alert("No se pudo resetear la división. Intenta nuevamente.");
        return;
      }

      setSplitData(null);
      await fetchOrderGuestCharges(activeOrderId);
      navigateToView('SPLIT_BILL');
    } catch (error) {
      console.error("[DineSplit] ❌ Error inesperado al resetear división pendiente:", error);
      alert("No se pudo resetear la división. Intenta nuevamente.");
    }
  }, [activeOrderId, fetchOrderGuestCharges, navigateToView]);

  // Cuando hay pending y el guest pasa a paid (p. ej. por webhook), ir a propina
  useEffect(() => {
    const pm = paymentReturnMessage;
    if (pm?.type !== 'pending' || !pm.waitingGuestId) return;
    const g = guests.find(x => x.id === pm.waitingGuestId);
    if (g?.paid) {
      setPaymentReturnMessage(null);
      navigate('/tip');
    }
  }, [guests, paymentReturnMessage, navigate]);

  // Función para agregar item al carrito y guardarlo inmediatamente en la BD.
  // Los items se insertan con batch_id=null hasta que se envíen por grupo en "Pedir ahora".
  const handleAddToCart = useCallback(async (
    item: MenuItem,
    guestId: string,
    extras: string[],
    removedIngredients: string[],
    variantOptions?: { unitPrice: number; selectedReplaceOptionId?: string | null; selectedAddOptionIds?: string[] }
  ) => {
    if (!activeOrderId || !supabase) {
      console.error("[DineSplit] No hay orden activa o supabase no está disponible");
      return;
    }

    try {
      // Verificar disponibilidad y stock: primero en estado local, luego en BD (tiempo real)
      const localUnavailable = item.availability === false;
      const { data: freshItem } = await supabase
        .from('menu_items')
        .select('availability, stock_quantity')
        .eq('id', item.id)
        .maybeSingle();

      const rawAvail = freshItem?.availability;
      const dbUnavailable = rawAvail === false || rawAvail === 'false' || rawAvail === 0;
      const rawStock = freshItem?.stock_quantity;
      const dbNoStock = rawStock != null && Number(rawStock) < 1;

      if (localUnavailable || dbUnavailable || dbNoStock) {
        setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, availability: false } : m));
        const err = new Error('PRODUCTO_NO_DISPONIBLE');
        throw err;
      }

      const menuItem = menuItems.find(m => m.id === item.id);
      const unitPrice = variantOptions?.unitPrice ?? Number(menuItem?.price || 0);
      
      // Separar: personalización (ingredientsToAdd) -> extras; variantes -> variant_selections
      const ingredientsToAdd = item.customer_customization?.ingredientsToAdd || [];
      const rawVariantSelections = variantOptions?.variantSelections?.length
        ? variantOptions.variantSelections
        : [
            ...(variantOptions?.selectedReplaceOptionId ? [variantOptions.selectedReplaceOptionId] : []),
            ...(variantOptions?.selectedAddOptionIds || [])
          ];
      
      const personalizationFromVariants: string[] = [];
      const variantOnlyIds: string[] = [];
      const groups = getVariantGroups(item);
      const allOpts = groups.flatMap(g => ((g.variant_options ?? (g as any).variant_option) || []) as { id: string; name?: string; price_type?: string }[]);
      
      rawVariantSelections.forEach((id: string) => {
        const opt = allOpts.find((o: any) => o.id === id);
        const isAddOpt = opt && ((opt.price_type || '').toLowerCase() === 'add');
        if (isAddOpt && opt && ingredientsToAdd.some((ing: string) => (ing || '').trim().toLowerCase() === (opt.name || '').trim().toLowerCase())) {
          personalizationFromVariants.push(opt.name || '');
        } else {
          variantOnlyIds.push(id);
        }
      });

      const finalExtras = [...new Set([...extras, ...personalizationFromVariants])].filter(Boolean);
      const variantSelections = variantOnlyIds;

      // Insertar sin batch_id: los items se agrupan por categoría y se envían por separado
      const insertPayload: any = {
        order_id: activeOrderId,
        guest_id: guestId,
        menu_item_id: item.id,
        quantity: 1,
        unit_price: unitPrice,
        extras: finalExtras.length > 0 ? finalExtras : null,
        removed_ingredients: removedIngredients.length > 0 ? removedIngredients : null,
        batch_id: null, // Se asigna al hacer "Pedir ahora" por grupo
        status: 'elegido',
        ...(variantSelections.length > 0 && { variant_selections: variantSelections })
      };
      
      const { data: newItem, error } = await supabase
        .from('order_items')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error("[DineSplit] Error al insertar item:", error);
        throw error;
      }

      if (!newItem || !newItem.id) {
        throw new Error("Error al insertar item: no se recibió un ID válido de la base de datos");
      }

      console.log("[DineSplit] ✅ Item insertado. ID:", newItem.id, "Menu Item ID:", item.id);
      
      setCart(prev => [...prev, {
        id: newItem.id,
        itemId: item.id,
        guestId: guestId,
        quantity: 1,
        order_id: activeOrderId,
        batch_id: null,
        isConfirmed: false,
        status: newItem.status || 'elegido',
        extras: finalExtras,
        removedIngredients,
        unitPrice: variantOptions ? unitPrice : undefined,
        selectedReplaceOptionId: variantOptions?.selectedReplaceOptionId ?? undefined,
        selectedAddOptionIds: variantOnlyIds.filter(id => allOpts.some((o: any) => o.id === id && (o.price_type || '').toLowerCase() === 'add')),
        variant_selections: variantOnlyIds.length > 0 ? variantOnlyIds : undefined
      }]);
    } catch (err: any) {
      if (err?.message === 'PRODUCTO_NO_DISPONIBLE') {
        throw err; // MenuView muestra modal "Producto no disponible" y marca AGOTADO
      }
      console.error("[DineSplit] Error al agregar item al carrito:", err);
      alert(`Error al agregar plato: ${err.message}`);
      throw err;
    }
  }, [activeOrderId, supabase, menuItems]);

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
      if (updates.variant_selections !== undefined) updateData.variant_selections = updates.variant_selections.length > 0 ? updates.variant_selections : [];
      if (updates.unitPrice !== undefined) updateData.unit_price = updates.unitPrice;

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

  const handleRemoveItemFromBatch = useCallback(async (cartItemId: string) => {
    if (!supabase || !activeOrderId) return;
    const item = cart.find(i => i.id === cartItemId);
    const batchId = item?.batch_id ?? null;
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ batch_id: null, status: 'elegido' })
        .eq('id', cartItemId);

      if (error) throw error;

      await fetchOrderItemsFromDB(activeOrderId);

      if (batchId) {
        const { count } = await supabase
          .from('order_items')
          .select('*', { count: 'exact', head: true })
          .eq('batch_id', batchId);
        if (count === 0) {
          await supabase.from('order_batches').delete().eq('id', batchId);
        }
      }

      const { data: updatedBatches } = await supabase
        .from('order_batches')
        .select('*')
        .eq('order_id', activeOrderId)
        .order('batch_number', { ascending: true });
      if (updatedBatches) setBatches(updatedBatches);
    } catch (err: any) {
      console.error("[DineSplit] Error al quitar item del batch:", err);
      alert(`Error al quitar el plato del pedido: ${err.message}`);
    }
  }, [supabase, activeOrderId, fetchOrderItemsFromDB, cart]);

  if (loading && currentView !== 'MENU') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background-dark font-black">
        <div className="size-14 border-[3px] border-white/20 border-t-primary rounded-full animate-spin mb-5"></div>
        <span className="text-white text-lg tracking-widest">SplitMe</span>
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
    <>
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
    <div className="max-w-md mx-auto min-h-screen bg-background-dark shadow-2xl relative flex flex-col overflow-hidden">

      <Routes>
        <Route path="/" element={<Navigate to={`/scan${location.search || ''}`} replace />} />
        <Route path="/scan" element={<ScanView onNext={handleStartSession} restaurantName={undefined} />} />
        <Route path="/guest-info" element={
          <GuestInfoView
            onBack={() => {
              clearSession();
              setRestaurant(null);
              setCurrentTable(null);
              setCurrentWaiter(null);
              setMenuItems([]);
              setCategories([]);
              setActiveOrderId(null);
              setCart([]);
              setBatches([]);
              setGuests([{ id: '1', name: 'Comensal 1 (Tú)', isHost: true }]);
              setActiveGuestId('1');
              navigate('/scan');
            }}
            onNext={async (finalGuests: Guest[], tableFromView: any, restaurantFromView: any) => {
              const hostId = await handleCreateOrderWithGuests(finalGuests, tableFromView, restaurantFromView);
              navigate(`/menu/destacados?guestId=${hostId}`);
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
            sectionHeaders={sectionHeaders}
            restaurant={restaurant}
            table={currentTable}
            waiter={currentWaiter}
            onSaveGuestChanges={handleSaveGuestChanges}
            activeOrderId={activeOrderId}
            identifiedGuestId={getActiveGuestId()}
            pendingGuestSelection={pendingGuestSelection}
            menuItemsReady={menuItemsReady}
            onGuestIdentified={(id) => { setActiveGuestIdCookie(id); setPendingGuestSelection(false); }}
            onRefreshMenuItems={refreshMenuItems}
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
            onSendGroup={handleSendGroup} 
            onPay={() => {
              if (existingSplitStatusData && existingSplitStatusData.length > 0) {
                navigateToView('SPLIT_STATUS');
                return;
              }
              navigateToView('SPLIT_BILL');
            }} 
            sendingGroup={sendingGroup} 
            onUpdateQuantity={(id, d) => handleUpdateCartItem(id, { quantity: Math.max(0, (cart.find(it => it.id === id)?.quantity || 1) + d) })} 
            onRemoveItemFromBatch={handleRemoveItemFromBatch}
            menuItems={menuItems} 
            categories={categories} 
            tableNumber={currentTable?.table_number} 
            waiter={currentWaiter}
            currentGuestId={guestIdParam || getActiveGuestId() || activeGuestId}
            activeOrderId={activeOrderId}
            restaurant={restaurant}
          />
        } />
        <Route path="/progress" element={
          <OrderProgressView 
            cart={cart} 
            batches={batches} 
            activeOrderId={activeOrderId} 
            onNext={() => navigateToView('SPLIT_BILL')} 
            onBack={() => navigateToView('MENU')} 
            onRedirectToFeedback={() => navigate('/tip')} 
            onRemoveItemFromBatch={handleRemoveItemFromBatch}
            tableNumber={currentTable?.table_number} 
            menuItems={menuItems}
            categories={categories}
          />
        } />
        <Route path="/split-status" element={
          <SplitStatusView
            guests={guests}
            splitData={existingSplitStatusData}
            cart={cartForSplit}
            menuItems={menuItems}
            orderGuestCharges={orderGuestCharges}
            onBack={() => navigateToView('ORDER_SUMMARY')}
            onContinuePayment={() => navigateToView('CHECKOUT')}
            onNewSplit={() => navigateToView('SPLIT_BILL')}
            onGoToMenu={() => navigateToView('MENU')}
            onChangeSplit={handleResetPendingSplit}
          />
        } />
        <Route path="/split-bill" element={
          <SplitBillView 
            guests={guests} 
            cart={cartForSplit} 
            batches={batches}
            onBack={() => navigateToView('ORDER_SUMMARY')} 
            onGoToMenu={() => navigateToView('MENU')}
            onConfirm={async (shares) => { 
              console.log("[DineSplit] Confirmar División clickeado. Shares recibidos:", shares);
              const savedShares = await handleSaveSplitAmounts(shares);
              if (savedShares) {
                setSplitData(savedShares);
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
            cart={cartForSplit} 
            menuItems={menuItems} 
            splitData={activeSplitData} 
            activeOrderId={activeOrderId}
            onSelectGuest={(guestId) => { 
              navigate(`/individual-share?orderId=${activeOrderId || ''}&guestId=${guestId}`);
            }} 
            restaurant={restaurant} 
          />
        } />
        <Route path="/join-table" element={
          <JoinTableView
            guests={guests}
            activeOrderId={activeOrderId}
            table={currentTable}
            restaurant={restaurant}
            onSelectGuest={(guestId) => {
              setActiveGuestId(guestId);
              setActiveGuestIdCookie(guestId);
            }}
            onAddGuest={handleAddGuestForJoin}
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
            onNavigateToTip={() => navigate('/tip')}
            cart={cartForSplit} 
            guests={guests} 
            menuItems={menuItems} 
            tableNumber={currentTable?.table_number} 
            splitData={activeSplitData} 
            activeOrderId={activeOrderId}
            currentGuestId={guestIdParam || activeGuestId}
          />
        } />
        <Route path="/individual-share" element={
          <IndividualShareView 
            onBack={() => {
              navigate('/checkout', { replace: true });
            }} 
            onPay={handlePayIndividual}
            onShowTransfer={(amount, chargeId) => {
              setPaymentAmount(amount);
              setPaymentChargeId(chargeId || null);
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
            onShowCash={(amount, guestName, chargeId) => {
              setPaymentAmount(amount);
              setPaymentChargeId(chargeId || null);
              setPaymentGuestName(guestName);
              navigateToView('CASH_PAYMENT');
            }}
            onUpdatePaymentMethod={updatePaymentMethod}
            paymentReturnMessage={paymentReturnMessage}
            onDismissPaymentMessage={() => setPaymentReturnMessage(null)}
            cart={cartForSplit} 
            menuItems={menuItems} 
            splitData={activeSplitData} 
            restaurant={restaurant} 
            guests={guests} 
          />
        } />
        <Route path="/mp-payment" element={
          <MercadoPagoPaymentView
            amount={mpPaymentAmount > 0 ? mpPaymentAmount : 0}
            restaurantId={restaurant?.id || ''}
            orderId={activeOrderId || ''}
            guestId={guestIdParam || activeGuestId || ''}
            chargeId={mpPaymentChargeId}
            onBack={() => navigateToView('INDIVIDUAL_SHARE')}
            onApproved={async (paymentId) => {
              const gid = guestIdParam || activeGuestId;
              const amountToRegister = mpPaymentAmount > 0 ? mpPaymentAmount : paymentAmount;
              if (gid && amountToRegister) {
                await handlePaymentSuccess(gid, amountToRegister, 'mercadopago', String(paymentId), mpPaymentChargeId);
                setPaymentChargeId(null);
                try { sessionStorage.removeItem('splitme_payment_charge_id'); } catch (e) {}
              }
              navigate('/tip');
            }}
            onError={(message) => alert(message)}
          />
        } />
        <Route path="/transfer-payment" element={
          <TransferPaymentView
            onBack={() => navigateToView('INDIVIDUAL_SHARE')}
            amount={paymentAmount || 0}
            restaurant={restaurant}
            guestId={guestIdParam || activeGuestId}
            orderId={activeOrderId || ''}
            chargeId={paymentChargeId || activeSplitData?.find(s => s.id === (guestIdParam || activeGuestId))?.charge_id || null}
            externalPaid={guests.find(g => g.id === (guestIdParam || activeGuestId))?.paid || false}
          />
        } />
        <Route path="/cash-payment" element={
          <CashPaymentView 
            onBack={() => navigateToView('INDIVIDUAL_SHARE')}
            onNext={() => navigate('/tip')}
            amount={(() => {
              // Calcular el amount basándose en el guestId de la URL o activeGuestId
              const targetGuestId = guestIdParam || activeGuestId;
              if (targetGuestId) {
                // Buscar en splitData primero
                if (activeSplitData) {
                  const guestShare = activeSplitData.find(s => s.id === targetGuestId);
                  if (guestShare?.total) {
                    return guestShare.total;
                  }
                }
                // Si no está en splitData, buscar en guests
                const targetGuest = guests.find(g => g.id === targetGuestId);
                if (targetGuest?.individualAmount) {
                  return targetGuest.individualAmount;
                }
                // Si no hay individualAmount, calcular desde el cart (solo items enviados)
                const guestCartItems = cartForSplit.filter(item => item.guestId === targetGuestId);
                const calculatedAmount = guestCartItems.reduce((sum, item) => {
                  const menuItem = menuItems.find(m => m.id === item.itemId);
                  const unitPrice = item.unitPrice ?? (menuItem?.price ?? 0);
                  return sum + unitPrice * item.quantity;
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
        <Route path="/tip" element={
          <TipView
            onNext={() => navigate('/feedback')}
            onSkip={() => navigate('/feedback')}
            cart={cartForSplit}
            menuItems={menuItems}
            guestPaidAmount={(() => {
              const targetGuestId = guestIdParam || getActiveGuestId() || activeGuestId;
              const targetGuest = guests.find(g => g.id === targetGuestId);
              if (targetGuest?.individualAmount != null) return targetGuest.individualAmount;
              const guestShare = activeSplitData?.find(s => s.id === targetGuestId);
              if (guestShare?.total != null) return guestShare.total;
              return null;
            })()}
            currentGuestId={guestIdParam || getActiveGuestId() || activeGuestId}
            waiter={currentWaiter}
            restaurant={restaurant}
          />
        } />
        <Route path="/feedback" element={
          <FeedbackView
            onNext={() => navigate('/confirmation')}
            onSkip={() => navigate('/confirmation')}
            cart={cartForSplit}
            menuItems={menuItems}
            waiter={currentWaiter}
            restaurant={restaurant}
          />
        } />
        <Route path="/confirmation" element={
          <ConfirmationView 
            onRestart={() => { 
              const oid = activeOrderId || orderIdParam;
              const gid = guestIdParam || getActiveGuestId() || activeGuestId;
              if (oid && gid) {
                navigate(`/individual-share?orderId=${oid}&guestId=${gid}`);
              } else {
                clearSession();
                navigate('/scan');
              }
            }}
            onBackToStart={() => {
              clearSession();
              navigate('/scan');
            }}
            guests={guests} 
            splitData={confirmationSplitData}
            tableNumber={currentTable?.table_number}
            activeOrderId={activeOrderId}
            currentGuestId={guestIdParam || activeGuestId}
            waiter={currentWaiter}
          />
        } />
        <Route path="*" element={<Navigate to="/scan" replace />} />
      </Routes>
      <BuildBadge />
    </div>
    </>
  );
};

export default App;
