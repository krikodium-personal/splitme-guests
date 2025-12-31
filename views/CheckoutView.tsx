
import React, { useMemo } from 'react';
import { OrderItem, Guest, MenuItem } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';

interface CheckoutViewProps {
  onBack: () => void;
  onConfirm: () => void;
  cart: OrderItem[];
  guests?: Guest[];
  menuItems: MenuItem[];
  tableNumber?: number;
}

const CheckoutView: React.FC<CheckoutViewProps> = ({ onBack, onConfirm, cart, guests = [], menuItems, tableNumber }) => {
  const subtotal = useMemo(() => cart.reduce((sum, item) => {
    const menuItem = menuItems.find(m => m.id === item.itemId);
    return sum + (menuItem ? menuItem.price * item.quantity : 0);
  }, 0), [cart, menuItems]);

  const tax = subtotal * 0.08;
  const serviceFee = subtotal * 0.0727;
  const grandTotal = subtotal + tax + serviceFee;

  const dinerShares = useMemo(() => {
    if (guests.length === 0) return [];
    const perGuest = grandTotal / guests.length;
    return guests.map((guest, idx) => ({
      ...guest,
      amount: perGuest,
      status: idx === guests.length - 1 ? 'PAGADO' : (idx === 0 ? 'PENDIENTE' : 'IMPAGADO')
    }));
  }, [guests, grandTotal]);

  const myShare = dinerShares.find(d => d.id === '1')?.amount || (grandTotal / (guests.length || 1));

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-background-dark overflow-hidden pb-32 font-display text-white antialiased">
      <div className="flex items-center px-4 pt-6 pb-2 justify-between z-10 sticky top-0 bg-background-dark/80 backdrop-blur-md">
        <button onClick={onBack} className="text-white flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-white text-lg font-bold leading-tight flex-1 text-center pr-10">Confirmación</h2>
      </div>

      <div className="flex flex-col items-center justify-center pt-6 pb-4 animate-fade-in-up">
        <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 ring-1 ring-primary/50 shadow-lg shadow-primary/20"><span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'wght' 600" }}>check</span></div>
        <h2 className="text-white tracking-tight text-[28px] font-bold leading-tight px-4 text-center">¡Cuenta dividida con éxito!</h2>
        <p className="text-[#9db9a8] text-sm mt-1">Orden #4829 • Mesa {tableNumber || '--'}</p>
      </div>

      <div className="flex flex-wrap gap-3 px-4 py-3">
        <div className="flex min-w-[111px] flex-1 basis-[fit-content] flex-col gap-1 rounded-2xl bg-surface-dark border border-[#3b5445] p-4 items-center text-center shadow-sm">
          <p className="text-white tracking-tight text-2xl font-bold leading-tight">${formatPrice(grandTotal)}</p>
          <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[#9db9a8] text-sm">receipt_long</span><p className="text-[#9db9a8] text-sm font-medium">Total Cuenta</p></div>
        </div>
        <div className="flex min-w-[111px] flex-1 basis-[fit-content] flex-col gap-1 rounded-2xl bg-surface-dark border border-[#3b5445] p-4 items-center text-center shadow-sm">
          <p className="text-white tracking-tight text-2xl font-bold leading-tight">18%</p>
          <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[#9db9a8] text-sm">volunteer_activism</span><p className="text-[#9db9a8] text-sm font-medium">Propina Incl.</p></div>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="w-full rounded-2xl bg-gradient-to-r from-[#1c3024] to-[#13241b] border border-[#3b5445] p-4 flex items-center justify-between shadow-md relative overflow-hidden group cursor-pointer">
          <div className="flex items-center gap-4 relative z-10"><div className="bg-white p-1.5 rounded-lg shrink-0"><span className="material-symbols-outlined text-black text-2xl">qr_code_2</span></div><div className="flex flex-col"><span className="text-white font-bold text-sm">Ver QR de la Mesa</span><span className="text-[#9db9a8] text-xs">Deja que tus amigos escaneen</span></div></div>
          <button className="relative z-10 size-8 flex items-center justify-center rounded-full bg-surface-dark/50 border border-[#3b5445] text-primary"><span className="material-symbols-outlined text-lg">expand_more</span></button>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-4"><h3 className="text-white text-lg font-bold leading-tight">Estado de Pagos</h3><button className="text-primary text-sm font-bold flex items-center gap-1">Compartir Todo <span className="material-symbols-outlined text-sm">share</span></button></div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3">
        {dinerShares.map((diner) => {
          const isMe = diner.id === '1';
          const isPaid = diner.status === 'PAGADO';
          const isPending = diner.status === 'PENDIENTE';
          return (
            <div key={diner.id} className={`flex items-center p-3 rounded-2xl bg-surface-dark border border-[#3b5445]/50 shadow-sm transition-opacity ${isPaid ? 'opacity-60' : ''}`}>
              <div className="relative">
                <div className={`size-12 rounded-full flex items-center justify-center border-2 shadow-inner ${isMe ? 'border-primary' : 'border-transparent'} ${getGuestColor(diner.id)}`}><span className="text-sm font-black text-white">{getInitials(diner.name)}</span></div>
                {isMe && <div className="absolute -bottom-1 -right-1 bg-primary text-[10px] text-black font-bold px-1.5 py-0.5 rounded-full border-2 border-surface-dark uppercase">Tú</div>}
                {isPaid && <div className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-surface-dark flex items-center justify-center"><span className="material-symbols-outlined text-[10px] font-bold">check</span></div>}
              </div>
              <div className="ml-3 flex-1"><p className="text-white font-bold">{isMe ? 'Tú' : diner.name}</p><p className={`text-sm font-medium ${isPaid ? 'text-green-400' : (isPending || isMe ? 'text-primary' : 'text-[#9db9a8]')}`}>{isPaid ? `Pagado $${formatPrice(diner.amount)}` : `Debe $${formatPrice(diner.amount)}`}</p></div>
              {!isPaid && <button className="size-9 rounded-full bg-primary/10 flex items-center justify-center text-primary"><span className="material-symbols-outlined text-lg">ios_share</span></button>}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-background-dark border-t border-[#2a3c32] p-4 flex flex-col gap-3 shadow-2xl z-50">
        <button onClick={onConfirm} className="w-full bg-primary hover:bg-green-400 text-background-dark font-bold text-lg h-14 rounded-xl flex items-center justify-between px-6 transition-colors shadow-lg shadow-primary/20 group">
          <span>Pagar mi parte</span>
          <div className="flex items-center gap-2"><span>$${formatPrice(myShare)}</span><span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span></div>
        </button>
        <button onClick={onConfirm} className="w-full flex items-center justify-center text-[#9db9a8] font-medium text-sm py-1">O pagar la cuenta completa (${formatPrice(grandTotal)})</button>
      </div>
    </div>
  );
};

export default CheckoutView;
