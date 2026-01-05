
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Guest, MenuItem, OrderItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';

interface MenuViewProps {
  guests: Guest[];
  setGuests: React.Dispatch<React.SetStateAction<Guest[]>>;
  cart: OrderItem[];
  onAddToCart: (item: MenuItem, guestId: string, extras: string[], removedIngredients: string[]) => void;
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

const MenuView: React.FC<MenuViewProps> = ({ 
  guests, setGuests, cart, onAddToCart, onUpdateCartItem, onNext, 
  selectedGuestId, onSelectGuest, initialCategory, onCategoryChange, 
  editingCartItem, onCancelEdit, menuItems, categories: supabaseCategories,
  table, restaurant
}) => {
  const [showDetail, setShowDetail] = useState<MenuItem | null>(null);
  const [isManageGuestsOpen, setIsManageGuestsOpen] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedIngredientsToRemove, setSelectedIngredientsToRemove] = useState<string[]>([]);
  const [newGuestName, setNewGuestName] = useState('');
  
  const [dragY, setDragY] = useState(0);
  const isDragging = useRef(false);
  const startY = useRef(0);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [backupNames, setBackupNames] = useState<Record<string, string>>({});

  const tableCapacity = table?.capacity || 10;

  // Filtrar el carrito específico del comensal activo (incluye pendientes y confirmados de la DB)
  const guestSpecificCart = useMemo(() => cart.filter(item => item.guestId === selectedGuestId), [cart, selectedGuestId]);

