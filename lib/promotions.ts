import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { formatPrice } from './currency';
import type { OrderItem } from '../types';

export type PromotionType = 'nxm' | 'percent' | 'fixed_price' | 'amount_off' | 'second_unit';

export interface Promotion {
  id: string;
  restaurant_id: string;
  name: string;
  type: PromotionType;
  buy_qty: number | null;
  pay_qty: number | null;
  percent: number | null;
  amount: number | null;
  fixed_price: number | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  /** 0 = domingo. null/vacío = todos los días */
  days_of_week: number[] | null;
  /** 'HH:MM:SS'. null = todo el día. start > end = cruza medianoche */
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

export interface PromotionMenuItem {
  promotion_id: string;
  menu_item_id: string;
}

const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const arClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: AR_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const getArgentinaClock = (now: Date) => {
  const parts = arClockFormatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '0';
  return {
    dow: WEEKDAYS.indexOf(get('weekday')),
    seconds: (Number(get('hour')) % 24) * 3600 + Number(get('minute')) * 60 + Number(get('second')),
  };
};

const timeToSeconds = (time: string) => {
  const [h = '0', m = '0', s = '0'] = time.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Math.floor(Number(s));
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const formatPercent = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** Misma regla que promotion_is_live() en la DB. */
export const isPromotionLive = (p: Promotion, now: Date = new Date()): boolean => {
  if (!p.active) return false;
  const ts = now.getTime();
  if (p.starts_at && ts < new Date(p.starts_at).getTime()) return false;
  if (p.ends_at && ts >= new Date(p.ends_at).getTime()) return false;

  const needsClock = (p.days_of_week?.length ?? 0) > 0 || (p.start_time && p.end_time);
  if (!needsClock) return true;
  const clock = getArgentinaClock(now);

  if (p.days_of_week && p.days_of_week.length > 0 && !p.days_of_week.map(Number).includes(clock.dow)) return false;

  if (p.start_time && p.end_time) {
    const start = timeToSeconds(p.start_time);
    const end = timeToSeconds(p.end_time);
    if (start <= end) return clock.seconds >= start && clock.seconds < end;
    return clock.seconds >= start || clock.seconds < end;
  }
  return true;
};

/** Si varias promos vigentes cubren el producto, gana la creada más recientemente. */
export const getLivePromotionForItem = (
  menuItemId: string,
  promotions: Promotion[],
  links: PromotionMenuItem[],
  now: Date = new Date()
): Promotion | null => {
  const promoIds = new Set(links.filter(l => l.menu_item_id === menuItemId).map(l => l.promotion_id));
  let winner: Promotion | null = null;
  for (const p of promotions) {
    if (!promoIds.has(p.id) || !isPromotionLive(p, now)) continue;
    if (!winner || new Date(p.created_at).getTime() > new Date(winner.created_at).getTime()) winner = p;
  }
  return winner;
};

export const buildLivePromotionMap = (
  promotions: Promotion[],
  links: PromotionMenuItem[],
  now: Date = new Date()
): Map<string, Promotion> => {
  const map = new Map<string, Promotion>();
  const menuItemIds = new Set(links.map(l => l.menu_item_id));
  menuItemIds.forEach(id => {
    const promo = getLivePromotionForItem(id, promotions, links, now);
    if (promo) map.set(id, promo);
  });
  return map;
};

/** Promos que cambian el precio de cada unidad (nxm / second_unit dependen de cuántas pide la mesa). */
export const isPerUnitPromotion = (p: Promotion) =>
  p.type === 'percent' || p.type === 'amount_off' || p.type === 'fixed_price';

/** Misma regla que promo_unit_price() en la DB. `base` = precio base del producto (menu_items.price). */
export const promoUnitPrice = (p: Promotion, list: number, base: number = list): number => {
  let price = list;
  if (p.type === 'percent') price = list * (1 - Number(p.percent || 0) / 100);
  else if (p.type === 'amount_off') price = list - Number(p.amount || 0);
  else if (p.type === 'fixed_price') price = list - Math.max(0, base - Number(p.fixed_price || 0));
  return Math.max(0, round2(price));
};

export const promoBadgeLabel = (p: Promotion): string => {
  switch (p.type) {
    case 'nxm':
      return `${p.buy_qty}x${p.pay_qty}`;
    case 'percent':
      return `${formatPercent(Number(p.percent || 0))}% OFF`;
    case 'second_unit':
      return Number(p.percent) >= 100 ? '2da gratis' : `2da al ${formatPercent(Number(p.percent || 0))}%`;
    case 'amount_off':
      return `$${formatPrice(Number(p.amount || 0))} OFF`;
    default:
      return 'Promo';
  }
};

/** Texto corto para las promos grupales (cuentan las unidades de toda la mesa). */
export const promoHint = (p: Promotion): string | null => {
  if (p.type === 'nxm') return `Llevá ${p.buy_qty}, pagá ${p.pay_qty} · se suma con lo que pide la mesa`;
  if (p.type === 'second_unit') {
    const pct = Number(p.percent || 0);
    return `${pct >= 100 ? '2da unidad gratis' : `2da unidad al ${formatPercent(pct)}%`} · se suma con lo que pide la mesa`;
  }
  return null;
};

/** Precio de lista por unidad si la línea del carrito tiene una promo aplicada; null si no hay descuento. */
export const getDiscountedListUnitPrice = (item: Pick<OrderItem, 'promotionId' | 'listUnitPrice' | 'unitPrice'>): number | null => {
  if (!item.promotionId || item.listUnitPrice == null || item.unitPrice == null) return null;
  return item.listUnitPrice > item.unitPrice + 0.004 ? item.listUnitPrice : null;
};

export interface GroupPromoNudge {
  missing: number;
  totalUnits: number;
  totalPrice: number;
}

/** Cuántas unidades faltan en la mesa para completar la próxima promo grupal (nxm / second_unit). Misma cuenta que recompute_order_promotions(). */
export const getGroupPromoNudge = (p: Promotion, tableUnits: number, listUnitPrice: number): GroupPromoNudge | null => {
  if (tableUnits <= 0) return null;
  if (p.type === 'nxm') {
    const buy = Number(p.buy_qty || 0);
    const pay = Number(p.pay_qty || 0);
    if (buy < 2) return null;
    const remainder = tableUnits % buy;
    if (remainder === 0) return null;
    const totalUnits = tableUnits + (buy - remainder);
    const totalPrice = round2(totalUnits * listUnitPrice - Math.floor(totalUnits / buy) * (buy - pay) * listUnitPrice);
    return { missing: buy - remainder, totalUnits, totalPrice };
  }
  if (p.type === 'second_unit') {
    if (tableUnits % 2 === 0) return null;
    const totalUnits = tableUnits + 1;
    const totalPrice = round2(totalUnits * listUnitPrice - (totalUnits / 2) * listUnitPrice * Number(p.percent || 0) / 100);
    return { missing: 1, totalUnits, totalPrice };
  }
  return null;
};

/** Promos por id (las que ya quedaron asignadas a ítems del pedido, estén o no vigentes ahora). */
export const usePromotionsByIds = (ids: string[]): Map<string, Promotion> => {
  const key = Array.from(new Set(ids)).sort().join(',');
  const [promotions, setPromotions] = useState<Map<string, Promotion>>(new Map());

  useEffect(() => {
    if (!key) {
      setPromotions(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('promotions').select('*').in('id', key.split(','));
      if (cancelled) return;
      if (error) {
        console.warn('[DineSplit] Error al cargar promociones del pedido:', error);
        return;
      }
      setPromotions(new Map(((data || []) as Promotion[]).map(p => [p.id, p])));
    })();
    return () => { cancelled = true; };
  }, [key]);

  return promotions;
};

/** Promos vigentes por menu_item_id. Se re-evalúa cada minuto para que las franjas horarias aparezcan/desaparezcan solas. */
export const useLivePromotions = (restaurantId?: string | null): Map<string, Promotion> => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [links, setLinks] = useState<PromotionMenuItem[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!restaurantId) {
      setPromotions([]);
      setLinks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: promoData, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('active', true);
      if (cancelled) return;
      if (error) {
        console.warn('[DineSplit] Error al cargar promociones:', error);
        return;
      }
      const promos = (promoData || []) as Promotion[];
      if (promos.length === 0) {
        setPromotions([]);
        setLinks([]);
        return;
      }
      const { data: linkData, error: linkError } = await supabase
        .from('promotion_menu_items')
        .select('promotion_id, menu_item_id')
        .in('promotion_id', promos.map(p => p.id));
      if (cancelled) return;
      if (linkError) {
        console.warn('[DineSplit] Error al cargar productos en promoción:', linkError);
        return;
      }
      setPromotions(promos);
      setLinks((linkData || []) as PromotionMenuItem[]);
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    const onVisible = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return useMemo(() => buildLivePromotionMap(promotions, links, now), [promotions, links, now]);
};
