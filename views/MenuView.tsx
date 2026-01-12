
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Guest, MenuItem, OrderItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';

interface MenuViewProps {
  guests: Guest[];
  setGuests: React.Dispatch<React.SetStateAction<Guest[]>>;
  cart: OrderItem[];
  onAddToCart: (item: MenuItem, guestId: string, extras: string[], removedIngredients: string[]) => Promise<void>;
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
  table?: any;
  restaurant?: any;
  onSaveGuestChanges?: (updatedGuests: Guest[], newGuests: Guest[]) => Promise<boolean>;
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
    <span className="text-[10px] uppercase font-black text-text-secondary tracking-widest mb-1.5">{label}</span>
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
  
  // Si no se encuentra, intentar con "Destacados"
  if (normalizedSlug === 'destacados') return 'Destacados';
  
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

const MenuView: React.FC<MenuViewProps> = ({ 
  guests, setGuests, cart, onAddToCart, onUpdateCartItem, onNext, 
  selectedGuestId, onSelectGuest, initialCategory, onCategoryChange, 
  editingCartItem, onCancelEdit, menuItems, categories: supabaseCategories,
  table, restaurant, onSaveGuestChanges
}) => {
  const { category: categorySlug, subcategory: subcategorySlug } = useParams<{ category?: string; subcategory?: string }>();
  const navigate = useNavigate();
  
  const [showDetail, setShowDetail] = useState<MenuItem | null>(null);
  const [isManageGuestsOpen, setIsManageGuestsOpen] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedIngredientsToRemove, setSelectedIngredientsToRemove] = useState<string[]>([]);
  const [newGuestName, setNewGuestName] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  
  // Sincronizar categoría desde la URL
  useEffect(() => {
    if (categorySlug) {
      const categoryName = slugToCategory(categorySlug, supabaseCategories);
      if (categoryName && categoryName !== initialCategory) {
        onCategoryChange(categoryName);
      }
    } else {
      // Si no hay slug en la URL, redirigir a "Destacados" por defecto
      if (initialCategory === 'Destacados') {
        navigate('/menu/destacados', { replace: true });
      } else {
        navigate(`/menu/${categoryToSlug(initialCategory)}`, { replace: true });
      }
    }
  }, [categorySlug, supabaseCategories, initialCategory, onCategoryChange, navigate]);
  
  // Sincronizar subcategoría desde la URL
  useEffect(() => {
    if (subcategorySlug && initialCategory) {
      const subcategoryId = subcategorySlugToId(subcategorySlug, supabaseCategories, initialCategory);
      if (subcategoryId && subcategoryId !== selectedSubcategory) {
        setSelectedSubcategory(subcategoryId);
      }
    } else if (!subcategorySlug && selectedSubcategory) {
      setSelectedSubcategory(null);
    }
  }, [subcategorySlug, initialCategory, supabaseCategories, selectedSubcategory]);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [backupNames, setBackupNames] = useState<Record<string, string>>({});
  const [originalGuests, setOriginalGuests] = useState<Guest[]>([]);
  const [pendingNewGuests, setPendingNewGuests] = useState<Guest[]>([]);
  const [addingItems, setAddingItems] = useState<Set<string>>(new Set()); // Track items being added

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

  // Limpiar personalizaciones cuando cambia el comensal seleccionado
  useEffect(() => {
    // Si hay un item abierto, recargar sus personalizaciones para el nuevo comensal
    if (showDetail) {
      const existing = guestSpecificCart.find(i => i.itemId === showDetail.id && (i.status === 'elegido' || (!i.status && !i.isConfirmed)));
      setSelectedExtras(existing?.extras || []);
      setSelectedIngredientsToRemove(existing?.removedIngredients || []);
    } else {
      // Si no hay item abierto, limpiar las selecciones
      setSelectedExtras([]);
      setSelectedIngredientsToRemove([]);
    }
  }, [selectedGuestId, showDetail, guestSpecificCart]);

  // Resetear subcategoría cuando cambia la categoría principal
  useEffect(() => {
    setSelectedSubcategory(null);
  }, [initialCategory]);

