
import React, { useState } from 'react';
import { OrderItem } from '../types';
import { formatPrice } from './MenuView';

interface OrderProgressViewProps {
  cart: OrderItem[];
  onNext: () => void;
  onBack: () => void;
  tableNumber?: number;
  waiter?: any;
}

const OrderProgressView: React.FC<OrderProgressViewProps> = ({ onNext, onBack, tableNumber, waiter }) => {
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  const [message, setMessage] = useState('');

  return (
    <div className="flex flex-col flex-1 h-screen bg-background-dark text-white overflow-hidden relative">
      <div className="sticky top-0 z-10 flex items-center bg-background-dark/95 backdrop-blur-md p-4 justify-between border-b border-white/10">
        <h2 className="text-lg font-bold leading-tight flex-1">Mesa {tableNumber || '--'}</h2>
        <div className="flex items-center justify-end bg-surface-dark/50 px-3 py-1 rounded-full border border-white/5">
          <span className="text-[#9db9a8] text-xs font-bold uppercase tracking-wider mr-2">Orden</span>
          <p className="text-primary text-base font-bold tracking-wider">#8821</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-40 no-scrollbar">
        <div className="px-4 py-10 flex flex-col items-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl"></div>
            <div className="relative bg-surface-dark w-24 h-24 rounded-full flex items-center justify-center border-2 border-primary animate-pulse-ring">
              <span className="material-symbols-outlined text-primary text-5xl">skillet</span>
            </div>
          </div>
          <h2 className="tracking-tight text-[28px] font-black leading-tight text-center mb-2 px-4 italic">¡Los chefs están preparando tu comida!</h2>
        </div>

        <div className="px-4 pb-6">
          <div className="bg-surface-dark rounded-xl p-5 shadow-sm border border-white/5">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-6 opacity-80">Estado de la Orden</h3>
            <div className="grid grid-cols-[40px_1fr] gap-x-3">
              {[
                { label: 'Orden Enviada', desc: 'La cocina ha recibido tu pedido.', time: '12:30 PM', done: true, current: false },
                { label: 'En Preparación', desc: 'Estamos trabajando duro en tus platillos.', status: 'ACTUAL', done: false, current: true },
                { label: 'Listo para ser servido', desc: 'Tus platillos están listos y en camino a tu mesa.', done: false, current: false },
                { label: 'Servido', desc: '¡Disfruta tu comida!', done: false, current: false },
              ].map((step, idx, arr) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-background-dark shadow-lg ${step.done ? 'bg-primary' : step.current ? 'border-2 border-primary animate-pulse' : 'bg-white/10'}`}>
                      <span className="material-symbols-outlined text-sm font-bold">{step.done ? 'check' : step.current ? 'local_fire_department' : 'circle'}</span>
                    </div>
                    {idx < arr.length - 1 && <div className={`w-[2px] h-full min-h-[40px] grow rounded-full my-1 ${step.done ? 'bg-primary' : 'bg-white/10'}`}></div>}
                  </div>
                  <div className={`flex flex-1 flex-col pb-8 pt-1 ${!step.done && !step.current ? 'opacity-40' : ''}`}>
                    <div className="flex justify-between items-center">
                      <p className={`text-base font-bold ${step.current ? 'text-primary' : 'text-white'}`}>{step.label}</p>
                      {step.time && <span className="text-xs font-medium text-gray-500">{step.time}</span>}
                      {step.status && <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">{step.status}</span>}
                    </div>
                    <p className="text-[#9db9a8] text-sm leading-normal mt-1">{step.desc}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full px-4 pt-12 pb-6 bg-gradient-to-t from-background-dark via-background-dark to-transparent z-20">
        <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
          <div className="flex gap-3 w-full">
            <button onClick={onBack} className="flex-1 bg-surface-dark border border-white/10 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2 hover:bg-white/5 active:scale-95 text-sm transition-all"><span className="material-symbols-outlined text-lg">restaurant_menu</span> Menú</button>
            <button onClick={() => setIsWaiterModalOpen(true)} className="flex-1 bg-surface-dark border border-primary text-primary font-bold h-12 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/10 active:scale-95 text-sm transition-all shadow-[0_0_15px_rgba(19,236,106,0.1)]"><span className="material-symbols-outlined filled text-lg">notifications_active</span> Llamar Mesero</button>
          </div>
          <button onClick={onNext} className="w-full bg-primary text-background-dark font-bold text-lg h-14 rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(19,236,106,0.3)] hover:shadow-[0_0_30px_rgba(19,236,106,0.5)] active:scale-95 transition-all"><span className="material-symbols-outlined">payments</span> Dividir y Pagar</button>
        </div>
      </div>

      {isWaiterModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsWaiterModalOpen(false)}></div>
          <div className="bg-[#102217] w-full max-w-md mx-auto rounded-t-[40px] overflow-hidden flex flex-col relative z-10 animate-fade-in-up border-t border-white/10 shadow-[0_-15px_50px_rgba(0,0,0,0.6)]">
            <div className="flex justify-center pt-4 pb-2 shrink-0"><div className="w-16 h-1.5 bg-white/20 rounded-full"></div></div>
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 shrink-0"><h2 className="text-xl font-black text-white uppercase tracking-widest">Servicio de Mesa</h2><button onClick={() => setIsWaiterModalOpen(false)} className="size-10 rounded-full bg-white/5 flex items-center justify-center text-text-secondary hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button></div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-10">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse"></div>
                  <div className="relative size-40 rounded-full border-4 border-primary/40 p-1.5 bg-background-dark">
                    <img src={waiter?.profile_photo_url || 'https://lh3.googleusercontent.com/aida-public/AB6AXuBOj4G4K7JiO9Fr2dqoMH7u51lTeBsQVu9MQcJg2SNGx30jGixPsLGz94TMLN2rTXMDD5EqYz2PzA-0KW9GqmIcoHb_MB09HaY-pnCe-Knms41UjBduUhsAY6qafUDF1tBkOPqibFufhjiZb_eLWsop4zpwRRwjoDXV3D8ziD3h4qh9cDMzMTOOLYNHhPgXlwAJ9Huy-yOp_tTJavU1tQCvKy9cGmq3wbna0f6oVMXsj-bC9rNln-73bheDxHJmscx3V7f_riJ6irJn'} alt={waiter?.nickname || 'Mesero'} className="size-full rounded-full object-cover shadow-2xl" />
                  </div>
                  <div className="absolute bottom-2 right-2 size-10 bg-primary rounded-full flex items-center justify-center border-4 border-[#102217] shadow-lg"><span className="material-symbols-outlined text-[22px] text-background-dark font-black filled">verified</span></div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-black text-white tracking-tight">{waiter?.full_name || 'Sarah Jenkins'}</h3>
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex text-primary">
                      {[1, 2, 3, 4, 5].map(i => (
                        <span key={i} className={`material-symbols-outlined text-[20px] ${(waiter?.average_rating || 4.9) >= i ? 'filled' : 'opacity-40'}`}>star</span>
                      ))}
                    </div>
                    <span className="text-sm font-black text-white/50 tracking-wide uppercase">{waiter?.average_rating || '4.9'} Calificación</span>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 rounded-full border border-primary/20"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span></span><span className="text-[11px] font-black text-primary uppercase tracking-[0.2em]">Disponible Ahora</span></div>
              </div>
              <div className="space-y-4">
                <button className="w-full h-20 bg-primary hover:bg-[#0fd65f] text-background-dark font-black text-xl rounded-[24px] flex items-center justify-center gap-4 shadow-2xl shadow-primary/30 transition-all active:scale-[0.97] group"><span className="material-symbols-outlined text-3xl font-black">hail</span><span>Llamar a la mesa</span></button>
                <div className="relative group"><div className="absolute left-5 top-1/2 -translate-y-1/2 text-primary group-focus-within:scale-110 transition-transform"><span className="material-symbols-outlined filled">chat</span></div><input type="text" placeholder="Envía un mensaje rápido..." value={message} onChange={(e) => setMessage(e.target.value)} className="w-full h-16 bg-white/5 border border-white/10 rounded-[20px] pl-14 pr-16 text-white font-bold text-lg focus:ring-2 focus:ring-primary focus:bg-white/10 outline-none transition-all placeholder-white/20" /><button disabled={!message.trim()} className={`absolute right-3 top-1/2 -translate-y-1/2 size-12 rounded-2xl flex items-center justify-center transition-all ${message.trim() ? 'bg-primary text-background-dark scale-100' : 'bg-white/5 text-white/20 scale-90'}`}><span className="material-symbols-outlined font-black">send</span></button></div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">{['Agua 💧', 'Servilletas 🧻', 'La cuenta 🧾', 'Ketchup 🍅'].map((opt) => (<button key={opt} onClick={() => setMessage(opt.split(' ')[0])} className="h-11 bg-white/5 border border-white/5 rounded-full text-[13px] font-black text-white/60 hover:bg-white/10 hover:text-primary transition-all px-6">{opt}</button>))}</div>
            </div>
            <div className="p-8 pt-0"><div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between"><div className="flex flex-col"><span className="text-[10px] font-black text-text-secondary uppercase tracking-widest opacity-60">Espera estimada</span><span className="text-sm font-black text-white">~ 2 Minutos</span></div><div className="flex flex-col items-end"><span className="text-[10px] font-black text-text-secondary uppercase tracking-widest opacity-60">Estado</span><span className="text-sm font-black text-primary">En Servicio</span></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderProgressView;
