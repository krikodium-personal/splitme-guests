
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
  tableNumber?: number;
  restaurantName?: string;
}

export const formatPrice = (price: number) => {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

const NutritionalItem = ({ label, value, unit, isPrimary = false }: { label: string, value: any, unit: string, isPrimary?: boolean }) => (
  <div className={`flex flex-col border-l-2 ${isPrimary ? 'border-primary/20' : 'border-white/5'} pl-4`}>
    <span className="text-[10px] uppercase font-black text-text-secondary tracking-widest mb-1">{label}</span>
    <span className="text-xl font-black text-white">
      {value !== null && value !== undefined && value !== '' ? value : 'NA'} 
      {(value !== null && value !== undefined && value !== '') && <span className="text-[10px] text-text-secondary ml-1">{unit}</span>}
    </span>
  </div>
);

const MenuView: React.FC<MenuViewProps> = ({ 
  guests, setGuests, cart, onAddToCart, onUpdateCartItem, onNext, 
  selectedGuestId, onSelectGuest, initialCategory, onCategoryChange, 
  editingCartItem, onCancelEdit, menuItems, categories: supabaseCategories,
  tableNumber, restaurantName
}) => {
  const [showDetail, setShowDetail] = useState<MenuItem | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string>('Todos');
  
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedIngredientsToRemove, setSelectedIngredientsToRemove] = useState<string[]>([]);
  
  const [dragY, setDragY] = useState(0);
  const isDragging = useRef(false);
  const startY = useRef(0);

  useEffect(() => {
    if (editingCartItem) {
      const item = menuItems.find(m => m.id === editingCartItem.itemId);
      if (item) {
        setShowDetail(item);
        setSelectedExtras(editingCartItem.extras || []);
        setSelectedIngredientsToRemove(editingCartItem.removedIngredients || []);
      }
    }
  }, [editingCartItem, menuItems]);

  const categoriesList = useMemo(() => {
    const dbCategories = (supabaseCategories || [])
      .filter(c => c.parent_id === null)
      .map(c => c.name);
    
    const filteredDbCats = dbCategories.filter(cat => cat.toLowerCase() !== 'destacados');
    return ['Destacados', ...filteredDbCats];
  }, [supabaseCategories]);

  const availableSubcategories = useMemo(() => {
    if (initialCategory === 'Destacados') return ['Todos'];
    const parentCat = supabaseCategories.find(c => c.name === initialCategory);
    if (!parentCat) return ['Todos'];
    const subs = supabaseCategories.filter(c => c.parent_id === parentCat.id).map(c => c.name);
    return ['Todos', ...subs];
  }, [initialCategory, supabaseCategories]);

  useEffect(() => setActiveSubcategory('Todos'), [initialCategory]);

  const guestSpecificCart = useMemo(() => cart.filter(item => item.guestId === selectedGuestId), [cart, selectedGuestId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categoriesList.forEach(catName => {
      const catObj = supabaseCategories.find(c => c.name === catName);
      if (!catObj && catName !== 'Destacados') return;

      const subIds = catObj ? supabaseCategories.filter(c => c.parent_id === catObj.id).map(c => c.id) : [];
      const validIds = catObj ? [catObj.id, ...subIds] : [];

      counts[catName] = guestSpecificCart.reduce((sum, cartItem) => {
        const menuItem = menuItems.find(m => m.id === cartItem.itemId);
        if (catName === 'Destacados') return menuItem?.is_featured ? sum + cartItem.quantity : sum;
        return menuItem && validIds.includes(menuItem.category_id) ? sum + cartItem.quantity : sum;
      }, 0);
    });
    return counts;
  }, [guestSpecificCart, categoriesList, menuItems, supabaseCategories]);

  const getDishQuantityForGuest = (itemId: string) => guestSpecificCart.filter(item => item.itemId === itemId).reduce((sum, item) => sum + item.quantity, 0);

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => {
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
    setDragY(0);
  };

  const handleOpenPdp = (item: MenuItem) => {
    setShowDetail(item);
    setSelectedExtras([]);
    setSelectedIngredientsToRemove([]);
    setDragY(0);
  };

  const handleClosePdp = () => {
    setShowDetail(null);
    setDragY(0);
    if (editingCartItem) onCancelEdit();
  };

  const handleSaveItem = () => {
    if (!showDetail) return;
    if (editingCartItem) {
      onUpdateCartItem(editingCartItem.id, { 
        extras: [...selectedExtras], 
        removedIngredients: [...selectedIngredientsToRemove] 
      });
    } else {
      onAddToCart(showDetail, selectedGuestId, [...selectedExtras], [...selectedIngredientsToRemove]);
    }
    handleClosePdp();
  };

  const toggleIngredientToRemove = (ing: string) => {
    setSelectedIngredientsToRemove(prev => 
      prev.includes(ing) ? prev.filter(i => i !== ing) : [...prev, ing]
    );
  };

  const toggleExtraToAdd = (extra: string) => {
    setSelectedExtras(prev => 
      prev.includes(extra) ? prev.filter(i => i !== extra) : [...prev, extra]
    );
  };

  const filteredItems = useMemo(() => {
    if (initialCategory === 'Destacados') return menuItems.filter(item => item.is_featured);
    const parentCatObj = supabaseCategories.find(c => c.name === initialCategory);
    if (!parentCatObj) return [];

    const subCatIds = supabaseCategories
      .filter(c => c.parent_id === parentCatObj.id)
      .map(c => c.id);
    const allRelevantIds = [parentCatObj.id, ...subCatIds];

    return menuItems.filter(item => {
      const belongsToTree = allRelevantIds.includes(item.category_id);
      if (activeSubcategory === 'Todos') return belongsToTree;
      const subCatObj = supabaseCategories.find(c => c.name === activeSubcategory && c.parent_id === parentCatObj.id);
      return item.category_id === subCatObj?.id || item.subcategory_id === subCatObj?.id;
    });
  }, [initialCategory, activeSubcategory, menuItems, supabaseCategories]);

  return (
    <div className="relative flex flex-col flex-1 pb-24 overflow-hidden bg-background-dark text-white font-display">
      <header className="sticky top-0 z-40 bg-background-dark/95 backdrop-blur-md border-b border-white/5 shadow-md">
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-primary uppercase tracking-wider mb-0.5">Mesa {tableNumber || '--'}</span>
            <h1 className="text-white text-xl font-bold leading-tight tracking-tight">{restaurantName || 'Cargando...'}</h1>
          </div>
          <button className="flex items-center justify-center rounded-full size-10 bg-white/5 hover:bg-white/10 text-white transition-colors">
            <span className="material-symbols-outlined">search</span>
          </button>
        </div>
        
        <div className="w-full border-b border-white/5 bg-surface-dark-alt/50">
          <div className="flex gap-4 px-4 py-3 overflow-x-auto no-scrollbar snap-x items-center scroll-smooth">
            {guests.map((guest) => (
              <button key={guest.id} onClick={() => onSelectGuest(guest.id)} className={`snap-start shrink-0 flex flex-col items-center justify-center gap-1 transition-opacity ${selectedGuestId === guest.id ? 'opacity-100' : 'opacity-60'}`}>
                <div className={`relative size-12 rounded-full flex items-center justify-center shadow-lg transition-all ${selectedGuestId === guest.id ? 'bg-primary ring-2 ring-primary ring-offset-2 ring-offset-background-dark' : 'border-2 border-dashed border-white/20'} ${getGuestColor(guest.id)}`}>
                  <span className={`text-sm font-black ${selectedGuestId === guest.id ? 'text-background-dark' : 'text-white'}`}>{getInitials(guest.name)}</span>
                </div>
                <span className={`text-xs font-bold ${selectedGuestId === guest.id ? 'text-primary' : 'text-gray-400'} max-w-[64px] truncate`}>{guest.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 px-4 py-4 overflow-x-auto no-scrollbar scroll-smooth border-b border-white/5">
          {categoriesList.map((cat) => {
            const count = categoryCounts[cat] || 0;
            const isFeatured = cat === 'Destacados';
            return (
              <button 
                key={cat} 
                onClick={() => onCategoryChange(cat)} 
                className={`shrink-0 flex items-center justify-center h-10 px-6 rounded-full transition-all font-bold text-sm gap-2 whitespace-nowrap ${
                  initialCategory === cat 
                    ? 'bg-primary text-background-dark shadow-[0_0_15px_rgba(19,236,106,0.3)]' 
                    : 'bg-surface-dark-alt border border-white/5 text-white/70'
                }`}
              >
                {isFeatured && <span className="material-symbols-outlined text-[18px] filled">auto_awesome</span>}
                <span>{cat}</span>
                {count > 0 && (
                  <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black ${
                    initialCategory === cat ? 'bg-background-dark text-primary' : 'bg-primary text-background-dark'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar scroll-smooth bg-background-dark/50">
          {availableSubcategories.map((sub) => (
            <button key={sub} onClick={() => setActiveSubcategory(sub)} className={`shrink-0 flex items-center justify-center h-8 px-4 rounded-full transition-all text-xs font-bold whitespace-nowrap ${activeSubcategory === sub ? 'bg-white/20 text-white' : 'text-text-secondary'}`}>{sub}</button>
          ))}
        </div>
      </header>

      <main className="flex-1 flex flex-col w-full max-w-md mx-auto no-scrollbar">
        <div className="px-4 pt-6 pb-2">
          <h2 className="text-white text-3xl font-black tracking-tight flex items-center gap-3">{initialCategory}</h2>
        </div>
        
        <div className="flex flex-col mt-2">
          {filteredItems.map((item) => {
            const dishCount = getDishQuantityForGuest(item.id);
            return (
              <div key={item.id} onClick={() => handleOpenPdp(item)} className="group flex justify-between gap-4 p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                <div className="flex flex-col flex-1 gap-1 pr-2">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {item.dietary_tags?.map(tag => (
                      <span key={tag} className="bg-primary/10 text-primary text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest">{tag}</span>
                    ))}
                  </div>
                  <h3 className="text-white text-base font-bold leading-tight">{item.name}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed line-clamp-2 mt-1">{item.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-primary font-bold text-base tabular-nums">${formatPrice(Number(item.price))}</span>
                    <button onClick={(e) => { e.stopPropagation(); onAddToCart(item, selectedGuestId, [], []); }} className="h-9 px-4 bg-surface-dark-alt border border-white/10 rounded-xl text-white text-sm font-bold flex items-center gap-1 active:bg-primary active:text-background-dark shadow-sm">
                      <span className="material-symbols-outlined text-[18px]">add</span> Agregar
                    </button>
                  </div>
                </div>
                <div className="shrink-0">
                  <div className="size-28 rounded-[24px] bg-center bg-cover shadow-lg relative overflow-hidden border border-white/5" 
                       style={{ backgroundImage: `url('${item.image_url || 'https://via.placeholder.com/150'}')` }}>
                    {dishCount > 0 && (
                      <div className="absolute inset-0 bg-background-dark/30 backdrop-blur-[2px] flex items-center justify-center">
                        <div className="bg-primary text-background-dark size-10 rounded-full border-4 border-background-dark flex items-center justify-center font-black">{dishCount}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {totalCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-dark via-background-dark to-transparent pt-12 z-30">
          <button onClick={onNext} className="w-full flex items-center justify-between bg-primary text-background-dark h-16 rounded-2xl px-6 shadow-[0_4px_30px_rgba(19,236,106,0.3)]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center bg-background-dark/20 size-10 rounded-full"><span className="font-black text-base">{totalCount}</span></div>
              <span className="font-black text-xl tracking-tighter">Ver Orden</span>
            </div>
            <span className="font-black text-xl tabular-nums">${formatPrice(totalPrice)}</span>
          </button>
        </div>
      )}

      {showDetail && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end items-center">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={handleClosePdp}></div>
          <div className="bg-background-dark w-full h-[94%] max-w-md rounded-t-[48px] flex flex-col shadow-2xl relative overflow-hidden border-t border-white/10" style={{ transform: `translateY(${dragY}px)` }}>
            <div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} className="w-full flex justify-center pt-4 pb-2 shrink-0 bg-background-dark z-20 cursor-grab"><div className="h-2 w-16 rounded-full bg-white/10"></div></div>
            <div className="flex-1 overflow-y-auto no-scrollbar relative pb-40 px-8">
              <div className="pt-2 pb-6">
                <div className="w-full aspect-[4/3] rounded-[40px] overflow-hidden shadow-2xl border border-white/5 bg-cover bg-center" style={{ backgroundImage: `url("${showDetail.image_url}")` }}></div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2 mb-2">
                  {showDetail.dietary_tags?.map(tag => (
                    <span key={tag} className="bg-primary/20 text-primary text-[10px] font-black uppercase px-2 py-1 rounded tracking-widest">{tag}</span>
                  ))}
                </div>
                <h1 className="text-3xl font-black text-white">{showDetail.name}</h1>
                <p className="text-2xl font-black text-primary">${formatPrice(Number(showDetail.price))}</p>
                <p className="text-base leading-relaxed text-[#9db9a8] pt-4">{showDetail.description}</p>

                {/* PERSONALIZACIÓN: Ingredientes a Quitar */}
                {showDetail.customer_customization?.ingredientsToRemove && showDetail.customer_customization.ingredientsToRemove.length > 0 && (
                  <div className="mt-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <h3 className="text-sm font-black uppercase tracking-widest text-text-secondary mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">do_not_disturb_on</span> Quitar Ingredientes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {showDetail.customer_customization.ingredientsToRemove.map((ing) => (
                        <button
                          key={ing}
                          onClick={() => toggleIngredientToRemove(ing)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                            selectedIngredientsToRemove.includes(ing)
                              ? 'bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                              : 'bg-surface-dark border-white/5 text-white/50 hover:border-white/20'
                          }`}
                        >
                          {selectedIngredientsToRemove.includes(ing) ? 'Quitar ' : ''}{ing}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* PERSONALIZACIÓN: Extras a Agregar */}
                {showDetail.customer_customization?.ingredientsToAdd && showDetail.customer_customization.ingredientsToAdd.length > 0 && (
                  <div className="mt-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <h3 className="text-sm font-black uppercase tracking-widest text-text-secondary mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">add_circle</span> Extras (Personalizar)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {showDetail.customer_customization.ingredientsToAdd.map((extra) => (
                        <button
                          key={extra}
                          onClick={() => toggleExtraToAdd(extra)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                            selectedExtras.includes(extra)
                              ? 'bg-primary/10 border-primary text-primary shadow-[0_0_10px_rgba(19,236,106,0.2)]'
                              : 'bg-surface-dark border-white/5 text-white/50 hover:border-white/20'
                          }`}
                        >
                          {selectedExtras.includes(extra) ? 'Agregado: ' : '+ '}{extra}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TABLA NUTRICIONAL COMPLETA */}
                {(showDetail.calories || showDetail.protein_g || showDetail.total_fat_g || 
                  showDetail.sat_fat_g || showDetail.carbs_g || showDetail.sugar_g || 
                  showDetail.fiber_g || showDetail.sodium_mg) && (
                  <div className="mt-10 mb-8 bg-surface-dark rounded-[2.5rem] p-8 border border-white/5 shadow-xl animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary mb-6 flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined filled">nutrition</span> Información Nutricional
                    </h3>
                    <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                      <NutritionalItem label="Calorías" value={showDetail.calories} unit="kcal" isPrimary={true} />
                      <NutritionalItem label="Proteínas" value={showDetail.protein_g} unit="g" />
                      <NutritionalItem label="Grasas Totales" value={showDetail.total_fat_g} unit="g" />
                      <NutritionalItem label="Grasas Saturadas" value={showDetail.sat_fat_g} unit="g" />
                      <NutritionalItem label="Carbohidratos" value={showDetail.carbs_g} unit="g" />
                      <NutritionalItem label="Azúcares" value={showDetail.sugar_g} unit="g" />
                      <NutritionalItem label="Fibra" value={showDetail.fiber_g} unit="g" />
                      <NutritionalItem label="Sodio" value={showDetail.sodium_mg} unit="mg" />
                    </div>
                    <div className="mt-6 pt-6 border-t border-white/5">
                      <p className="text-[9px] text-center text-text-secondary leading-relaxed opacity-60">
                        *Valores basados en una porción estándar. NA indica información no disponible. Los requerimientos diarios pueden variar según la dieta individual.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="w-full absolute bottom-0 left-0 bg-background-dark/95 backdrop-blur-2xl border-t border-white/10 p-6 pb-12 z-40">
              <button 
                onClick={handleSaveItem} 
                className="w-full h-16 bg-primary text-background-dark rounded-2xl flex items-center justify-between px-8 transition-all shadow-2xl shadow-primary/20 active:scale-[0.98]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tighter">
                    {editingCartItem ? 'Actualizar Selección' : 'Añadir a la Orden'}
                  </span>
                  { (selectedExtras.length > 0 || selectedIngredientsToRemove.length > 0) && (
                    <span className="flex size-6 items-center justify-center bg-background-dark/10 rounded-full text-[10px] font-black">
                      {selectedExtras.length + selectedIngredientsToRemove.length}
                    </span>
                  )}
                </div>
                <span className="text-xl font-black tabular-nums">${formatPrice(Number(showDetail.price))}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuView;
