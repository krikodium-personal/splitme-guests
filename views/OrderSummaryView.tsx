
import React, { useState } from 'react';
import { Guest, OrderItem, MenuItem } from '../types';
import { formatPrice } from './MenuView';

interface OrderSummaryViewProps {
  guests: Guest[];
  cart: OrderItem[];
  onBack: () => void;
  onNavigateToCategory: (guestId: string, category: string) => void;
  onEditItem: (cartItem: OrderItem) => void;
  onSend: () => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  menuItems: MenuItem[];
  categories: any[];
  tableNumber?: number;
  waiter?: any;
}

const TARGET_MAIN_CATEGORY_ID = 'bcf96b4d-56d5-4903-8af3-f5020c8db28c';

const UpsellBanner: React.FC<{
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}> = ({ icon, title, description, actionLabel, onClick }) => (
  <div className="px-4 py-2 animate-fade-in">
    <div className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-surface-dark border border-border-dark p-3.5 shadow-sm transition-all active:scale-[0.99]">
      <div className="absolute -left-0.5 top-2 bottom-2 w-1 rounded-r-full bg-primary/50"></div>
      <div className="flex items-center gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background-dark border border-white/5 text-primary shadow-inner">
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <div className="flex flex-col">
          <p className="text-white text-sm font-bold leading-tight">{title}</p>
          <p className="text-text-secondary text-xs font-medium leading-normal line-clamp-1">{description}</p>
        </div>
      </div>
      <button 
        onClick={onClick} 
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-background-dark transition-colors hover:bg-white"
      >
        {actionLabel}
      </button>
    </div>
  </div>
);