  const categoriesList = useMemo(() => {
    const dbCategories = (supabaseCategories || [])
      .filter(c => c.parent_id === null)
      .map(c => c.name);
    const filteredDbCats = dbCategories.filter(cat => cat.toLowerCase() !== 'destacados');
    return ['Destacados', ...filteredDbCats];
  }, [supabaseCategories]);

  // Cantidad total acumulada por categoría ESPECÍFICA del comensal seleccionado
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categoriesList.forEach(catName => {
      const catObj = supabaseCategories.find(c => c.name === catName);
      if (!catObj && catName !== 'Destacados') return;
      
      const subIds = catObj ? supabaseCategories.filter(c => c.parent_id === catObj.id).map(c => c.id) : [];
      const validIds = catObj ? [catObj.id, ...subIds] : [];
      
      // Filtramos por guestSpecificCart para reflejar solo lo que ese invitado pidió en todos sus lotes
      counts[catName] = guestSpecificCart.reduce((sum, cartItem) => {
        const menuItem = menuItems.find(m => m.id === cartItem.itemId);
        if (catName === 'Destacados') return menuItem?.is_featured ? sum + cartItem.quantity : sum;
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
    return sum + (menuItem ? Number(menuItem.price) * item.quantity : 0);
  }, 0);

  const handleOpenPdp = (item: MenuItem) => {
    setShowDetail(item);
    // Solo cargar personalizaciones del comensal actual para este item específico
    const existing = guestSpecificCart.find(i => i.itemId === item.id && (i.status === 'elegido' || (!i.status && !i.isConfirmed)));
    setSelectedExtras(existing?.extras || []);
    setSelectedIngredientsToRemove(existing?.removedIngredients || []);
  };

  const handleClosePdp = () => {
    setShowDetail(null);
    if (editingCartItem) onCancelEdit();
  };

  const handleIncrement = async (e: React.MouseEvent, item: MenuItem) => {
    e.stopPropagation();
    
    // Si ya está agregando este item, no hacer nada
    if (addingItems.has(item.id)) return;
    
    const simpleItem = getSimpleCartItemForGuest(item.id);
    if (simpleItem) {
      onUpdateCartItem(simpleItem.id, { quantity: simpleItem.quantity + 1 });
    } else {
      // Marcar como agregando
      setAddingItems(prev => new Set(prev).add(item.id));
      try {
        await onAddToCart(item, selectedGuestId, [], []);
      } catch (error) {
        console.error("Error al agregar item:", error);
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
    onUpdateCartItem(existingInCart.id, { 
      extras: [...selectedExtras], 
      removedIngredients: [...selectedIngredientsToRemove] 
    });
    handleClosePdp();
  };

  const handleAddNew = async () => {
    if (!showDetail) return;
    
    // Si ya está agregando este item, no hacer nada
    if (addingItems.has(showDetail.id)) return;
    
    // Marcar como agregando
    setAddingItems(prev => new Set(prev).add(showDetail.id));
    try {
      await onAddToCart(showDetail, selectedGuestId, [...selectedExtras], [...selectedIngredientsToRemove]);
    handleClosePdp();
    } catch (error) {
      console.error("Error al agregar item:", error);
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

  const handleAddGuest = () => {
    if (!newGuestName.trim()) return;
    if (guests.length + pendingNewGuests.length >= tableCapacity) {
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

  // Obtener subcategorías disponibles para la categoría actual
  const availableSubcategories = useMemo(() => {
    if (initialCategory === 'Destacados') return [];
    
    const parentCatObj = supabaseCategories.find(c => c.name === initialCategory);
    if (!parentCatObj) return [];
    
    const subCatIds = supabaseCategories.filter(c => c.parent_id === parentCatObj.id).map(c => c.id);
    const allRelevantIds = [parentCatObj.id, ...subCatIds];
    
    // Obtener todos los items de esta categoría
    const categoryItems = menuItems.filter(item => allRelevantIds.includes(item.category_id));
    
    // Extraer subcategory_id únicos que no sean null
    const uniqueSubcategoryIds = new Set<string>();
    categoryItems.forEach(item => {
      if (item.subcategory_id) {
        uniqueSubcategoryIds.add(item.subcategory_id);
      }
    });
    
    // Obtener los nombres de las subcategorías desde supabaseCategories
    const subcategoriesWithNames = Array.from(uniqueSubcategoryIds).map(subId => {
      const subCatObj = supabaseCategories.find(c => c.id === subId);
      return {
        id: subId,
        name: subCatObj?.name || subId
      };
    });
    
    return subcategoriesWithNames;
  }, [initialCategory, menuItems, supabaseCategories]);

  // Verificar si la categoría tiene subcategorías
  const hasSubcategories = availableSubcategories.length > 0;

  const filteredItems = useMemo(() => {
    if (initialCategory === 'Destacados') return menuItems.filter(item => item.is_featured);
    
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

  return (
    <div className="flex flex-col flex-1 h-screen bg-background-dark text-white overflow-hidden font-display relative">
      <header className="sticky top-0 z-40 bg-background-dark/95 backdrop-blur-md pb-4 border-b border-white/5">
        <div className="px-6 flex items-center justify-between pt-6 mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">MESA {table?.table_number?.toString().padStart(2, '0') || '04'}</span>
            <h1 className="text-2xl font-black text-white tracking-tight leading-none uppercase">{restaurant?.name || 'The Burger Joint'}</h1>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 pt-2 pb-2 items-start flex-nowrap snap-x touch-pan-x">
          {guests.map((g) => (
            <div key={g.id} className="flex flex-col items-center gap-2 shrink-0 max-w-[60px] snap-start">
              <button
                onClick={() => onSelectGuest(g.id)}
                className={`relative size-10 rounded-full transition-all duration-300 ${
                  selectedGuestId === g.id 
                    ? 'ring-4 ring-primary ring-offset-4 ring-offset-background-dark scale-105' 
                    : 'opacity-40 hover:opacity-100'
                }`}
              >
                <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center font-black text-sm ${getGuestColor(g.id)}`}>
                  {getInitials(g.name)}
                </div>
                {selectedGuestId === g.id && (
                  <div className="absolute -bottom-1 -right-1 bg-primary text-background-dark rounded-full size-5 flex items-center justify-center border-2 border-background-dark shadow-lg">
                    <span className="material-symbols-outlined text-[12px] font-black">check</span>
                  </div>
                )}
              </button>
              <span className={`text-[9px] font-black uppercase tracking-widest text-center truncate w-full ${selectedGuestId === g.id ? 'text-primary' : 'text-text-secondary opacity-60'}`}>
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
            <span className="text-[9px] font-black uppercase tracking-widest text-text-secondary opacity-60 text-center leading-tight">Administrar<br/>comensales</span>
          </div>
        </div>
      </header>

      <nav className="flex gap-4 overflow-x-auto no-scrollbar p-4 bg-background-dark border-b border-white/5">
        {categoriesList.map(cat => {
          const isDestacados = cat === 'Destacados';
          const isSelected = initialCategory === cat;
          
          return (
          <button
            key={cat}
            onClick={() => {
              const slug = cat === 'Destacados' ? 'destacados' : categoryToSlug(cat);
              navigate(`/menu/${slug}`);
              onCategoryChange(cat);
            }}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-colors ${
                isSelected 
                  ? 'bg-primary text-background-dark' 
                  : isDestacados 
                    ? 'bg-primary/20 text-primary border border-primary/30' 
                    : 'bg-white/5 text-text-secondary'
              }`}
          >
            {cat} {categoryCounts[cat] > 0 && <span className="ml-1 opacity-60">({categoryCounts[cat]})</span>}
          </button>
          );
        })}
      </nav>

      {hasSubcategories && (
        <nav className="flex gap-3 overflow-x-auto no-scrollbar px-4 py-3 bg-background-dark border-b border-white/5">
          <button
            onClick={() => {
              const categorySlug = initialCategory === 'Destacados' ? 'destacados' : categoryToSlug(initialCategory);
              navigate(`/menu/${categorySlug}`);
              setSelectedSubcategory(null);
            }}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-bold transition-colors shrink-0 ${
              selectedSubcategory === null
                ? 'bg-primary/30 text-primary border border-primary/50'
                : 'bg-white/5 text-text-secondary border border-white/5'
            }`}
          >
            Todos
          </button>
          {availableSubcategories.map(subcat => {
            const isSelected = selectedSubcategory === subcat.id;
            return (
              <button
                key={subcat.id}
                onClick={() => {
                  const categorySlug = initialCategory === 'Destacados' ? 'destacados' : categoryToSlug(initialCategory);
                  const subcategorySlug = categoryToSlug(subcat.name);
                  navigate(`/menu/${categorySlug}/${subcategorySlug}`);
                  setSelectedSubcategory(subcat.id);
                }}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-bold transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-primary/30 text-primary border border-primary/50'
                    : 'bg-white/5 text-text-secondary border border-white/5'
                }`}
              >
                {subcat.name}
              </button>
            );
          })}
        </nav>
      )}

      <main className="flex-1 overflow-y-auto p-4 pb-32 no-scrollbar">
        <div className="grid grid-cols-1 gap-4">
          {filteredItems.map(item => {
            const totalQty = getDishQuantityForGuest(item.id);
            const simpleItem = getSimpleCartItemForGuest(item.id);
            const showTrash = totalQty === 1;

            // Encontrar todos los items de la mesa para este plato (para visibilidad global)
            const tableItemsForDish = cart.filter(i => i.itemId === item.id);

            return (
              <div 
                key={item.id} 
                onClick={() => handleOpenPdp(item)}
                className="bg-surface-dark border border-white/5 rounded-3xl p-4 flex flex-col transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className="flex gap-4">
                  <div className="size-24 rounded-2xl bg-center bg-cover border border-white/5 shrink-0 shadow-lg" style={{ backgroundImage: `url('${item.image_url}')` }}></div>
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-bold text-base truncate">{item.name}</h3>
                    {item.is_new && (
                      <span className="px-2 py-0.5 rounded-full bg-primary text-background-dark text-[10px] font-black uppercase tracking-wider shrink-0">
                        NUEVO
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
                    <span className="text-primary font-black text-lg">${formatPrice(Number(item.price))}</span>
                    <div 
                      className="flex items-center z-10 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {addingItems.has(item.id) ? (
                        // Mostrar spinner mientras se guarda
                        <div className="px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                          <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : totalQty > 0 ? (
                        <div className="flex items-center gap-2 bg-background-dark/80 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-lg">
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
                          className="px-4 py-2 rounded-xl bg-black/40 border border-white/20 hover:bg-black/60 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined font-black text-base text-white">add</span>
                          <span className="text-sm font-bold text-white">Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                </div>

                {/* Visualización de personalizaciones del comensal seleccionado */}
                {tableItemsForDish
                  .filter(i => i.guestId === selectedGuestId && (i.extras?.length || i.removedIngredients?.length))
                  .map(i => (
                    <div key={i.id} className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3 animate-fade-in">
                      {i.extras?.map(ex => (
                        <span key={ex} className="text-[9px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">+{ex}</span>
                      ))}
                      {i.removedIngredients?.map(rem => (
                        <span key={rem} className="text-[9px] font-black uppercase bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md border border-red-500/20">-{rem}</span>
                      ))}
                      {i.quantity > 1 && <span className="text-[9px] font-black text-white/50 ml-1">x{i.quantity}</span>}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 pb-6 z-[60] pointer-events-none">
        <button 
          onClick={onNext}
          disabled={cart.length === 0}
          className="w-full h-16 bg-primary text-background-dark rounded-2xl flex items-center justify-between px-8 shadow-xl shadow-primary/20 font-black disabled:opacity-20 transition-all pointer-events-auto"
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
              <div className="h-64 w-full bg-center bg-cover" style={{ backgroundImage: `url('${showDetail.image_url}')` }}></div>
              <div className="p-8">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 pr-4">
                    <h2 className="text-3xl font-black leading-tight">{showDetail.name}</h2>
                    {showDetail.is_new && (
                      <span className="px-3 py-1 rounded-full bg-primary text-background-dark text-xs font-black uppercase tracking-wider shrink-0">
                        NUEVO
                      </span>
                    )}
                  </div>
                  <span className="text-2xl font-black text-primary">${formatPrice(Number(showDetail.price))}</span>
                </div>
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
                <p className="text-text-secondary leading-relaxed mb-8">{showDetail.description}</p>
                <div className="space-y-6">
                  {hasCustomization(showDetail) && (
                    <div className="bg-background-dark/30 rounded-[2.5rem] p-6 border border-white/5">
                      <div className="flex items-center gap-2 mb-6"><span className="material-symbols-outlined text-primary text-xl">tune</span><h3 className="text-[10px] font-black uppercase text-white tracking-[0.3em]">Personalización</h3></div>
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
                                <button key={ing} onClick={() => setSelectedExtras(p => p.includes(ing) ? p.filter(x => x !== ing) : [...p, ing])} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedExtras.includes(ing) ? 'bg-primary text-background-dark border-primary' : 'bg-white/5 text-white border-white/10'}`}>{ing}</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {hasNutritionalInfo(showDetail) && (
                    <div className="bg-background-dark/30 rounded-[2.5rem] p-6 border border-white/5">
                      <div className="flex items-center gap-2 mb-6"><span className="material-symbols-outlined text-primary text-xl">nutrition</span><h3 className="text-[10px] font-black uppercase text-white tracking-[0.3em]">Información Nutricional</h3></div>
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
              {existingInCart ? (
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleUpdateCurrent} 
                    className="w-full h-16 bg-primary text-background-dark rounded-2xl font-black text-lg shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                  >
                    Actualizar Plato
                  </button>
                  <button 
                    onClick={handleAddNew} 
                    disabled={addingItems.has(showDetail.id)}
                    className="w-full h-14 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  className="w-full h-16 bg-primary text-background-dark rounded-2xl font-black text-lg shadow-xl shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsManageGuestsOpen(false)}></div>
          <div className="bg-surface-dark w-full rounded-t-[40px] p-8 pb-12 border-t border-white/10 relative z-10 shadow-2xl animate-fade-in-up">
            <div className="flex justify-center mb-6"><div className="w-12 h-1.5 bg-white/10 rounded-full"></div></div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-white tracking-tight">Gestionar Comensales</h2>
              <span className="text-[10px] font-black text-primary uppercase bg-primary/10 px-3 py-1 rounded-full">Capacidad {guests.length}/{tableCapacity}</span>
            </div>
            <div className="space-y-4 mb-8 max-h-64 overflow-y-auto no-scrollbar">
              {guests.map(g => (
                <div key={g.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedGuestId === g.id ? 'bg-primary/10 border-primary/40 shadow-lg' : 'bg-white/5 border-white/5'}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div 
                      className={`size-10 rounded-full flex items-center justify-center font-black text-xs shrink-0 cursor-pointer ${getGuestColor(g.id)}`}
                      onClick={() => onSelectGuest(g.id)}
                    >
                      {getInitials(g.name || backupNames[g.id] || '?')}
                    </div>
                    <div className="flex-1 min-w-0 pr-2 relative flex items-center">
                       <input 
                         ref={el => { inputRefs.current[g.id] = el; }}
                         type="text" 
                         value={g.name} 
                         onChange={(e) => handleUpdateGuestName(g.id, e.target.value)}
                         onBlur={() => handleBlurName(g.id, g.name)}
                         onClick={(e) => e.stopPropagation()}
                         className="flex-1 bg-transparent border-none p-0 font-bold text-white focus:ring-0 focus:outline-none placeholder:opacity-30 cursor-text"
                         placeholder="Nombre del comensal..."
                       />
                    </div>
                  </div>
                  {selectedGuestId === g.id && <span className="material-symbols-outlined text-primary ml-2">check_circle</span>}
                </div>
              ))}
            </div>
            {guests.length < tableCapacity ? (
              <div className="flex gap-3">
                <input type="text" value={newGuestName} onChange={e => setNewGuestName(e.target.value)} placeholder="Nuevo invitado..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:ring-2 focus:ring-primary transition-all" />
                <button onClick={handleAddGuest} className="bg-primary text-background-dark px-6 rounded-2xl font-black active:scale-95 transition-all">Añadir</button>
              </div>
            ) : (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-500">warning</span>
                <p className="text-xs font-bold text-amber-500 uppercase">Se ha alcanzado la capacidad máxima de la mesa.</p>
              </div>
            )}
            {hasChanges ? (
              <button 
                onClick={handleSaveChanges} 
                className="w-full h-14 bg-primary text-background-dark rounded-2xl mt-6 font-black text-lg shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuView;
