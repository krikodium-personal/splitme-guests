
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Guest, MenuItem, MenuSectionHeader, OrderItem, VariantGroup, VariantOption } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import WaiterRequestModal from './WaiterRequestModal';
import { getVariantGroups } from '../lib/variantDisplay';
import { supabase } from '../lib/supabase';

interface MenuViewProps {
  guests: Guest[];
  setGuests: React.Dispatch<React.SetStateAction<Guest[]>>;
  cart: OrderItem[];
  onAddToCart: (item: MenuItem, guestId: string, extras: string[], removedIngredients: string[], variantOptions?: { unitPrice: number; selectedReplaceOptionId?: string | null; selectedAddOptionIds?: string[]; variantSelections?: string[] }) => Promise<void>;
  onUpdateCartItem: (cartItemId: string, updates: Partial<OrderItem>) => void;
  onNext: () => void;
  onIndividualShare: () => void;
  selectedGuestId: string;
  onSelectGuest: (id: string) => void;
  initialCategory: string;
  onCategoryChange: (cat: string) => void;
  editingCartItem: OrderItem | null;
  onCancelEdit: () => void;
  menuItems: MenuItem[];
  categories: any[];
  sectionHeaders?: MenuSectionHeader[];
  table?: any;
  restaurant?: any;
  waiter?: any;
  onSaveGuestChanges?: (updatedGuests: Guest[], newGuests: Guest[]) => Promise<boolean>;
  activeOrderId?: string | null;
  /** ID del comensal con el que esta sesión se identifica (cookie). Si se agrega a otro, se muestra alerta. */
  identifiedGuestId?: string | null;
  /** Si es true, se abre Administrar comensales para que el usuario elija quién es (p. ej. tras refresh sin cookie válida). */
  pendingGuestSelection?: boolean;
  /** Se llama cuando el usuario elige su comensal en el modal (junto con onSelectGuest). Actualiza cookie y limpia pending. */
  onGuestIdentified?: (guestId: string) => void;
  /** Refresca disponibilidad y stock de productos al cambiar sección/subsección (tiempo real). */
  onRefreshMenuItems?: () => Promise<void>;
}

export const formatPrice = (price: number) => {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

const renderNutritionalValue = (value: number | null | undefined, unit: string) => {
  const isNull = value === null || value === undefined;
  if (isNull) return <span className="text-white/20 italic font-medium tracking-wide">N/A</span>;
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="text-xl font-black text-white leading-none">{value}</span>
      <span className="text-[10px] font-bold text-text-secondary">{unit}</span>
    </div>
  );
};

const NutritionalItem = ({ label, value, unit, isPrimary = false }: { label: string, value: any, unit: string, isPrimary?: boolean }) => (
  <div className={`flex flex-col border-l-2 ${isPrimary ? 'border-primary' : 'border-white/10'} pl-4 py-1`}>
    <span className="text-[10px] font-medium text-white/40 mb-1.5">{label}</span>
    {renderNutritionalValue(value, unit)}
  </div>
);

const getDietaryTagConfig = (tag: string) => {
  const normalizedTag = tag.toLowerCase();
  
  if (normalizedTag.includes('spicy') || normalizedTag.includes('picante')) {
    return {
      bgColor: 'bg-red-950/60',
      textColor: 'text-red-300',
      borderColor: 'border-red-800/40',
      icon: 'local_fire_department',
      label: tag
    };
  } else if (normalizedTag.includes('popular') || normalizedTag.includes('firma')) {
    return {
      bgColor: 'bg-white/5',
      textColor: 'text-white',
      borderColor: 'border-white/10',
      icon: 'star',
      label: tag
    };
  } else if (normalizedTag.includes('saludable') || normalizedTag.includes('healthy')) {
    return {
      bgColor: 'bg-white/5',
      textColor: 'text-green-300',
      borderColor: 'border-green-800/40',
      icon: 'eco',
      label: tag
    };
  } else if (normalizedTag.includes('gluten') || normalizedTag.includes('gluten-free')) {
    return {
      bgColor: 'bg-white/5',
      textColor: 'text-white',
      borderColor: 'border-white/10',
      icon: null,
      label: tag
    };
  } else if (normalizedTag.includes('vegano') || normalizedTag.includes('vegan')) {
    return {
      bgColor: 'bg-white/5',
      textColor: 'text-green-300',
      borderColor: 'border-green-800/40',
      icon: 'restaurant',
      label: tag
    };
  }
  
  // Default styling
  return {
    bgColor: 'bg-white/5',
    textColor: 'text-white',
    borderColor: 'border-white/10',
    icon: null,
    label: tag
  };
};

// Helper functions para convertir entre nombres y slugs
const categoryToSlug = (categoryName: string): string => {
  return categoryName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9]+/g, '-') // Reemplazar espacios y caracteres especiales con guiones
    .replace(/^-+|-+$/g, ''); // Remover guiones al inicio y final
};

const slugToCategory = (slug: string, categories: any[]): string | null => {
  const normalizedSlug = slug.toLowerCase();
  // Buscar en categorías principales
  const category = categories.find(c => 
    c.parent_id === null && categoryToSlug(c.name) === normalizedSlug
  );
  if (category) return category.name;
  
  if (normalizedSlug === 'inicio') return 'Inicio';
  
  return null;
};

const subcategorySlugToId = (slug: string, categories: any[], parentCategoryName: string): string | null => {
  const parentCat = categories.find(c => c.name === parentCategoryName && c.parent_id === null);
  if (!parentCat) return null;
  
  const subcategory = categories.find(c => 
    c.parent_id === parentCat.id && categoryToSlug(c.name) === slug.toLowerCase()
  );
  return subcategory?.id || null;
};