const OrderSummaryView: React.FC<OrderSummaryViewProps> = ({ 
  guests, cart, onBack, onNavigateToCategory, onEditItem, onSend, onUpdateQuantity, menuItems, categories, tableNumber, waiter
}) => {
  const [isServiceChargeSheetOpen, setIsServiceChargeSheetOpen] = useState(false);
  const [serviceChargePercent, setServiceChargePercent] = useState<number>(10);
  const [customServiceCharge, setCustomServiceCharge] = useState<string>('');

  const getGuestItems = (guestId: string) => cart.filter(i => i.guestId === guestId);

  const getGuestTotal = (guestId: string) => {
    return getGuestItems(guestId).reduce((sum, item) => {
      const menuItem = menuItems.find(m => m.id === item.itemId);
      return sum + (menuItem?.price || 0) * item.quantity;
    }, 0);
  };

  const grandTotal = cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? menuItem.price * item.quantity : 0);
  }, 0);

  const tax = grandTotal * 0.08;
  const serviceChargeValue = customServiceCharge !== '' ? parseFloat(customServiceCharge) || 0 : (grandTotal * (serviceChargePercent / 100));
  const finalTotal = grandTotal + tax + serviceChargeValue;

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-display antialiased h-screen w-full overflow-hidden flex flex-col">
      <div className="flex items-center dark:bg-background-dark p-4 pb-2 justify-between z-10 shrink-0 border-b border-white/5">
        <button onClick={onBack} className="text-white flex size-12 shrink-0 items-center justify-start transition-colors hover:text-primary">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
        </button>
        <h2 className="text-white text-lg font-bold leading-tight flex-1 text-center">Resumen de tu Orden</h2>
        <div className="flex items-center justify-end">
          <div className="bg-surface-dark px-3 py-1 rounded-full border border-border-dark">
            <p className="text-primary text-sm font-bold leading-normal">Mesa {tableNumber || '--'}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-40 no-scrollbar">
        {guests.map((guest) => {
          const guestItems = getGuestItems(guest.id);
          const hasItems = guestItems.length > 0;

          const mainCategoryObj = categories.find(c => c.id === TARGET_MAIN_CATEGORY_ID);
          const mainCategoryName = mainCategoryObj?.name || 'Fuertes';

          const relevantSubCategoryIds = categories.filter(c => c.parent_id === TARGET_MAIN_CATEGORY_ID).map(c => c.id);
          const allMainCategoryIds = [TARGET_MAIN_CATEGORY_ID, ...relevantSubCategoryIds];

          const hasMainPlate = guestItems.some(cartItem => {
            const menuItem = menuItems.find(m => m.id === cartItem.itemId);
            return menuItem && allMainCategoryIds.includes(menuItem.category_id);
          });

          const checkCategoryByName = (itemId: string, namePart: string) => {
            const item = menuItems.find(m => m.id === itemId);
            if (!item) return false;
            const category = categories.find(c => c.id === item.category_id);
            return category?.name?.toLowerCase().includes(namePart.toLowerCase()) || false;
          };

          const hasDrink = guestItems.some(item => checkCategoryByName(item.itemId, 'Bebidas') || checkCategoryByName(item.itemId, 'Gaseosas') || checkCategoryByName(item.itemId, 'Alcohol') || checkCategoryByName(item.itemId, 'Sin alcohol'));
          const hasDessert = guestItems.some(item => checkCategoryByName(item.itemId, 'Postres'));

          return (
            <div key={guest.id} className="flex flex-col">
              <div className="flex justify-between items-end px-4 pb-2 pt-6">
                <div className="flex items-center gap-2 group cursor-pointer">
                  <h2 className="text-white tracking-tight text-xl font-bold leading-tight">
                    {guest.name}
                    {guest.isHost && <span className="ml-2 text-[10px] font-black uppercase text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">Tú</span>}
                  </h2>
                  <span className="material-symbols-outlined text-text-secondary group-hover:text-primary text-lg transition-colors">edit</span>
                </div>
                {hasItems && <span className="text-text-secondary text-sm font-medium">${formatPrice(getGuestTotal(guest.id))}</span>}
              </div>

              {hasItems ? (
                <>
                  {guestItems.map((cartItem) => {
                    const menuItem = menuItems.find(m => m.id === cartItem.itemId);
                    if (!menuItem) return null;
                    return (
                      <div key={cartItem.id} className="flex items-center gap-4 px-4 py-3 justify-between group">
                        <div className="flex items-center gap-4 flex-1">
                          <div 
                            className="bg-center bg-no-repeat aspect-square bg-cover rounded-[8px] size-16 shrink-0 border border-white/10" 
                            style={{ backgroundImage: `url("${menuItem.image_url}")` }}
                          ></div>
                          <div className="flex flex-col justify-center">
                            <p className="text-white text-base font-medium leading-normal line-clamp-1">{menuItem.name}</p>
                            <p className="text-text-secondary text-sm font-normal">${formatPrice(Number(menuItem.price))}</p>
                            <button onClick={() => onEditItem(cartItem)} className="text-primary text-xs font-bold text-left mt-1.5 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">edit_note</span>Editar detalles
                            </button>
                          </div>
                        </div>
                        <div className="shrink-0 pl-2">
                          <div className="flex items-center gap-2 text-white bg-surface-dark rounded-full p-1 border border-border-dark">
                            <button onClick={() => onUpdateQuantity(cartItem.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10"><span className="material-symbols-outlined text-sm">remove</span></button>
                            <span className="text-sm font-bold w-4 text-center">{cartItem.quantity}</span>
                            <button onClick={() => onUpdateQuantity(cartItem.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><span className="material-symbols-outlined text-sm">add</span></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-col">
                    {!hasMainPlate && (
                      <UpsellBanner 
                        icon="restaurant" 
                        title="¿Hambre?" 
                        description="Agrega un platillo principal para completar tu comida." 
                        actionLabel="Agregar Plato" 
                        onClick={() => onNavigateToCategory(guest.id, mainCategoryName)} 
                      />
                    )}
                    {!hasDrink && (
                      <UpsellBanner 
                        icon="local_bar" 
                        title="¿Sed?" 
                        description="Acompaña tu comida con una bebida refrescante." 
                        actionLabel="Agregar Bebida" 
                        onClick={() => onNavigateToCategory(guest.id, 'Sin alcohol')} 
                      />
                    )}
                    {!hasDessert && (
                      <UpsellBanner 
                        icon="icecream" 
                        title="¿Un capricho dulce?" 
                        description="No olvides probar nuestros postres artesanales." 
                        actionLabel="Ver Postres" 
                        onClick={() => onNavigateToCategory(guest.id, 'Postres')} 
                      />
                    )}
                  </div>
                </>
              ) : (
                <div onClick={() => onNavigateToCategory(guest.id, 'Destacados')} className="mx-4 mt-2 p-4 rounded-xl border border-dashed border-border-dark flex items-center justify-between group cursor-pointer hover:bg-surface-dark/50 transition-colors">
                  <div className="flex flex-col gap-1"><p className="text-text-secondary text-sm font-medium">Nada seleccionado</p><p className="text-primary text-xs font-bold uppercase tracking-wider">Empezar a ordenar</p></div>
                  <div className="size-8 rounded-full bg-surface-dark flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><span className="material-symbols-outlined">add</span></div>
                </div>
              )}
              <div className="h-px w-full bg-white/5 my-2 mx-4 max-w-[calc(100%-32px)]"></div>
            </div>
          );
        })}

        <div className="px-5 py-6 bg-surface-dark/30 mx-4 rounded-2xl border border-white/5 mt-4">
          <div className="flex justify-between items-center mb-3"><span className="text-text-secondary text-sm">Subtotal</span><span className="text-white font-medium">${formatPrice(grandTotal)}</span></div>
          <div className="flex justify-between items-center mb-3"><span className="text-text-secondary text-sm">Impuestos (8%)</span><span className="text-white font-medium">${formatPrice(tax)}</span></div>
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2"><span className="text-text-secondary text-sm">Cargo por servicio ({serviceChargePercent}%)</span><button onClick={() => setIsServiceChargeSheetOpen(true)} className="text-primary text-xs font-bold uppercase tracking-wider">Modificar</button></div>
            <span className="text-white font-medium">${formatPrice(serviceChargeValue)}</span>
          </div>
          <div className="flex justify-between items-center"><span className="text-white text-lg font-bold">Total</span><span className="text-primary text-2xl font-extrabold tracking-tight">${formatPrice(finalTotal)}</span></div>
        </div>
      </div>

      {isServiceChargeSheetOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsServiceChargeSheetOpen(false)}></div>
          <div className="bg-[#102217] w-full max-w-md mx-auto rounded-t-[32px] p-6 relative z-10 animate-fade-in-up border-t border-white/5">
            <div className="flex justify-center mb-6"><div className="w-12 h-1.5 bg-white/20 rounded-full"></div></div>
            <div className="flex justify-between items-start mb-6"><h2 className="text-2xl font-bold text-white">Servicio / Propina</h2><button onClick={() => setIsServiceChargeSheetOpen(false)} className="size-8 rounded-full bg-white/10 flex items-center justify-center"><span className="material-symbols-outlined text-sm">close</span></button></div>
            <div className="flex items-center gap-4 mb-8">
              <div className="relative">
                <img src={waiter?.profile_photo_url || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyiwOtsINFh8RspVDg_Wx4QKXthNxCS7ZJlDSZvL6ADwFD3WRUpKHGhrscxV9dcR7w7guM4E-iFCNXx-tDgHs1BrbfGjolJoASehM-SEc4Pe6bKEx7zjcF4WAcON7mbdWJCepEdMPkBZ36lB_4tPTsJeNzTNqRNGKgusVb3U_X0WGEAgij6Y48HIunhj_BC8lxMdsB5ublmAltnyYerUKa_NkT8aybLFkaaRkQGQ_irdtS2ZQwrNGNj6b1ZrWY1HRClBeExJL615bG'} alt={waiter?.nickname || 'Mesero'} className="size-12 rounded-full object-cover border border-primary/30" />
                <div className="absolute -bottom-1 -right-1 size-5 bg-primary rounded-full flex items-center justify-center border-2 border-[#102217]"><span className="material-symbols-outlined text-[10px] text-black font-bold">check</span></div>
              </div>
              <div className="flex flex-col"><span className="text-white font-bold">{waiter?.nickname || waiter?.full_name || 'Alex "The Flash"'}</span><span className="text-[#9db9a8] text-xs">¡Gracias por visitarnos hoy!</span></div>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-8">
              {[5, 8, 10, 15].map((percent) => (
                <button key={percent} onClick={() => { setServiceChargePercent(percent); setCustomServiceCharge(''); }} className={`flex flex-col items-center justify-center py-3 px-2 rounded-2xl border transition-all ${serviceChargePercent === percent && customServiceCharge === '' ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}>
                  <span className={`text-lg font-bold ${serviceChargePercent === percent && customServiceCharge === '' ? 'text-primary' : 'text-white'}`}>{percent}%</span>
                  <span className="text-[#9db9a8] text-[10px] font-medium">${formatPrice(grandTotal * (percent / 100))}</span>
                </button>
              ))}
            </div>
            <div className="mb-8">
              <p className="text-[#9db9a8] text-sm font-medium mb-3">O ingresa un monto personalizado</p>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2"><span className="material-symbols-outlined text-primary">payments</span><span className="text-white font-bold">$</span></div>
                <input type="number" placeholder="0.00" value={customServiceCharge} onChange={(e) => setCustomServiceCharge(e.target.value)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-12 text-white font-bold text-lg focus:ring-2 focus:ring-primary outline-none" />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9db9a8] text-xs font-bold uppercase tracking-widest">USD</div>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setServiceChargePercent(0); setCustomServiceCharge(''); setIsServiceChargeSheetOpen(false); }} className="flex-1 h-14 bg-white/5 text-white font-bold rounded-2xl">Omitir</button>
              <button onClick={() => setIsServiceChargeSheetOpen(false)} className="flex-[2] h-14 bg-primary text-background-dark font-bold rounded-2xl shadow-lg shadow-primary/20">Aplicar Cargo</button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 w-full p-4 bg-background-dark/90 backdrop-blur-lg border-t border-white/5 flex flex-col gap-3 z-20">
        <button onClick={onSend} className="w-full h-14 bg-primary rounded-xl flex items-center justify-between px-6 shadow-[0_0_20px_rgba(19,236,106,0.15)] active:scale-[0.99] transition-transform">
          <span className="text-background-dark font-bold text-lg">Enviar Orden a Cocina</span>
          <span className="text-background-dark font-extrabold text-lg">${formatPrice(finalTotal)}</span>
        </button>
        <button onClick={onBack} className="w-full py-2 flex items-center justify-center text-text-secondary"><span className="text-sm font-medium">Seguir agregando platillos</span></button>
      </div>
    </div>
  );
};

export default OrderSummaryView;