  // Encontrar si el producto ya existe en el pedido del comensal actual
  const existingInCart = useMemo(() => {
    if (!showDetail) return null;
    if (editingCartItem && editingCartItem.itemId === showDetail.id) return editingCartItem;
    return guestSpecificCart.find(i => i.itemId === showDetail.id && !i.isConfirmed);
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
      const existing = guestSpecificCart.find(i => i.itemId === showDetail.id && !i.isConfirmed);
      setSelectedExtras(existing?.extras || []);
      setSelectedIngredientsToRemove(existing?.removedIngredients || []);
    } else {
      // Si no hay item abierto, limpiar las selecciones
      setSelectedExtras([]);
      setSelectedIngredientsToRemove([]);
    }
  }, [selectedGuestId, showDetail, guestSpecificCart]);

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
      !item.isConfirmed &&
      (!item.extras || item.extras.length === 0) && 
      (!item.removedIngredients || item.removedIngredients.length === 0)
    );
  };

  const pendingCount = cart.filter(item => !item.isConfirmed).reduce((sum, item) => sum + item.quantity, 0);
  const totalSessionPrice = cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? Number(menuItem.price) * item.quantity : 0);
  }, 0);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    startY.current = e.clientY - dragY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  };

  const handlePointerUp = () => {
    isDragging.current = false;
    if (dragY > 150) handleClosePdp();
    else setDragY(0);
  };

  const handleOpenPdp = (item: MenuItem) => {
    setShowDetail(item);
    // Solo cargar personalizaciones del comensal actual para este item específico
    const existing = guestSpecificCart.find(i => i.itemId === item.id && !i.isConfirmed);
    setSelectedExtras(existing?.extras || []);
    setSelectedIngredientsToRemove(existing?.removedIngredients || []);
    setDragY(0);
  };

  const handleClosePdp = () => {
    setShowDetail(null);
    setDragY(0);
    if (editingCartItem) onCancelEdit();
  };

  const handleIncrement = (e: React.MouseEvent, item: MenuItem) => {
    e.stopPropagation();
    const simpleItem = getSimpleCartItemForGuest(item.id);
    if (simpleItem) {
      onUpdateCartItem(simpleItem.id, { quantity: simpleItem.quantity + 1 });
    } else {
      onAddToCart(item, selectedGuestId, [], []);
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

  const handleAddNew = () => {
    if (!showDetail) return;
    onAddToCart(showDetail, selectedGuestId, [...selectedExtras], [...selectedIngredientsToRemove]);
    handleClosePdp();
  };

  const handleUpdateGuestName = (id: string, newName: string) => {
    setGuests(prev => prev.map(g => g.id === id ? { ...g, name: newName } : g));
  };

  const handleStartEditing = (id: string, currentName: string) => {
    setBackupNames(prev => ({ ...prev, [id]: currentName }));
    handleUpdateGuestName(id, '');
    setTimeout(() => {
      inputRefs.current[id]?.focus();
    }, 10);
  };

  const handleBlurName = (id: string, currentName: string) => {
    if (!currentName.trim()) {
      handleUpdateGuestName(id, backupNames[id] || `Invitado ${id}`);
    }
  };

  const handleAddGuest = () => {
    if (!newGuestName.trim()) return;
    if (guests.length >= tableCapacity) {
      alert(`La mesa tiene una capacidad máxima de ${tableCapacity} personas.`);
      return;
    }
    const newGuest: Guest = {
      id: (guests.length + 1).toString(),
      name: newGuestName.trim(),
      isHost: false
    };
    setGuests([...guests, newGuest]);
    setNewGuestName('');
    onSelectGuest(newGuest.id);
  };

  const filteredItems = useMemo(() => {
    if (initialCategory === 'Destacados') return menuItems.filter(item => item.is_featured);
    const parentCatObj = supabaseCategories.find(c => c.name === initialCategory);
    if (!parentCatObj) return [];
    const subCatIds = supabaseCategories.filter(c => c.parent_id === parentCatObj.id).map(c => c.id);
    const allRelevantIds = [parentCatObj.id, ...subCatIds];
    return menuItems.filter(item => allRelevantIds.includes(item.category_id));
  }, [initialCategory, menuItems, supabaseCategories]);

  const hasNutritionalInfo = (item: MenuItem) => {
    return item.calories !== null || item.protein_g !== null || item.total_fat_g !== null || 
           item.sat_fat_g !== null || item.carbs_g !== null || item.sugars_g !== null || 
           item.fiber_g !== null || item.sodium_mg !== null;
  };

  const hasCustomization = (item: MenuItem) => {
    return item.customer_customization?.ingredientsToAdd?.length || 
           item.customer_customization?.ingredientsToRemove?.length;
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
            <div key={g.id} className="flex flex-col items-center gap-2 shrink-0 max-w-[70px] snap-start">
              <button
                onClick={() => onSelectGuest(g.id)}
                className={`relative size-14 rounded-full transition-all duration-300 ${
                  selectedGuestId === g.id 
                    ? 'ring-4 ring-primary ring-offset-4 ring-offset-background-dark scale-105' 
                    : 'opacity-40 hover:opacity-100'
                }`}
              >
                <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center font-black text-lg ${getGuestColor(g.id)}`}>
                  {getInitials(g.name)}
                </div>
                {selectedGuestId === g.id && (
                  <div className="absolute -bottom-1 -right-1 bg-primary text-background-dark rounded-full size-6 flex items-center justify-center border-2 border-background-dark shadow-lg">
                    <span className="material-symbols-outlined text-[14px] font-black">check</span>
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
              className="size-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-text-secondary active:scale-95 transition-all hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-2xl">group</span>
            </button>
            <span className="text-[9px] font-black uppercase tracking-widest text-text-secondary opacity-60 text-center leading-tight">Administrar<br/>comensales</span>
          </div>
        </div>
      </header>

      <nav className="flex gap-4 overflow-x-auto no-scrollbar p-4 bg-background-dark border-b border-white/5">
        {categoriesList.map(cat => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-colors ${initialCategory === cat ? 'bg-primary text-background-dark' : 'bg-white/5 text-text-secondary'}`}
          >
            {cat} {categoryCounts[cat] > 0 && <span className="ml-1 opacity-60">({categoryCounts[cat]})</span>}
          </button>
        ))}
      </nav>

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
                  <div className="flex-1 flex flex-col justify-center min-w-0 pr-10">
                    <h3 className="font-bold text-base truncate mb-1">{item.name}</h3>
                    <p className="text-text-secondary text-xs line-clamp-2 mb-2">{item.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-primary font-black">${formatPrice(Number(item.price))}</span>
                    </div>
                  </div>

                  <div className="absolute right-4 top-4 flex flex-col items-center z-10">
                    {totalQty > 0 ? (
                      <div 
                        className="flex flex-col items-center bg-background-dark/80 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button 
                          onClick={(e) => handleIncrement(e, item)}
                          className="size-11 flex items-center justify-center text-primary active:bg-white/5 transition-colors"
                        >
                          <span className="material-symbols-outlined font-black">add</span>
                        </button>
                        
                        <div className="h-8 flex items-center justify-center">
                          <span className="text-sm font-black tabular-nums text-white">{totalQty}</span>
                        </div>

                        <button 
                          onClick={(e) => {
                            if (simpleItem) {
                              handleDecrement(e, item.id);
                            } else {
                              const anyItem = guestSpecificCart.find(i => i.itemId === item.id && !i.isConfirmed);
                              if (anyItem) onUpdateCartItem(anyItem.id, { quantity: anyItem.quantity - 1 });
                            }
                          }}
                          className={`size-11 flex items-center justify-center active:bg-white/5 transition-colors ${showTrash ? 'text-red-500' : 'text-primary'}`}
                        >
                          <span className="material-symbols-outlined font-black">
                            {showTrash ? 'delete' : 'remove'}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={(e) => handleIncrement(e, item)}
                        className="size-12 rounded-2xl bg-primary text-background-dark shadow-lg shadow-primary/20 flex items-center justify-center active:scale-90 transition-all"
                      >
                        <span className="material-symbols-outlined font-black">add</span>
                      </button>
                    )}
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
        <div className="fixed inset-0 z-[100] flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClosePdp}></div>
          <div 
            className="bg-surface-dark w-full rounded-t-[40px] border-t border-white/10 relative z-10 overflow-hidden max-h-[90vh] flex flex-col shadow-2xl"
            style={{ transform: `translateY(${dragY}px)` }}
          >
            <div className="flex justify-center py-4 bg-surface-dark sticky top-0 z-20 cursor-grab active:cursor-grabbing" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
              <div className="w-12 h-1.5 bg-white/10 rounded-full"></div>
            </div>
            <div className="overflow-y-auto flex-1 no-scrollbar">
              <div className="h-64 w-full bg-center bg-cover" style={{ backgroundImage: `url('${showDetail.image_url}')` }}></div>
              <div className="p-8">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-3xl font-black leading-tight pr-4">{showDetail.name}</h2>
                  <span className="text-2xl font-black text-primary">${formatPrice(Number(showDetail.price))}</span>
                </div>
                <p className="text-text-secondary leading-relaxed mb-8">{showDetail.description}</p>
                <div className="space-y-6">
                  {hasCustomization(showDetail) && (
                    <div className="bg-background-dark/30 rounded-[2.5rem] p-6 border border-white/5">
                      <div className="flex items-center gap-2 mb-6"><span className="material-symbols-outlined text-primary text-xl">tune</span><h3 className="text-[10px] font-black uppercase text-white tracking-[0.3em]">Personalización</h3></div>
                      <div className="space-y-6">
                        {showDetail.customer_customization?.ingredientsToRemove && (
                          <div>
                            <p className="text-[9px] font-black uppercase text-red-400 tracking-widest mb-3">Quitar:</p>
                            <div className="flex flex-wrap gap-2">
                              {showDetail.customer_customization.ingredientsToRemove.map(ing => (
                                <button key={ing} onClick={() => setSelectedIngredientsToRemove(p => p.includes(ing) ? p.filter(x => x !== ing) : [...p, ing])} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedIngredientsToRemove.includes(ing) ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-white/5 text-white border-white/10'}`}>{ing}</button>
                              ))}
                            </div>
                          </div>
                        )}
                        {showDetail.customer_customization?.ingredientsToAdd && (
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
            
            <div className="p-4 bg-surface-dark border-t border-white/5">
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
                    className="w-full h-14 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm active:scale-[0.98] transition-all"
                  >
                    Agregar otro (+1)
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleAddNew} 
                  className="w-full h-16 bg-primary text-background-dark rounded-2xl font-black text-lg shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                >
                  Agregar al Pedido
                </button>
              )}
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
                         className="flex-1 bg-transparent border-none p-0 font-bold text-white focus:ring-0 focus:outline-none placeholder:opacity-30"
                         placeholder="Nombre del comensal..."
                       />
                       <button 
                         onClick={() => handleStartEditing(g.id, g.name)}
                         className="ml-2 size-8 rounded-lg bg-white/5 flex items-center justify-center text-text-secondary hover:text-primary transition-colors"
                       >
                         <span className="material-symbols-outlined text-[20px]">edit_note</span>
                       </button>
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
            <button onClick={() => setIsManageGuestsOpen(false)} className="w-full h-14 bg-white/5 text-white/60 border border-white/10 rounded-2xl mt-6 font-bold">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuView;