interface CustomSelectOption { id: string; label: string; }
interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  hasError?: boolean;
}
const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, placeholder, onChange, hasError }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left font-bold focus:outline-none focus:ring-2 transition-all ${
          hasError
            ? 'border-2 border-red-500 focus:ring-red-500 bg-white/5'
            : 'border border-white/10 focus:ring-primary bg-white/5'
        } ${selected ? 'text-white' : 'text-white/40'}`}
      >
        <span className="truncate text-sm">{selected ? selected.label : (placeholder || 'Seleccione una opción')}</span>
        <span className={`material-symbols-outlined text-base text-white/50 ml-2 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-2 z-[200] bg-[#1A1816] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in">
          {placeholder && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm text-white/40 hover:bg-white/5 transition-colors border-b border-white/5"
            >
              {placeholder}
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className={`w-full text-left px-4 py-3.5 text-sm font-medium transition-colors ${
                opt.id === value
                  ? 'bg-primary/15 text-primary'
                  : 'text-white hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const MenuView: React.FC<MenuViewProps> = ({
  guests, setGuests, cart, onAddToCart, onUpdateCartItem, onNext, 
  selectedGuestId, onSelectGuest, initialCategory, onCategoryChange, 
  editingCartItem, onCancelEdit, menuItems, categories: supabaseCategories,
  sectionHeaders = [], table, restaurant, waiter, onSaveGuestChanges, activeOrderId, identifiedGuestId, pendingGuestSelection, onGuestIdentified, onRefreshMenuItems
}) => {
  const { category: categorySlug, subcategory: subcategorySlug } = useParams<{ category?: string; subcategory?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [showDetail, setShowDetail] = useState<MenuItem | null>(null);
  const [isManageGuestsOpen, setIsManageGuestsOpen] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedIngredientsToRemove, setSelectedIngredientsToRemove] = useState<string[]>([]);
  const [newGuestName, setNewGuestName] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  const [banners, setBanners] = useState<{ id: string; image_url: string; title: string | null; description: string | null }[]>([]);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const bannerScrollRef = useRef<HTMLDivElement>(null);
  const [selectedReplaceOptionId, setSelectedReplaceOptionId] = useState<string | null>(null);
  const [selectedReplaceOptionIds, setSelectedReplaceOptionIds] = useState<Record<string, string[]>>({}); // Para grupos con selection=multiple
  const [selectedAddOptionIds, setSelectedAddOptionIds] = useState<string[]>([]);

  /** Imagen del producto o logo del restaurante como fallback cuando no hay imagen. */
  const getItemImageUrl = (imageUrl?: string | null) => (imageUrl || '').trim() || restaurant?.logo_url || '';

  // Debug: Log waiter data
  useEffect(() => {
    console.log('[MenuView] Waiter data:', waiter);
    console.log('[MenuView] Will show button?', !!waiter);
  }, [waiter]);
  
  // Sincronizar categoría desde la URL solo cuando cambia la URL (no al hacer click en categoría)
  // Dependemos solo de categorySlug para no re-ejecutar cuando el usuario cambia por estado.
  useEffect(() => {
    if (categorySlug) {
      const categoryName = slugToCategory(categorySlug, supabaseCategories);
      if (categoryName) onCategoryChange(categoryName);
    } else {
      navigate('/menu/inicio', { replace: true });
    }
  }, [categorySlug, supabaseCategories, onCategoryChange, navigate]);

  // Sincronizar subcategoría desde la URL solo cuando cambia la URL
  useEffect(() => {
    if (subcategorySlug && initialCategory) {
      const subcategoryId = subcategorySlugToId(subcategorySlug, supabaseCategories, initialCategory);
      if (subcategoryId) setSelectedSubcategory(subcategoryId);
    } else if (!subcategorySlug) {
      setSelectedSubcategory(null);
    }
  }, [subcategorySlug, initialCategory, supabaseCategories]);

  // Refrescar disponibilidad y stock al entrar a una sección o subsección (tiempo real)
  useEffect(() => {
    onRefreshMenuItems?.();
  }, [initialCategory, selectedSubcategory, onRefreshMenuItems]);

  useEffect(() => {
    if (!restaurant?.id) return;
    supabase.from('banners').select('id, image_url, title, description').eq('restaurant_id', restaurant.id).eq('active', true).order('sort_order').then(({ data }) => {
      if (data?.length) setBanners(data);
    });
  }, [restaurant?.id]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setActiveBannerIndex(i => {
        const next = (i + 1) % banners.length;
        bannerScrollRef.current?.scrollTo({ left: bannerScrollRef.current.offsetWidth * next, behavior: 'smooth' });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [banners.length]);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const guestsRowRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef(0);
  const lastTouchYRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastGestureTimeRef = useRef(0);
  const headerBlockRef = useRef<HTMLDivElement | null>(null);
  const headerHoveredRef = useRef(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(320);
  const [scrollTop, setScrollTop] = useState(0);
  const [backupNames, setBackupNames] = useState<Record<string, string>>({});
  const [originalGuests, setOriginalGuests] = useState<Guest[]>([]);
  const [pendingNewGuests, setPendingNewGuests] = useState<Guest[]>([]);
  const [addingItems, setAddingItems] = useState<Set<string>>(new Set()); // Track items being added
  const [showQrModal, setShowQrModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [requiredVariantError, setRequiredVariantError] = useState(false);
  const [showUnavailableModal, setShowUnavailableModal] = useState(false);

  const tableCapacity = table?.capacity || 10;

  // Filtrar el carrito específico del comensal activo (incluye pendientes y confirmados de la DB)
  const guestSpecificCart = useMemo(() => {
    const filtered = cart.filter(item => item.guestId === selectedGuestId);
    if (filtered.length > 0 || cart.length > 0) {
      console.log("[MenuView] selectedGuestId:", selectedGuestId);
      console.log("[MenuView] Total items en cart:", cart.length);
      console.log("[MenuView] Items filtrados para guest:", filtered.length);
      console.log("[MenuView] Guest IDs en cart:", [...new Set(cart.map(i => i.guestId))]);
    }
    return filtered;
  }, [cart, selectedGuestId]);

  // Encontrar si el producto ya existe en el pedido del comensal actual
  const existingInCart = useMemo(() => {
    if (!showDetail) return null;
    if (editingCartItem && editingCartItem.itemId === showDetail.id) return editingCartItem;
    return guestSpecificCart.find(i => i.itemId === showDetail.id && (i.status === 'elegido' || (!i.status && !i.isConfirmed)));
  }, [showDetail, guestSpecificCart, editingCartItem]);

  useEffect(() => {
    if (editingCartItem) {
      const item = menuItems.find(m => m.id === editingCartItem.itemId);
      if (item) handleOpenPdp(item);
    }
  }, [editingCartItem, menuItems]);

  // Recargar personalizaciones y variantes cuando cambia el comensal seleccionado
  useEffect(() => {
    if (showDetail) {
      const existing = guestSpecificCart.find(i => i.itemId === showDetail.id && (i.status === 'elegido' || (!i.status && !i.isConfirmed)));
      setSelectedExtras(existing?.extras || []);
      setSelectedIngredientsToRemove(existing?.removedIngredients || []);
      if (existing?.selectedReplaceOptionId || existing?.selectedAddOptionIds?.length || (existing?.variant_selections?.length ?? 0) > 0) {
        setSelectedReplaceOptionId(existing.selectedReplaceOptionId ?? null);
        setSelectedAddOptionIds(existing.selectedAddOptionIds ?? []);
        const vg = (showDetail.variant_groups || []).filter((g: any) => (g.variant_options || g.variant_option || []).some((o: any) => (o.price_type || '').toLowerCase() === 'replace'));
        const byGroup: Record<string, string[]> = {};
        const idsToParse = existing.variant_selections?.length ? existing.variant_selections : (existing.selectedReplaceOptionId ? [existing.selectedReplaceOptionId] : []);
        idsToParse.forEach((id: string) => {
          for (const g of vg) {
            const opts = g.variant_options || g.variant_option || [];
            if (opts.some((o: any) => o.id === id)) {
              byGroup[g.id] = [...(byGroup[g.id] || []), id];
              break;
            }
          }
        });
        setSelectedReplaceOptionIds(byGroup);
      } else {
      const replaceGroups = (showDetail.variant_groups || []).filter(g =>
        (g.variant_options || []).some((o: VariantOption) => (o.price_type || '').toLowerCase() === 'replace')
      );
        const firstGroup = replaceGroups[0];
        const hasRequired = firstGroup && isRequiredGroup(firstGroup);
        setSelectedReplaceOptionId(hasRequired ? null : (firstGroup?.variant_options?.[0]?.id ?? null));
        setSelectedReplaceOptionIds({});
        setSelectedAddOptionIds([]);
      }
    } else {
      setSelectedExtras([]);
      setSelectedIngredientsToRemove([]);
    }
  }, [selectedGuestId, showDetail, guestSpecificCart]);

  // Sincronizar showDetail con menuItems cuando cambian (ej. producto marcado como AGOTADO tras intentar agregar)
  useEffect(() => {
    if (showDetail) {
      const updated = menuItems.find(m => m.id === showDetail.id);
      if (updated) setShowDetail(updated);
    }
  }, [menuItems]);

  // Resetear subcategoría cuando cambia la categoría principal
  useEffect(() => {
    setSelectedSubcategory(null);
  }, [initialCategory]);

  // Scroll al inicio del contenido al cambiar categoría o subcategoría
  useEffect(() => {
    mainScrollRef.current?.scrollTo(0, 0);
    setHeaderHidden(false);
    lastScrollYRef.current = 0;
    setScrollTop(0);
  }, [initialCategory, selectedSubcategory]);

  // Header: ocultar en scroll down, mostrar en scroll up.
  // Wheel y touch = intención inmediata. Scroll = fallback pero ignorado 200ms tras gesto (evita inercia).
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const applyFromGesture = (hidden: boolean) => {
      lastGestureTimeRef.current = Date.now();
      if (hidden && headerHoveredRef.current) return;
      setHeaderHidden(hidden);
    };
    const onScroll = () => {
      const y = el.scrollTop;
      const prev = lastScrollYRef.current;
      lastScrollYRef.current = y;
      setScrollTop(y);
      if (Date.now() - lastGestureTimeRef.current < 200) return;
      if (y > prev && y > 10) {
        if (!headerHoveredRef.current) setHeaderHidden(true);
      } else if (y < prev) setHeaderHidden(false);
      if (y < 10) setHeaderHidden(false);
    };
    const onWheel = (e: WheelEvent) => {
      if (!el.contains(e.target as Node)) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaY) < 2) return;
      applyFromGesture(e.deltaY > 0);
    };
    const onWheelDoc = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaY) < 2) return;
      applyFromGesture(e.deltaY > 0);
    };
    const onTouchStart = (e: TouchEvent) => {
      lastTouchYRef.current = e.touches[0]?.clientY ?? 0;
      lastTouchXRef.current = e.touches[0]?.clientX ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      const x = e.touches[0]?.clientX ?? 0;
      const dy = y - lastTouchYRef.current;
      const dx = x - lastTouchXRef.current;
      lastTouchYRef.current = y;
      lastTouchXRef.current = x;
      if (Math.abs(dx) > Math.abs(dy)) return;
      if (Math.abs(dy) < 4) return;
      applyFromGesture(dy < 0);
    };
    const touchOpts = { passive: true, capture: true } as const;
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('wheel', onWheelDoc, { passive: true, capture: true });
    document.addEventListener('touchstart', onTouchStart, touchOpts);
    document.addEventListener('touchmove', onTouchMove, touchOpts);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      document.removeEventListener('wheel', onWheelDoc, { capture: true });
      document.removeEventListener('touchstart', onTouchStart, touchOpts);
      document.removeEventListener('touchmove', onTouchMove, touchOpts);
    };
  }, []);

  // Hacer scroll al comensal seleccionado en la fila de guests (p. ej. tras recuperar sesión al refrescar)
  useEffect(() => {
    if (!selectedGuestId || guests.length === 0) return;
    const el = guestsRowRef.current?.querySelector<HTMLElement>(`[data-guest-id="${selectedGuestId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedGuestId, guests]);

  // Abrir Administrar comensales cuando se debe elegir quién es (p. ej. tras refresh sin cookie válida)
  useEffect(() => {
    if (pendingGuestSelection) setIsManageGuestsOpen(true);
  }, [pendingGuestSelection]);

  const categoriesList = useMemo(() => {
    const dbCategories = (supabaseCategories || [])
      .filter(c => c.parent_id === null)
      .map(c => c.name);
    const filteredDbCats = dbCategories.filter(cat => !['destacados', 'inicio'].includes(cat.toLowerCase()));
    return ['Inicio', ...filteredDbCats];
  }, [supabaseCategories]);

  // Cantidad total de productos por comensal (todos los estados: elegido + pedido)
  const guestItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    guests.forEach(g => {
      counts[g.id] = cart
        .filter(i => i.guestId === g.id)
        .reduce((sum, i) => sum + i.quantity, 0);
    });
    return counts;
  }, [guests, cart]);

  // Cantidad total acumulada por categoría ESPECÍFICA del comensal seleccionado
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categoriesList.forEach(catName => {
      const catObj = supabaseCategories.find(c => c.name === catName);
      if (!catObj && catName !== 'Inicio') return;

      const subIds = catObj ? supabaseCategories.filter(c => c.parent_id === catObj.id).map(c => c.id) : [];
      const validIds = catObj ? [catObj.id, ...subIds] : [];

      counts[catName] = guestSpecificCart.reduce((sum, cartItem) => {
        const menuItem = menuItems.find(m => m.id === cartItem.itemId);
        if (catName === 'Inicio') return menuItem?.is_featured ? sum + cartItem.quantity : sum;
        return menuItem && validIds.includes(menuItem.category_id) ? sum + cartItem.quantity : sum;
      }, 0);
    });
    return counts;
  }, [guestSpecificCart, categoriesList, menuItems, supabaseCategories]);

  const getDishQuantityForGuest = (itemId: string) => guestSpecificCart.filter(item => item.itemId === itemId).reduce((sum, item) => sum + item.quantity, 0);
  
  const getSimpleCartItemForGuest = (itemId: string) => {
    return guestSpecificCart.find(item => 
      item.itemId === itemId && 
      (item.status === 'elegido' || (!item.status && !item.isConfirmed)) &&
      (!item.extras || item.extras.length === 0) && 
      (!item.removedIngredients || item.removedIngredients.length === 0)
    );
  };

  const pendingCount = cart.filter(item => item.status === 'elegido' || (!item.status && !item.isConfirmed)).reduce((sum, item) => sum + item.quantity, 0);
  const totalSessionPrice = cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    const unitPrice = item.unitPrice ?? (menuItem ? Number(menuItem.price) : 0);
    return sum + unitPrice * item.quantity;
  }, 0);

  const handleOpenPdp = (item: MenuItem) => {
    setRequiredVariantError(false);
    setShowDetail(item);
    // Preferir editingCartItem si estamos editando uno específico; sino buscar en el carrito
    const existing = (editingCartItem && editingCartItem.itemId === item.id)
      ? editingCartItem
      : guestSpecificCart.find(i => i.itemId === item.id && (i.status === 'elegido' || (!i.status && !i.isConfirmed)));
    setSelectedExtras(existing?.extras || []);
    setSelectedIngredientsToRemove(existing?.removedIngredients || []);
    // Cargar variantes: del item existente o default a primera opción replace si es nuevo
    if (existing?.selectedReplaceOptionId || existing?.selectedAddOptionIds?.length || (existing?.variant_selections?.length ?? 0) > 0) {
      setSelectedReplaceOptionId(existing.selectedReplaceOptionId ?? null);
      setSelectedAddOptionIds(existing.selectedAddOptionIds ?? []);
      const vg = (item.variant_groups || []).filter((g: any) => (g.variant_options || g.variant_option || []).some((o: any) => (o.price_type || '').toLowerCase() === 'replace'));
      const byGroup: Record<string, string[]> = {};
      const idsToParse = existing.variant_selections?.length ? existing.variant_selections : (existing.selectedReplaceOptionId ? [existing.selectedReplaceOptionId] : []);
      idsToParse.forEach((id: string) => {
        for (const g of vg) {
          const opts = g.variant_options || g.variant_option || [];
          if (opts.some((o: any) => o.id === id)) {
            byGroup[g.id] = [...(byGroup[g.id] || []), id];
            break;
          }
        }
      });
      setSelectedReplaceOptionIds(byGroup);
    } else {
      const replaceGroups = (item.variant_groups || []).filter(g =>
        (g.variant_options || []).some((o: VariantOption) => (o.price_type || '').toLowerCase() === 'replace')
      );
      const firstGroup = replaceGroups[0];
      const hasRequired = firstGroup && isRequiredGroup(firstGroup);
      setSelectedReplaceOptionId(hasRequired ? null : (firstGroup?.variant_options?.[0]?.id ?? null));
      setSelectedReplaceOptionIds({});
      setSelectedAddOptionIds([]);
    }
  };

  const handleClosePdp = () => {
    setShowDetail(null);
    setShowImageModal(false);
    setRequiredVariantError(false);
    if (editingCartItem) onCancelEdit();
    setHeaderHidden(false);
    mainScrollRef.current?.scrollTo(0, 0);
    lastScrollYRef.current = 0;
    setScrollTop(0);
  };

  const hasAnyVariants = (i: MenuItem) => (i.variant_groups?.length || 0) > 0;

  const handleIncrement = async (e: React.MouseEvent, item: MenuItem) => {
    e.stopPropagation();
    
    if (addingItems.has(item.id)) return;
    
    if (identifiedGuestId && selectedGuestId !== identifiedGuestId) {
      const name = guests.find(g => g.id === selectedGuestId)?.name || 'otra persona';
      if (!window.confirm(`Estás sumando platos a ${name}, que no es tu sesión. ¿Continuar?`)) return;
    }
    
    // Si tiene variantes, abrir PDP para que elija
    if (hasAnyVariants(item)) {
      handleOpenPdp(item);
      return;
    }
    
    const simpleItem = getSimpleCartItemForGuest(item.id);
    if (simpleItem) {
      onUpdateCartItem(simpleItem.id, { quantity: simpleItem.quantity + 1 });
    } else {
      // Marcar como agregando
      setAddingItems(prev => new Set(prev).add(item.id));
      try {
        await onAddToCart(item, selectedGuestId, [], []);
      } catch (error: any) {
        if (error?.message === 'PRODUCTO_NO_DISPONIBLE') {
          setShowUnavailableModal(true);
        } else {
          console.error("Error al agregar item:", error);
        }
      } finally {
        // Remover del set de items agregando
        setAddingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.id);
          return newSet;
        });
      }
    }
  };

  const handleDecrement = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    const simpleItem = getSimpleCartItemForGuest(itemId);
    if (simpleItem) {
      onUpdateCartItem(simpleItem.id, { quantity: simpleItem.quantity - 1 });
    }
  };

  const handleUpdateCurrent = () => {
    if (!showDetail || !existingInCart) return;
    const ingredientsToAdd = showDetail.customer_customization?.ingredientsToAdd || [];
    const groups = getVariantGroups(showDetail);
    const allOpts = groups.flatMap(g => ((g.variant_options ?? (g as any).variant_option) || []) as { id: string; name?: string; price_type?: string }[]);
    const personalizationFromAdd: string[] = [];
    const variantAddIds: string[] = [];
    selectedAddOptionIds.forEach(id => {
      const opt = allOpts.find((o: any) => o.id === id);
      const isAddOpt = opt && ((opt.price_type || '').toLowerCase() === 'add');
      if (isAddOpt && opt && ingredientsToAdd.some((ing: string) => (ing || '').trim().toLowerCase() === (opt.name || '').trim().toLowerCase())) {
        personalizationFromAdd.push(opt.name || '');
      } else {
        variantAddIds.push(id);
      }
    });
    const finalExtras = [...new Set([...selectedExtras, ...personalizationFromAdd])].filter(Boolean);
    const allReplaceIds = [...(selectedReplaceOptionId ? [selectedReplaceOptionId] : []), ...Object.values(selectedReplaceOptionIds).flat()];
    const variantSelections = [...new Set([...allReplaceIds, ...variantAddIds])];
    const updates: Parameters<typeof onUpdateCartItem>[1] = { 
      extras: finalExtras, 
      removedIngredients: [...selectedIngredientsToRemove] 
    };
    if (hasVariants) {
      updates.selectedReplaceOptionId = selectedReplaceOptionId ?? undefined;
      updates.selectedAddOptionIds = variantAddIds;
      updates.variant_selections = variantSelections;
      updates.unitPrice = variantUnitPrice;
    }
    onUpdateCartItem(existingInCart.id, updates);
    handleClosePdp();
  };

  const handleAddNew = async () => {
    if (!showDetail) return;
    
    if (addingItems.has(showDetail.id)) return;
    
    if (identifiedGuestId && selectedGuestId !== identifiedGuestId) {
      const name = guests.find(g => g.id === selectedGuestId)?.name || 'otra persona';
      if (!window.confirm(`Estás sumando platos a ${name}, que no es tu sesión. ¿Continuar?`)) return;
    }
    
    // Si hay grupo replace required sin selección, o grupo add required sin al menos una opción
    const hasRequiredReplaceMissing = variantReplaceGroups.some(g => {
      if (!isRequiredGroup(g)) return false;
      if (isSelectionIndividual(g)) return !selectedReplaceOptionId;
      return (selectedReplaceOptionIds[g.id] || []).length === 0;
    });
    const hasRequiredAddMissing = variantAddGroups.some(g => {
      if (!isRequiredGroup(g)) return false;
      const optIds = (g.variant_options || []).map(o => o.id);
      const hasSelection = selectedAddOptionIds.some(id => optIds.includes(id));
      return !hasSelection;
    });
    if (hasRequiredReplaceMissing || hasRequiredAddMissing) {
      setRequiredVariantError(true);
      return;
    }
    
    // Marcar como agregando
    setAddingItems(prev => new Set(prev).add(showDetail.id));
    try {
      const allReplaceIds = [...(selectedReplaceOptionId ? [selectedReplaceOptionId] : []), ...Object.values(selectedReplaceOptionIds).flat()];
      const variantOpts = hasVariants ? {
        unitPrice: variantUnitPrice,
        selectedReplaceOptionId: selectedReplaceOptionId ?? undefined,
        selectedAddOptionIds: [...selectedAddOptionIds],
        variantSelections: [...new Set([...allReplaceIds, ...selectedAddOptionIds])]
      } : undefined;
      await onAddToCart(showDetail, selectedGuestId, [...selectedExtras], [...selectedIngredientsToRemove], variantOpts);
      handleClosePdp();
    } catch (error: any) {
      if (error?.message === 'PRODUCTO_NO_DISPONIBLE') {
        setShowUnavailableModal(true);
      } else {
        console.error("Error al agregar item:", error);
      }
    } finally {
      // Remover del set de items agregando
      setAddingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(showDetail.id);
        return newSet;
      });
    }
  };

  // Inicializar guests originales cuando se abre el bottom sheet
  useEffect(() => {
    if (isManageGuestsOpen) {
      setOriginalGuests(guests.map(g => ({ ...g })));
      setPendingNewGuests([]);
    }
  }, [isManageGuestsOpen]);

  const handleUpdateGuestName = (id: string, newName: string) => {
    // Solo actualizar estado local, no persistir aún
    setGuests(prev => prev.map(g => g.id === id ? { ...g, name: newName } : g));
  };

  const handleNameClick = (id: string) => {
    // Al hacer click en el nombre, hacer foco en el input
    setTimeout(() => {
      inputRefs.current[id]?.focus();
      inputRefs.current[id]?.select();
    }, 10);
  };

  const handleBlurName = (id: string, currentName: string) => {
    // Si no hay texto, mantener el nombre original
    if (!currentName.trim()) {
      const originalGuest = originalGuests.find(g => g.id === id);
      if (originalGuest) {
        handleUpdateGuestName(id, originalGuest.name);
      }
    }
  };

  // Función para compartir el link para que otro comensal seleccione sus platos
  const handleShareGuestMenu = async (guestId: string) => {
    try {
      const orderIdToUse = activeOrderId || '';
      const baseUrl = window.location.origin;
      const menuUrl = orderIdToUse 
        ? `${baseUrl}/menu?orderId=${orderIdToUse}&guestId=${guestId}`
        : `${baseUrl}/menu?guestId=${guestId}`;
      
      const guest = guests.find(g => g.id === guestId);
      const guestName = guest?.name || 'Comensal';
      const textWithUrl = `¡Hola ${guestName}! Puedes seleccionar tus platos aquí: ${menuUrl}`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'SplitMe - Seleccionar platos',
            text: textWithUrl,
          });
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error("Error al compartir:", err);
            copyToClipboard(textWithUrl);
          }
        }
      } else {
        copyToClipboard(textWithUrl);
      }
    } catch (error) {
      console.error('Error al compartir:', error);
    }
  };

  // Función para copiar al portapapeles
  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => alert('Enlace copiado al portapapeles'))
        .catch(err => {
          console.error("Error al copiar:", err);
          fallbackCopyTextToClipboard(text);
        });
    } else {
      fallbackCopyTextToClipboard(text);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      alert('Enlace copiado al portapapeles');
    } catch (err) {
      console.error('Fallback: Error al copiar', err);
    }
    document.body.removeChild(textArea);
  };

  const handleAddGuest = () => {
    if (!newGuestName.trim()) return;
    if (guests.length >= tableCapacity) {
      alert(`La mesa tiene una capacidad máxima de ${tableCapacity} personas.`);
      return;
    }
    const newGuest: Guest = {
      id: `temp-${Date.now()}`, // ID temporal para nuevos guests
      name: newGuestName.trim(),
      isHost: false
    };
    setGuests([...guests, newGuest]);
    setPendingNewGuests([...pendingNewGuests, newGuest]);
    setNewGuestName('');
    onSelectGuest(newGuest.id);
  };

  // Detectar si hay cambios
  const hasChanges = useMemo(() => {
    // Verificar cambios en nombres
    const nameChanged = guests.some(guest => {
      const original = originalGuests.find(g => g.id === guest.id);
      return original && original.name !== guest.name;
    });
    
    // Verificar si hay nuevos guests
    const hasNewGuests = pendingNewGuests.length > 0;
    
    return nameChanged || hasNewGuests;
  }, [guests, originalGuests, pendingNewGuests]);

  const handleSaveChanges = async () => {
    if (!onSaveGuestChanges) return;
    
    // Separar guests existentes modificados y nuevos
    const updatedGuests = guests.filter(g => {
      const original = originalGuests.find(og => og.id === g.id);
      return original && original.name !== g.name;
    });
    
    const success = await onSaveGuestChanges(updatedGuests, pendingNewGuests);
    
    if (success) {
      // Los guests ya están actualizados en App.tsx, simplemente cerrar
      setPendingNewGuests([]);
      setIsManageGuestsOpen(false);
    } else {
      alert('Error al guardar los cambios. Intenta nuevamente.');
    }
  };

  // Obtener subcategorías disponibles para la categoría actual, respetando sort_order del admin
  const availableSubcategories = useMemo(() => {
    if (initialCategory === 'Inicio') return [];
    
    const parentCatObj = supabaseCategories.find(c => c.name === initialCategory);
    if (!parentCatObj) return [];
    
    const subCatIds = supabaseCategories.filter(c => c.parent_id === parentCatObj.id).map(c => c.id);
    const allRelevantIds = [parentCatObj.id, ...subCatIds];
    
    // Subcategorías que tienen al menos un producto
    const uniqueSubcategoryIds = new Set<string>();
    menuItems
      .filter(item => allRelevantIds.includes(item.category_id) && item.subcategory_id)
      .forEach(item => uniqueSubcategoryIds.add(item.subcategory_id!));
    
    // Obtener subcategorías desde supabaseCategories ordenadas por sort_order (como en el admin)
    const allSubcategoriesOrdered = supabaseCategories
      .filter(c => c.parent_id === parentCatObj.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(c => ({ id: c.id, name: c.name }));
    
    // Solo incluir las que tienen productos, manteniendo el orden del admin
    return allSubcategoriesOrdered.filter(sub => uniqueSubcategoryIds.has(sub.id));
  }, [initialCategory, menuItems, supabaseCategories]);

  // Verificar si la categoría tiene subcategorías
  const hasSubcategories = availableSubcategories.length > 0;

  // Descripción de la categoría/subcategoría activa (desde tabla categories)
  const activeCategoryDescription = useMemo(() => {
    if (selectedSubcategory) {
      const subCat = supabaseCategories.find(c => c.id === selectedSubcategory);
      return subCat?.description?.trim() || null;
    }
    if (initialCategory === 'Inicio') return null;
    const mainCat = supabaseCategories.find(c => c.name === initialCategory && c.parent_id === null);
    return mainCat?.description?.trim() || null;
  }, [initialCategory, selectedSubcategory, supabaseCategories]);

  // Cantidad por subcategoría del comensal seleccionado (igual que categoryCounts)
  const subcategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    availableSubcategories.forEach(subcat => {
      counts[subcat.id] = guestSpecificCart.reduce((sum, cartItem) => {
        const menuItem = menuItems.find(m => m.id === cartItem.itemId);
        return menuItem?.subcategory_id === subcat.id ? sum + cartItem.quantity : sum;
      }, 0);
    });
    return counts;
  }, [guestSpecificCart, availableSubcategories, menuItems]);

  const filteredItems = useMemo(() => {
    if (initialCategory === 'Inicio') return menuItems.filter(item => item.is_featured);
    
    const parentCatObj = supabaseCategories.find(c => c.name === initialCategory);
    if (!parentCatObj) return [];
    
    const subCatIds = supabaseCategories.filter(c => c.parent_id === parentCatObj.id).map(c => c.id);
    const allRelevantIds = [parentCatObj.id, ...subCatIds];
    
    let items = menuItems.filter(item => allRelevantIds.includes(item.category_id));
    
    // Filtrar por subcategoría si está seleccionada
    if (selectedSubcategory !== null) {
      items = items.filter(item => item.subcategory_id === selectedSubcategory);
    }
    
    return items;
  }, [initialCategory, menuItems, supabaseCategories, selectedSubcategory]);

  // Carruseles para la pantalla Inicio
  const featuredItems = useMemo(() => menuItems.filter(item => item.is_featured), [menuItems]);

  const mostPedidosItems = useMemo(() => {
    return [...menuItems].sort((a, b) => (b.times_ordered ?? 0) - (a.times_ordered ?? 0)).slice(0, 10);
  }, [menuItems]);

  const mejorCalificadosItems = useMemo(() => {
    return [...menuItems]
      .filter(item => (item.rating_count ?? 0) > 0)
      .sort((a, b) => (b.average_rating ?? 0) - (a.average_rating ?? 0))
      .slice(0, 10);
  }, [menuItems]);

  // Agrupar items por menu_section_headers (subtítulos definidos en admin).
  // Solo aplicar agrupación cuando hay una subcategoría seleccionada (ej. "Cafés Especiales").
  // En "Todos" no mostrar subtítulos, ya que la agrupación fue pensada para subcategorías específicas.
  const itemsGroupedBySectionHeader = useMemo(() => {
    if (filteredItems.length === 0) return [{ sectionId: null as string | null, sectionTitle: null as string | null, items: [] as MenuItem[] }];
    if (selectedSubcategory === null) {
      return [{ sectionId: null, sectionTitle: null, items: filteredItems }];
    }
    const headerMap = new Map(sectionHeaders.map(h => [h.id, h]));
    const sectionIdsInUse = [...new Set(filteredItems.map(i => i.section_id).filter(Boolean))] as string[];
    const orderedHeaders = sectionIdsInUse
      .map(id => headerMap.get(id))
      .filter(Boolean)
      .sort((a, b) => (a!.sort_order ?? 0) - (b!.sort_order ?? 0));
    const placedIds = new Set<string>();
    const groups: { sectionId: string | null; sectionTitle: string | null; items: MenuItem[] }[] = [];
    for (const h of orderedHeaders) {
      if (!h) continue;
      const subItems = filteredItems.filter(item => item.section_id === h.id);
      if (subItems.length > 0) {
        groups.push({ sectionId: h.id, sectionTitle: h.title, items: subItems });
        subItems.forEach(i => placedIds.add(i.id));
      }
    }
    const ungrouped = filteredItems.filter(item => !placedIds.has(item.id));
    if (ungrouped.length > 0) groups.push({ sectionId: null, sectionTitle: null, items: ungrouped });
    if (groups.length === 0) return [{ sectionId: null, sectionTitle: null, items: filteredItems }];
    return groups;
  }, [filteredItems, sectionHeaders, selectedSubcategory]);

  const hasNutritionalInfo = (item: MenuItem) => {
    return item.calories !== null || item.protein_g !== null || item.total_fat_g !== null || 
           item.sat_fat_g !== null || item.carbs_g !== null || item.sugars_g !== null || 
           item.fiber_g !== null || item.sodium_mg !== null;
  };

  const hasCustomization = (item: MenuItem) => {
    const hasAdd = (item.customer_customization?.ingredientsToAdd?.length || 0) > 0;
    const hasRemove = (item.customer_customization?.ingredientsToRemove?.length || 0) > 0;
    return hasAdd || hasRemove;
  };

  // Normalizar variant_groups (Supabase puede devolver variant_group u otra estructura)
  const normalizedVariantGroups = useMemo((): VariantGroup[] => {
    if (!showDetail) return [];
    const raw = (showDetail as any).variant_groups ?? (showDetail as any).variant_group;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return [raw];
    return [];
  }, [showDetail]);

  const getGroupOptions = (g: any) => Array.isArray(g?.variant_options) ? g.variant_options : (Array.isArray((g as any)?.variant_option) ? (g as any).variant_option : []);

  /** Si el grupo es obligatorio según variant_groups.required (TRUE en DB) */
  const isRequiredGroup = (g: VariantGroup | { required?: boolean | string }) =>
    g.required === true || (typeof g.required === 'string' && g.required.toLowerCase() === 'true');

  /** individual=dropdown (una opción), multiple=lista con checkboxes (varias) */
  const isSelectionIndividual = (g: VariantGroup | { selection?: string }) =>
    ((g.selection || 'individual') as string).toLowerCase() === 'individual';

  /** max_selection como número (null/undefined = sin límite) */
  const getMaxSelection = (g: VariantGroup | { max_selection?: number | null | string }) => {
    const v = g.max_selection;
    if (v == null || v === '') return null;
    const n = Number(v);
    return n > 0 ? n : null;
  };

  // Ordenar opciones por precio ascendente (menor arriba, mayor abajo)
  const sortByPrice = (opts: VariantOption[]) =>
    [...opts].sort((a, b) => (Number(a.price_amount) || 0) - (Number(b.price_amount) || 0));

  // Variantes: grupos replace y add del producto actual
  const variantReplaceGroups = useMemo((): VariantGroup[] => {
    if (!normalizedVariantGroups.length) return [];
    return normalizedVariantGroups.filter(g => 
      getGroupOptions(g).some((o: VariantOption) => (o.price_type || '').toLowerCase() === 'replace')
    ).map(g => ({
      ...g,
      variant_options: sortByPrice(getGroupOptions(g).filter((o: VariantOption) => (o.price_type || '').toLowerCase() === 'replace'))
    })).filter(g => g.variant_options.length > 0);
  }, [normalizedVariantGroups]);

  const variantAddGroups = useMemo((): VariantGroup[] => {
    if (!normalizedVariantGroups.length) return [];
    return normalizedVariantGroups.filter(g => 
      getGroupOptions(g).some((o: VariantOption) => (o.price_type || '').toLowerCase() === 'add')
    ).map(g => ({
      ...g,
      variant_options: sortByPrice(getGroupOptions(g).filter((o: VariantOption) => (o.price_type || '').toLowerCase() === 'add'))
    })).filter(g => g.variant_options.length > 0);
  }, [normalizedVariantGroups]);

  const hasVariants = variantReplaceGroups.length > 0 || variantAddGroups.length > 0;

  // Precio efectivo según variantes seleccionadas
  const variantUnitPrice = useMemo((): number => {
    if (!showDetail) return 0;
    let base = Number(showDetail.price) || 0;
    if (variantReplaceGroups.length > 0) {
      const allReplaceOpts = variantReplaceGroups.flatMap(g => g.variant_options);
      const singleOpt = allReplaceOpts.find(o => o.id === selectedReplaceOptionId);
      const multiIds = variantReplaceGroups.flatMap(g => selectedReplaceOptionIds[g.id] || []);
      const multiOpts = multiIds.map(id => allReplaceOpts.find(o => o.id === id)).filter(Boolean);
      if (singleOpt || multiOpts.length > 0) {
        base = (singleOpt ? Number(singleOpt.price_amount) || 0 : 0) + multiOpts.reduce((s, o) => s + (Number(o?.price_amount) || 0), 0);
      }
    }
    variantAddGroups.forEach(g => {
      (g.variant_options || []).forEach(opt => {
        if (selectedAddOptionIds.includes(opt.id)) base += Number(opt.price_amount) || 0;
      });
    });
    return base;
  }, [showDetail, variantReplaceGroups, variantAddGroups, selectedReplaceOptionId, selectedReplaceOptionIds, selectedAddOptionIds]);

  // Rango min-max para productos con replace (sin selección aún)
  const variantPriceRange = useMemo((): { min: number; max: number } | null => {
    if (variantReplaceGroups.length === 0) return null;
    const allPrices = variantReplaceGroups.flatMap(g => g.variant_options).map(o => Number(o.price_amount) || 0);
    if (allPrices.length === 0) return null;
    return { min: Math.min(...allPrices), max: Math.max(...allPrices) };
  }, [variantReplaceGroups]);

  // Resetear variantes al cerrar PDP
  useEffect(() => {
    if (!showDetail) {
      setSelectedReplaceOptionId(null);
      setSelectedReplaceOptionIds({});
      setSelectedAddOptionIds([]);
    }
  }, [showDetail]);

  return (
    <div className="fixed inset-0 flex flex-col w-full max-w-md mx-auto bg-background-dark text-white font-display overflow-hidden relative">
      {/* Área de scroll: solo esta parte hace scroll. Footer y campana quedan fijos abajo. */}
      <div
        ref={mainScrollRef}
        className="flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden no-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
      {/* Header fijo: oculta en scroll down, muestra en scroll up. No tapa contenido: padding dinámico */}
      <div
        ref={(el) => {
          headerBlockRef.current = el;
          if (el) {
            const h = el.offsetHeight;
            if (h > 0) setHeaderHeight(h);
          }
        }}
        onMouseEnter={() => { headerHoveredRef.current = true; }}
        onMouseLeave={() => { headerHoveredRef.current = false; }}
        className={`fixed top-0 left-0 right-0 z-40 max-w-md mx-auto bg-background-dark/95 backdrop-blur-md transition-transform duration-200 ${
          headerHidden ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        <header className="pb-2 border-b border-white/5">
        <div className="px-6 flex items-center justify-between pt-1 mb-4">
          <div className="flex flex-col">
            <h1 className="text-[13px] font-medium flex items-center gap-2 flex-wrap">
              <span className="text-white/90">Mesa {table?.table_number || '4'}</span>
              <span className="text-white/25">·</span>
              <span className="text-white/55">{restaurant?.name || 'The Burger Joint'}</span>
            </h1>
          </div>
        </div>

        <div ref={guestsRowRef} className="flex gap-4 overflow-x-auto no-scrollbar px-6 pt-2 pb-1 items-start flex-nowrap snap-x touch-pan-x">
          {guests.map((g) => (
            <div key={g.id} data-guest-id={g.id} className="flex flex-col items-center gap-2 shrink-0 max-w-[60px] snap-start">
              <button
                onClick={() => onSelectGuest(g.id)}
                className={`relative size-10 rounded-full transition-all duration-300 ${
                  selectedGuestId === g.id 
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background-dark'
                    : 'opacity-40 hover:opacity-90'
                }`}
              >
                <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center font-black text-sm ${getGuestColor(g.id)}`}>
                  {getInitials(g.name)}
                </div>
                {guestItemCounts[g.id] > 0 && (
                  <div className={`absolute -bottom-1 -right-1 rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-background-dark shadow-lg text-[10px] font-black ${
                    selectedGuestId === g.id ? 'bg-primary text-black' : 'bg-white/20 text-white'
                  }`}>
                    {guestItemCounts[g.id]}
                  </div>
                )}
              </button>
              <span className={`text-[10px] font-medium text-center truncate w-full ${selectedGuestId === g.id ? 'text-white' : 'text-white/40'}`}>
                {(g.name.split(' (')[0] || backupNames[g.id]?.split(' (')[0] || '...')}
              </span>
            </div>
          ))}

          <div className="flex flex-col items-center gap-2 shrink-0 ml-2 max-w-[90px] snap-start">
            <button 
              onClick={() => setIsManageGuestsOpen(true)}
              className="size-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-text-secondary active:scale-95 transition-all hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-lg">group</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="flex gap-4 overflow-x-auto no-scrollbar px-4 py-1 bg-background-dark border-b border-white/5 shrink-0">
        {categoriesList.map(cat => {
          const isInicio = cat === 'Inicio';
          const isSelected = initialCategory === cat;
          
          return (
          <button
            key={cat}
            onClick={() => {
              const slug = cat === 'Destacados' ? 'destacados' : categoryToSlug(cat);
              onCategoryChange(cat);
              window.history.replaceState(null, '', `/menu/${slug}`);
              mainScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
              lastScrollYRef.current = 0;
              lastGestureTimeRef.current = 0;
            }}
              className={`flex items-center justify-center gap-1.5 h-9 px-4 rounded-full whitespace-nowrap text-sm font-semibold transition-colors shrink-0 ${
                isSelected
                  ? 'bg-primary text-black shadow-md shadow-primary/30'
                  : 'bg-surface-dark-alt text-text-secondary border border-border-dark'
              }`}
          >
            {isInicio && <span className="material-symbols-outlined text-[14px]">home</span>}
            {cat} {categoryCounts[cat] > 0 && (
              <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] rounded-full items-center justify-center text-[10px] font-semibold ${isSelected ? 'bg-white/30 text-white' : 'bg-primary/20 text-primary'}`}>
                {categoryCounts[cat]}
              </span>
            )}
          </button>
          );
        })}
      </nav>

      {hasSubcategories && (
        <nav className="flex gap-3 overflow-x-auto no-scrollbar px-4 py-3 bg-background-dark border-b border-white/5 shrink-0">
          <button
            onClick={() => {
              const categorySlug = initialCategory === 'Destacados' ? 'destacados' : categoryToSlug(initialCategory);
              setSelectedSubcategory(null);
              window.history.replaceState(null, '', `/menu/${categorySlug}`);
              mainScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
              lastScrollYRef.current = 0;
              lastGestureTimeRef.current = 0;
            }}
            className={`flex items-center px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-semibold transition-colors shrink-0 ${
              selectedSubcategory === null
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-surface-dark-alt text-text-secondary border border-border-dark'
            }`}
          >
            Todos {categoryCounts[initialCategory] > 0 && (
              <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] rounded-full items-center justify-center text-[10px] font-semibold ${selectedSubcategory === null ? 'bg-white/30 text-white' : 'bg-primary/20 text-primary'}`}>
                {categoryCounts[initialCategory]}
              </span>
            )}
          </button>
          {availableSubcategories.map(subcat => {
            const isSelected = selectedSubcategory === subcat.id;
            const count = subcategoryCounts[subcat.id] ?? 0;
            return (
              <button
                key={subcat.id}
                onClick={() => {
                  const categorySlug = initialCategory === 'Destacados' ? 'destacados' : categoryToSlug(initialCategory);
                  const subcategorySlug = categoryToSlug(subcat.name);
                  setSelectedSubcategory(subcat.id);
                  window.history.replaceState(null, '', `/menu/${categorySlug}/${subcategorySlug}`);
                  mainScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
              lastScrollYRef.current = 0;
              lastGestureTimeRef.current = 0;
                }}
                className={`flex items-center px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-semibold transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-surface-dark-alt text-text-secondary border border-border-dark'
                }`}
              >
                {subcat.name} {count > 0 && (
                  <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] rounded-full items-center justify-center text-[10px] font-semibold ${isSelected ? 'bg-white/30 text-white' : 'bg-primary/20 text-primary'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {activeCategoryDescription && (
        <div className="px-5 py-5 bg-background-dark border-b border-white/5 shrink-0">
          <p className="text-white/90 text-base font-medium leading-relaxed">{activeCategoryDescription}</p>
        </div>
      )}
      </div>

      <div style={{ paddingTop: scrollTop <= 10 ? headerHeight : 0 }} className="transition-[padding] duration-200">
      {initialCategory === 'Inicio' ? (
        <main className="pb-36 flex-1 pt-5 space-y-8">
          {banners.length > 0 && (
            <div className="relative h-56 mx-4 rounded-3xl overflow-hidden">
              <div
                ref={bannerScrollRef}
                className="flex h-full w-full overflow-x-auto no-scrollbar snap-x snap-mandatory"
                onScroll={e => {
                  const el = e.currentTarget;
                  const idx = Math.round(el.scrollLeft / el.offsetWidth);
                  setActiveBannerIndex(idx);
                }}
              >
                {banners.map(banner => (
                  <div key={banner.id} className="min-w-full h-full shrink-0 snap-start relative">
                    <img src={banner.image_url} alt="" className="w-full h-full object-cover" />
                    {(banner.title || banner.description) && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          {banner.title && <p className="text-white font-bold text-[17px] leading-snug drop-shadow">{banner.title}</p>}
                          {banner.description && <p className="text-white/80 text-[13px] mt-0.5 leading-snug drop-shadow">{banner.description}</p>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {banners.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {banners.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        bannerScrollRef.current?.scrollTo({ left: bannerScrollRef.current.offsetWidth * i, behavior: 'smooth' });
                        setActiveBannerIndex(i);
                      }}
                      className={`rounded-full transition-all duration-300 ${i === activeBannerIndex ? 'bg-white w-4 h-1.5' : 'bg-white/40 w-1.5 h-1.5'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {([
            { title: 'Elegidos por el Chef', items: featuredItems, icon: 'restaurant_menu' },
            { title: 'Los más pedidos', items: mostPedidosItems, icon: 'trending_up' },
            { title: 'Los mejor calificados', items: mejorCalificadosItems, icon: 'star' },
          ] as { title: string; items: typeof menuItems; icon: string }[]).map(({ title, items, icon }) => items.length > 0 && (
            <div key={title}>
              <div className="flex items-center gap-2 px-4 mb-4">
                <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
                <h2 className="text-[17px] font-bold text-white">{title}</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 scroll-pl-5 snap-x snap-mandatory pb-1">
                {items.map(item => {
                  const qty = getDishQuantityForGuest(item.id);
                  const simpleItem = getSimpleCartItemForGuest(item.id);
                  const catName = supabaseCategories.find(c => c.id === item.category_id)?.name;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleOpenPdp(item)}
                      className="relative w-44 h-56 rounded-3xl overflow-hidden shrink-0 cursor-pointer shadow-xl shadow-black/50 active:scale-[0.97] transition-transform snap-start bg-surface-dark-alt"
                    >
                      {getItemImageUrl(item.image_url) ? (
                        <img src={getItemImageUrl(item.image_url)} alt={item.name} className="w-full h-full object-cover absolute inset-0" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-surface-dark-alt">
                          <span className="material-symbols-outlined text-white/20 text-5xl">restaurant</span>
                        </div>
                      )}
                      {/* gradientes top y bottom para legibilidad */}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-transparent pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />
                      {/* top: categoría + nombre + pill Nuevo */}
                      <div className="absolute top-0 left-0 right-0 p-3.5">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="text-white/55 text-[10px] font-semibold uppercase tracking-wide leading-none">{catName || ''}</span>
                          {item.is_new && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 text-[#0D1F1E]" style={{ background: '#2DD4BF' }}>Nuevo</span>
                          )}
                        </div>
                        <p className="text-white font-bold text-[14px] leading-snug line-clamp-2">{item.name}</p>
                      </div>
                      {/* bottom: rating + precio + CTA */}
                      <div className="absolute bottom-0 left-0 right-0 p-3.5 flex flex-col gap-2 pointer-events-none">
                        {item.average_rating != null && (
                          <div className="flex items-center gap-1 self-start bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
                            <span className="material-symbols-outlined filled text-primary text-[12px] leading-none">star</span>
                            <span className="text-white text-[11px] font-semibold tabular-nums">{Number(item.average_rating).toFixed(1)}</span>
                          </div>
                        )}
                        {/* precio + CTA */}
                        <div className="flex items-center justify-between gap-2 pointer-events-auto" onClick={e => e.stopPropagation()}>
                          <span className="text-white font-semibold text-[15px] tabular-nums">${formatPrice(Number(item.price))}</span>
                          {/* botón agregar / stepper */}
                          <div>
                        {item.availability === false ? null : addingItems.has(item.id) ? (
                          <div className="size-8 rounded-full bg-primary/80 flex items-center justify-center">
                            <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : qty > 0 ? (
                          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 border border-white/20">
                            <button
                              onClick={e => { simpleItem ? handleDecrement(e, item.id) : (() => { const anyItem = guestSpecificCart.find(i => i.itemId === item.id && (i.status === 'elegido' || (!i.status && !i.isConfirmed))); if (anyItem) onUpdateCartItem(anyItem.id, { quantity: anyItem.quantity - 1 }); })(); }}
                              className="text-primary"
                            >
                              <span className="material-symbols-outlined text-base leading-none">{qty === 1 ? 'delete' : 'remove'}</span>
                            </button>
                            <span className="text-white text-xs font-bold tabular-nums min-w-[14px] text-center">{qty}</span>
                            <button onClick={e => handleIncrement(e, item)} className="text-primary">
                              <span className="material-symbols-outlined text-base leading-none">add</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={e => handleIncrement(e, item)}
                            className="size-8 rounded-full bg-primary shadow-lg shadow-primary/40 flex items-center justify-center active:scale-90 transition-transform"
                          >
                            <span className="material-symbols-outlined text-black text-base leading-none">add</span>
                          </button>
                        )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </main>
      ) : (
      <main className="p-4 pb-32 flex-1">
        <div className="flex flex-col gap-6">
          {itemsGroupedBySectionHeader.map((group, groupIdx) => (
            <section key={group.sectionId ?? `ungrouped-${groupIdx}`} className="flex flex-col gap-3">
              {group.sectionTitle && (
                <h3 className="text-[13px] font-semibold text-white/40 px-1">
                  {group.sectionTitle}
                </h3>
              )}
              <div className="grid grid-cols-1 gap-4">
                {group.items.map(item => {
            const totalQty = getDishQuantityForGuest(item.id);
            const simpleItem = getSimpleCartItemForGuest(item.id);
            const showTrash = totalQty === 1;

            // Encontrar todos los items de la mesa para este plato (para visibilidad global)
            const tableItemsForDish = cart.filter(i => i.itemId === item.id);

            return (
              <div
                key={item.id}
                onClick={() => handleOpenPdp(item)}
                className="bg-surface-dark border border-border-dark rounded-2xl p-4 flex flex-col transition-all cursor-pointer active:scale-[0.99] group relative overflow-hidden shadow-md shadow-black/40"
              >
                <div className="flex gap-4">
                  <div className="size-24 rounded-2xl shrink-0 overflow-hidden shadow-lg shadow-black/50 bg-surface-dark-alt flex items-center justify-center">
                    {getItemImageUrl(item.image_url) ? (
                      <img src={getItemImageUrl(item.image_url)} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-white/20 text-3xl">restaurant</span>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-bold text-base truncate">{item.name}</h3>
                    {item.is_new && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 text-[#0D1F1E]" style={{ background: '#2DD4BF' }}>
                        Nuevo
                      </span>
                    )}
                  </div>
                  {item.dietary_tags && item.dietary_tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {item.dietary_tags.map((tag, idx) => {
                        const config = getDietaryTagConfig(tag);
                        return (
                          <div
                            key={idx}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${config.bgColor} ${config.borderColor} border text-xs font-bold ${config.textColor}`}
                          >
                            {config.icon && (
                              <span className="material-symbols-outlined text-xs" style={{ fontSize: '14px' }}>
                                {config.icon}
                              </span>
                            )}
                            <span>{config.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-text-secondary text-xs line-clamp-2 mb-3">{item.description}</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white font-semibold text-[17px]">${formatPrice(Number(item.price))}</span>
                    <div 
                      className="flex items-center z-10 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.availability === false ? (
                        <span className="px-3 py-2 rounded-xl bg-surface-dark-alt border border-border-dark text-xs font-medium text-white/40">
                          Agotado
                        </span>
                      ) : addingItems.has(item.id) ? (
                        // Mostrar spinner mientras se guarda
                        <div className="px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                          <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : totalQty > 0 ? (
                        <div className="flex items-center gap-2 bg-surface-dark-alt border border-border-dark rounded-xl overflow-hidden shadow-md shadow-black/30">
                          <button 
                            onClick={(e) => {
                              if (simpleItem) {
                                handleDecrement(e, item.id);
                              } else {
                                const anyItem = guestSpecificCart.find(i => i.itemId === item.id && (i.status === 'elegido' || (!i.status && !i.isConfirmed)));
                                if (anyItem) onUpdateCartItem(anyItem.id, { quantity: anyItem.quantity - 1 });
                              }
                            }}
                            className={`h-9 w-9 flex items-center justify-center active:bg-white/5 transition-colors ${showTrash ? 'text-red-500' : 'text-primary'}`}
                          >
                            <span className="material-symbols-outlined font-black text-lg">
                              {showTrash ? 'delete' : 'remove'}
                            </span>
                          </button>
                          
                          <div className="min-w-[2rem] flex items-center justify-center">
                            <span className="text-sm font-black tabular-nums text-white">{totalQty}</span>
                          </div>

                          <button 
                            onClick={(e) => handleIncrement(e, item)}
                            className="h-9 w-9 flex items-center justify-center text-primary active:bg-white/5 transition-colors"
                          >
                            <span className="material-symbols-outlined font-black text-lg">add</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => handleIncrement(e, item)}
                          className="size-9 rounded-full bg-primary active:scale-95 transition-all flex items-center justify-center shrink-0"
                        >
                          <span className="material-symbols-outlined font-black text-base text-background-dark">add</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                </div>

                {/* Mensaje de últimas unidades cuando stock_quantity < 5 y está disponible */}
                {item.availability !== false && item.stock_quantity != null && item.stock_quantity < 5 && (
                  <p className="mt-3 text-[11px] font-medium text-amber-400">
                    Últimas unidades — {item.stock_quantity} disponible{item.stock_quantity !== 1 ? 's' : ''}
                  </p>
                )}

                {/* Visualización de personalizaciones del comensal seleccionado */}
                {tableItemsForDish
                  .filter(i => i.guestId === selectedGuestId && (i.extras?.length || i.removedIngredients?.length))
                  .map(i => (
                    <div key={i.id} className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3 animate-fade-in">
                      {i.extras?.map(ex => (
                        <span key={ex} className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">+{ex}</span>
                      ))}
                      {i.removedIngredients?.map(rem => (
                        <span key={rem} className="text-[10px] font-medium bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md border border-red-500/20">–{rem}</span>
                      ))}
                      {i.quantity > 1 && <span className="text-[10px] font-medium text-white/40 ml-1">×{i.quantity}</span>}
                    </div>
                  ))}
              </div>
            );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
      )}
      </div>
      </div>
      {/* Footer: fixed al bottom del viewport, siempre visible */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-6 z-[60] pointer-events-none">
        <button 
          onClick={onNext}
          disabled={cart.length === 0}
          className="w-full h-[54px] bg-primary text-black rounded-[14px] flex items-center justify-between px-6 font-semibold text-[15px] disabled:opacity-20 transition-all pointer-events-auto"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined">shopping_cart</span>
            <span>Ver Pedido {pendingCount > 0 && <span className="ml-1 opacity-60">({pendingCount})</span>}</span>
          </div>
          <span className="tabular-nums">${formatPrice(totalSessionPrice)}</span>
        </button>
      </footer>

      {showDetail && (
        <div className="fixed inset-0 z-[100] flex flex-col animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClosePdp}></div>
          <div className="bg-surface-dark w-full h-full relative z-10 overflow-hidden flex flex-col shadow-2xl">
            {/* Botón de cerrar arriba a la derecha */}
            <div className="absolute top-4 right-4 z-30">
              <button
                onClick={handleClosePdp}
                className="size-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 no-scrollbar">
              <div
                className={`h-72 w-full relative flex items-center justify-center cursor-pointer overflow-hidden ${getItemImageUrl(showDetail.image_url) ? 'bg-surface-dark-alt' : 'bg-surface-dark'}`}
                onClick={(e) => { e.stopPropagation(); getItemImageUrl(showDetail.image_url) && setShowImageModal(true); }}
              >
                {getItemImageUrl(showDetail.image_url) ? (
                  <>
                    <img
                      src={getItemImageUrl(showDetail.image_url)}
                      alt={showDetail.name}
                      className="w-full h-full object-cover object-center"
                    />
                    {/* gradient overlay: fade imagen hacia el contenido */}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-dark via-surface-dark/30 to-transparent pointer-events-none" />
                    {showDetail.is_new && (
                      <div className="absolute top-4 left-4 z-20 pointer-events-none">
                        <span className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide text-[#0D1F1E]" style={{ background: '#2DD4BF' }}>
                          Nuevo
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 size-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20 pointer-events-none">
                      <span className="material-symbols-outlined text-white text-xl">zoom_in</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-6xl text-white/20">restaurant</span>
                    {showDetail.is_new && (
                      <div className="absolute top-4 left-4 z-20 pointer-events-none">
                        <span className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide text-[#0D1F1E]" style={{ background: '#2DD4BF' }}>
                          Nuevo
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {showImageModal && getItemImageUrl(showDetail.image_url) && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center animate-fade-in" onClick={() => setShowImageModal(false)}>
                  <div className="absolute inset-0 bg-black/95" />
                  <img 
                    src={getItemImageUrl(showDetail.image_url)} 
                    alt={showDetail.name}
                    className="relative z-10 max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowImageModal(false); }}
                    className="absolute top-4 right-4 z-20 size-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-2xl">close</span>
                  </button>
                </div>
              )}
              <div className="p-8">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 pr-4">
                    <h2 className="text-[22px] font-bold leading-tight">{showDetail.name}</h2>
                  </div>
                  {hasVariants && variantPriceRange && variantReplaceGroups.length > 0 && !selectedReplaceOptionId ? (
                    <span className="text-[22px] font-semibold text-white/90">
                      ${formatPrice(variantPriceRange.min)} – ${formatPrice(variantPriceRange.max)}
                    </span>
                  ) : (
                    <span className="text-[22px] font-semibold text-white/90">${formatPrice(variantUnitPrice)}</span>
                  )}
                </div>

                <p className="text-text-secondary leading-relaxed mb-8">{showDetail.description}</p>

                {/* Variantes: selection=individual (dropdown) o selection=multiple (checkboxes) */}
                {hasVariants && (
                  <div className="mb-6 space-y-4">
                    {variantReplaceGroups.map(group => {
                      const useDropdown = isSelectionIndividual(group);
                      const selectedInGroup = useDropdown ? (selectedReplaceOptionId ? [selectedReplaceOptionId] : []) : (selectedReplaceOptionIds[group.id] || []);
                      const isRequiredAndError = isRequiredGroup(group) && requiredVariantError && selectedInGroup.length === 0;
                      const maxSel = getMaxSelection(group);
                      const atLimit = !useDropdown && maxSel != null && selectedInGroup.length >= maxSel;
                      return (
                      <div key={group.id} className={`rounded-2xl p-4 border ${isRequiredAndError ? 'border-red-500 bg-red-500/5' : 'bg-background-dark/30 border-white/5'}`}>
                        <label className="text-[12px] font-semibold text-white/55 mb-3 block">
                          {group.name}{isRequiredGroup(group) && <span className="text-primary ml-1">(obligatorio)</span>}
                          {!useDropdown && maxSel != null && <span className="text-white/50 font-normal ml-1">— hasta {maxSel} {maxSel === 1 ? 'opción' : 'opciones'}</span>}
                        </label>
                        {useDropdown ? (
                          <CustomSelect
                            value={selectedReplaceOptionId || ''}
                            placeholder={isRequiredGroup(group) ? 'Seleccione una opción' : undefined}
                            options={group.variant_options.map(opt => ({
                              id: opt.id,
                              label: `${opt.name} — $${formatPrice(Number(opt.price_amount))}${opt.description ? ` · ${opt.description}` : ''}`
                            }))}
                            onChange={(val) => {
                              setSelectedReplaceOptionId(val || null);
                              if (val) setRequiredVariantError(false);
                            }}
                            hasError={isRequiredAndError}
                          />
                        ) : (
                          <div className="space-y-2">
                            {group.variant_options.map(opt => {
                              const isChecked = selectedInGroup.includes(opt.id);
                              const wouldExceedLimit = !isChecked && atLimit;
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                    isChecked ? 'bg-primary/10 border-primary/40' : wouldExceedLimit ? 'bg-white/5 border-white/10 opacity-60' : 'bg-white/5 border-white/10'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={wouldExceedLimit}
                                    onChange={() => {
                                      if (wouldExceedLimit) return;
                                      setSelectedReplaceOptionIds(prev => {
                                        const current = prev[group.id] || [];
                                        const next = current.includes(opt.id) ? current.filter(id => id !== opt.id) : [...current, opt.id];
                                        return { ...prev, [group.id]: next };
                                      });
                                      setRequiredVariantError(false);
                                    }}
                                    className="mt-0.5 size-5 rounded-sm border-2 border-white/20 text-primary focus:ring-primary disabled:opacity-50"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold text-white block">{opt.name} — ${formatPrice(Number(opt.price_amount))}</span>
                                    {opt.description && <span className="text-[11px] text-white/60 block mt-0.5">{opt.description}</span>}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {!useDropdown && maxSel != null && (
                          <p className="mt-2 text-[11px] text-white/50">
                            Podés seleccionar hasta {maxSel} {maxSel === 1 ? 'opción' : 'opciones'}.
                          </p>
                        )}
                        {isRequiredAndError && (
                          <p className="mt-2 text-sm font-bold text-red-400 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-base">error</span>
                            Debes seleccionar una opción obligatoria antes de agregar al pedido.
                          </p>
                        )}
                      </div>
                    );
                    })}
                    {variantAddGroups.map(group => {
                      const hasRequiredAddSelection = (group.variant_options || []).some(opt => selectedAddOptionIds.includes(opt.id));
                      const isRequiredAddAndError = isRequiredGroup(group) && requiredVariantError && !hasRequiredAddSelection;
                      const useDropdown = isSelectionIndividual(group);
                      const maxSel = getMaxSelection(group);
                      const optIds = (group.variant_options || []).map(o => o.id);
                      const selectedInGroup = selectedAddOptionIds.filter(id => optIds.includes(id));
                      const atLimit = maxSel != null && selectedInGroup.length >= maxSel;
                      return (
                      <div key={group.id} className={`rounded-2xl p-4 border ${isRequiredAddAndError ? 'border-red-500 bg-red-500/5' : 'bg-background-dark/30 border-white/5'}`}>
                        <label className="text-[12px] font-semibold text-white/55 mb-3 block">
                          {group.name}{isRequiredGroup(group) && <span className="text-primary ml-1">(obligatorio)</span>}
                          {maxSel != null && <span className="text-white/50 font-normal ml-1">— hasta {maxSel} {maxSel === 1 ? 'opción' : 'opciones'}</span>}
                        </label>
                        {useDropdown ? (
                          <CustomSelect
                            value={selectedInGroup[0] || ''}
                            placeholder="Seleccione una opción"
                            options={group.variant_options.map(opt => ({
                              id: opt.id,
                              label: `${opt.name} +$${formatPrice(Number(opt.price_amount))}${opt.description ? ` · ${opt.description}` : ''}`
                            }))}
                            onChange={(val) => {
                              setSelectedAddOptionIds(prev => {
                                const fromOtherGroups = prev.filter(id => !optIds.includes(id));
                                return val ? [...fromOtherGroups, val] : fromOtherGroups;
                              });
                              if (isRequiredGroup(group)) setRequiredVariantError(false);
                            }}
                            hasError={isRequiredAddAndError}
                          />
                        ) : (
                          <div className="space-y-2">
                            {group.variant_options.map(opt => {
                              const isChecked = selectedAddOptionIds.includes(opt.id);
                              const wouldExceedLimit = !isChecked && atLimit;
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                    isChecked ? 'bg-primary/10 border-primary/40' : wouldExceedLimit ? 'bg-white/5 border-white/10 opacity-60' : 'bg-white/5 border-white/10'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={wouldExceedLimit}
                                    onChange={() => {
                                      if (wouldExceedLimit) return;
                                      setSelectedAddOptionIds(prev => {
                                        const fromOtherGroups = prev.filter(id => !optIds.includes(id));
                                        const selectedInGroup = prev.filter(id => optIds.includes(id));
                                        if (prev.includes(opt.id)) {
                                          return [...fromOtherGroups, ...selectedInGroup.filter(id => id !== opt.id)];
                                        }
                                        return [...fromOtherGroups, ...selectedInGroup, opt.id];
                                      });
                                      if (isRequiredGroup(group)) setRequiredVariantError(false);
                                    }}
                                    className="mt-0.5 size-5 rounded-sm border-2 border-white/20 text-primary focus:ring-primary disabled:opacity-50"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold text-white block">{opt.name}</span>
                                    {opt.description && <span className="text-[11px] text-white/60 block mt-0.5">{opt.description}</span>}
                                  </div>
                                  <span className="text-primary font-black">+${formatPrice(Number(opt.price_amount))}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {maxSel != null && !useDropdown && (
                          <p className="mt-2 text-[11px] text-white/50">
                            Podés seleccionar hasta {maxSel} {maxSel === 1 ? 'opción' : 'opciones'}.
                          </p>
                        )}
                        {isRequiredAddAndError && (
                          <p className="mt-2 text-sm font-bold text-red-400 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-base">error</span>
                            Debes seleccionar al menos una opción obligatoria antes de agregar al pedido.
                          </p>
                        )}
                      </div>
                    );
                    })}
                  </div>
                )}
                {showDetail.dietary_tags && showDetail.dietary_tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {showDetail.dietary_tags.map((tag, idx) => {
                      const config = getDietaryTagConfig(tag);
                      return (
                        <div
                          key={idx}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${config.bgColor} ${config.borderColor} border text-xs font-bold ${config.textColor}`}
                        >
                          {config.icon && (
                            <span className="material-symbols-outlined text-sm" style={{ fontSize: '16px' }}>
                              {config.icon}
                            </span>
                          )}
                          <span>{config.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="space-y-6">
                  {hasCustomization(showDetail) && (
                    <div className="bg-background-dark/30 rounded-[2.5rem] p-6 border border-white/5">
                      <div className="flex items-center gap-2 mb-5"><span className="material-symbols-outlined text-primary text-xl">tune</span><h3 className="text-[13px] font-semibold text-white/70">Personalización</h3></div>
                      <div className="space-y-6">
                        {showDetail.customer_customization?.ingredientsToRemove && showDetail.customer_customization.ingredientsToRemove.length > 0 && (
                          <div>
                            <p className="text-[9px] font-black uppercase text-red-400 tracking-widest mb-3">Quitar:</p>
                            <div className="flex flex-wrap gap-2">
                              {showDetail.customer_customization.ingredientsToRemove.map(ing => (
                                <button key={ing} onClick={() => setSelectedIngredientsToRemove(p => p.includes(ing) ? p.filter(x => x !== ing) : [...p, ing])} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedIngredientsToRemove.includes(ing) ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-white/5 text-white border-white/10'}`}>{ing}</button>
                              ))}
                            </div>
                          </div>
                        )}
                        {showDetail.customer_customization?.ingredientsToAdd && showDetail.customer_customization.ingredientsToAdd.length > 0 && (
                          <div>
                            <p className="text-[9px] font-black uppercase text-primary tracking-widest mb-3">Agregar:</p>
                            <div className="flex flex-wrap gap-2">
                              {showDetail.customer_customization.ingredientsToAdd.map(ing => (
                                <button key={ing} onClick={() => setSelectedExtras(p => p.includes(ing) ? p.filter(x => x !== ing) : [...p, ing])} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedExtras.includes(ing) ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white border-white/10'}`}>{ing}</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {hasNutritionalInfo(showDetail) && (
                    <div className="bg-background-dark/30 rounded-[2.5rem] p-6 border border-white/5">
                      <div className="flex items-center gap-2 mb-5"><span className="material-symbols-outlined text-primary text-xl">nutrition</span><h3 className="text-[13px] font-semibold text-white/70">Información Nutricional</h3></div>
                      <div className="grid grid-cols-2 gap-y-8 gap-x-4">
                        <NutritionalItem label="Calorías" value={showDetail.calories} unit="kcal" isPrimary />
                        <NutritionalItem label="Proteínas" value={showDetail.protein_g} unit="g" />
                        <NutritionalItem label="Grasas Totales" value={showDetail.total_fat_g} unit="g" />
                        <NutritionalItem label="Grasas Sat." value={showDetail.sat_fat_g} unit="g" />
                        <NutritionalItem label="Carbohidratos" value={showDetail.carbs_g} unit="g" />
                        <NutritionalItem label="Azúcares" value={showDetail.sugars_g} unit="g" />
                        <NutritionalItem label="Fibra" value={showDetail.fiber_g} unit="g" />
                        <NutritionalItem label="Sodio" value={showDetail.sodium_mg} unit="mg" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-surface-dark border-t border-white/5 space-y-3">
              {showDetail.availability !== false && showDetail.stock_quantity != null && showDetail.stock_quantity < 5 && (
                <p className="text-[11px] font-medium text-amber-400 mb-2">
                  Últimas unidades — {showDetail.stock_quantity} disponible{showDetail.stock_quantity !== 1 ? 's' : ''}
                </p>
              )}
              {showDetail.availability === false ? (
                <div className="w-full h-14 rounded-2xl bg-surface-dark-alt border border-border-dark flex items-center justify-center">
                  <span className="text-sm font-medium text-white/40">Agotado</span>
                </div>
              ) : existingInCart ? (
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleUpdateCurrent} 
                    className="w-full h-[54px] bg-primary text-black rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-all"
                  >
                    Actualizar Plato
                  </button>
                  <button 
                    onClick={handleAddNew} 
                    disabled={addingItems.has(showDetail.id)}
                    className="w-full h-[46px] bg-white/5 border border-border-dark text-white/70 rounded-[12px] font-medium text-[14px] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {addingItems.has(showDetail.id) ? (
                      <>
                        <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Agregando...</span>
                      </>
                    ) : (
                      'Agregar otro (+1)'
                    )}
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleAddNew} 
                  disabled={addingItems.has(showDetail.id)}
                  className="w-full h-[54px] bg-primary text-black rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {addingItems.has(showDetail.id) ? (
                    <>
                      <div className="size-5 border-2 border-background-dark border-t-transparent rounded-full animate-spin"></div>
                      <span>Agregando...</span>
                    </>
                  ) : (
                    'Agregar al Pedido'
                  )}
                </button>
              )}
              {/* CTA de cerrar - solo texto, tipografía más chica, plano secundario */}
              <button
                onClick={handleClosePdp}
                className="w-full text-text-secondary text-sm font-medium py-2 active:opacity-70 transition-opacity"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {isManageGuestsOpen && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !pendingGuestSelection && setIsManageGuestsOpen(false)}></div>
          <div className="bg-surface-dark w-full rounded-t-[40px] p-8 pb-12 border-t border-white/10 relative z-10 shadow-2xl animate-fade-in-up">
            <div className="flex justify-center mb-6"><div className="w-12 h-1.5 bg-white/10 rounded-full"></div></div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[20px] font-bold text-white tracking-tight">{pendingGuestSelection ? '¿Quién sos?' : 'Gestionar Comensales'}</h2>
              {!pendingGuestSelection && <span className="text-[11px] font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">{guests.length}/{tableCapacity}</span>}
            </div>
            {pendingGuestSelection && <p className="text-text-secondary text-sm mb-4">Tocá tu nombre para continuar.</p>}
            {!pendingGuestSelection && activeOrderId && (
              <div className="mb-6">
                <p className="text-text-secondary text-sm mb-3">
                  Podés invitar a otros a esta mesa compartiendo el código QR.
                </p>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-primary/30 transition-all"
                >
                  <span className="material-symbols-outlined text-2xl text-primary">qr_code_2</span>
                  <span className="font-bold text-white">Compartir enlace de mesa</span>
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-6">
              {guests.map(g => (
                <div 
                  key={g.id} 
                  className={`flex items-center gap-2 p-3 rounded-xl border transition-all min-w-0 ${selectedGuestId === g.id ? 'bg-primary/10 border-primary/40 shadow-lg' : 'bg-white/5 border-white/5'} ${pendingGuestSelection ? 'cursor-pointer active:bg-white/10' : ''}`}
                  onClick={pendingGuestSelection ? () => { onSelectGuest(g.id); onGuestIdentified?.(g.id); setIsManageGuestsOpen(false); } : undefined}
                >
                  <div 
                    className={`size-8 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 cursor-pointer ${getGuestColor(g.id)}`}
                    onClick={(e) => { e.stopPropagation(); onSelectGuest(g.id); if (pendingGuestSelection && onGuestIdentified) { onGuestIdentified(g.id); setIsManageGuestsOpen(false); } }}
                  >
                    {getInitials(g.name || backupNames[g.id] || '?')}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <input 
                      ref={el => { inputRefs.current[g.id] = el; }}
                      type="text" 
                      value={g.name} 
                      onChange={(e) => handleUpdateGuestName(g.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => handleBlurName(g.id, g.name)}
                      onClick={(e) => { if (!pendingGuestSelection) e.stopPropagation(); }}
                      readOnly={!!pendingGuestSelection}
                      className={`flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:ring-2 focus:ring-primary focus:outline-none placeholder:opacity-30 transition-all ${pendingGuestSelection ? 'cursor-pointer' : 'cursor-text'}`}
                      placeholder="Nombre..."
                    />
                    {!g.isHost && !pendingGuestSelection && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleShareGuestMenu(g.id); }}
                        className="size-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-primary hover:bg-primary/20 active:scale-95 shrink-0"
                        title="Compartir"
                      >
                        <span className="material-symbols-outlined text-[14px]">ios_share</span>
                      </button>
                    )}
                  </div>
                  {selectedGuestId === g.id && <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>}
                </div>
              ))}
            </div>
            {!pendingGuestSelection && (guests.length < tableCapacity ? (
              <div className="flex gap-3">
                <input type="text" value={newGuestName} onChange={e => setNewGuestName(e.target.value)} placeholder="Nuevo invitado..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:ring-2 focus:ring-primary transition-all" />
                <button onClick={handleAddGuest} className="bg-primary text-black px-6 rounded-2xl font-semibold active:scale-95 transition-all">Añadir</button>
              </div>
            ) : (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-500">warning</span>
                <p className="text-xs font-bold text-amber-500 uppercase">Se ha alcanzado la capacidad máxima de la mesa.</p>
              </div>
            ))}
            {!pendingGuestSelection && (hasChanges ? (
              <button 
                onClick={handleSaveChanges} 
                className="w-full h-[54px] bg-primary text-black rounded-[14px] mt-6 font-semibold text-[15px] active:scale-[0.98] transition-all"
              >
                Guardar cambios
              </button>
            ) : (
              <button 
                onClick={() => setIsManageGuestsOpen(false)} 
                className="w-full h-14 bg-white/5 text-white/60 border border-white/10 rounded-2xl mt-6 font-bold"
              >
                Cerrar
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal Producto no disponible - al hacer click en Aceptar se cierra y el producto queda marcado AGOTADO */}
      {showUnavailableModal && (
        <div className="fixed inset-0 z-[115] flex flex-col items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowUnavailableModal(false)} />
          <div className="relative z-10 bg-surface-dark rounded-3xl p-8 mx-4 max-w-sm w-full border border-white/10 shadow-2xl flex flex-col items-center gap-6">
            <p className="text-white font-bold text-center text-lg">Producto no disponible</p>
            <button
              onClick={() => setShowUnavailableModal(false)}
              className="w-full h-[54px] bg-primary text-black rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-all"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {showQrModal && activeOrderId && (
        <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowQrModal(false)} />
          <div className="relative z-10 bg-surface-dark rounded-3xl p-8 mx-4 max-w-sm w-full border border-white/10 shadow-2xl flex flex-col items-center">
            <h3 className="text-xl font-black text-white mb-2">Escanear para unirse</h3>
            <p className="text-text-secondary text-sm text-center mb-6">
              Los comensales pueden escanear este QR para seleccionar sus platos
            </p>
            <div className="bg-white p-4 rounded-2xl mb-6">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  `${window.location.origin}/join-table?orderId=${activeOrderId}`
                )}`}
                alt="QR para unirse a la mesa"
                className="size-[220px]"
              />
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-3 rounded-xl bg-white/10 text-white font-bold border border-white/10"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante: foto del mesero asignado - arriba del footer, siempre visible */}
      {waiter ? (
        <button
          onClick={() => setIsWaiterModalOpen(true)}
          className="fixed bottom-28 right-4 z-[70] size-14 rounded-full shadow-xl shadow-black/40 flex items-center justify-center overflow-hidden border-2 border-primary/60 transition-all active:scale-95"
          title="Solicitar al mesero"
        >
          <img
            src={waiter?.profile_photo_url || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyiwOtsINFh8RspVDg_Wx4QKXthNxCS7ZJlDSZvL6ADwFD3WRUpKHGhrscxV9dcR7w7guM4E-iFCNXx-tDgHs1BrbfGjolJoASehM-SEc4Pe6bKEx7zjcF4WAcON7mbdWJCepEdMPkBZ36lB_4tPTsJeNzTNqRNGKgusVb3U_X0WGEAgij6Y48HIunhj_BC8lxMdsB5ublmAltnyYerUKa_NkT8aybLFkaaRkQGQ_irdtS2ZQwrNGNj6b1ZrWY1HRClBeExJL615bG'}
            alt={waiter?.nickname || waiter?.full_name || 'Mesero'}
            className="w-full h-full object-cover"
          />
        </button>
      ) : null}

      {/* Modal de solicitud al mesero */}
      <WaiterRequestModal
        isOpen={isWaiterModalOpen}
        onClose={() => setIsWaiterModalOpen(false)}
        waiter={waiter}
        tableNumber={table?.table_number}
        orderId={activeOrderId}
      />
    </div>
  );
};

export default MenuView;
