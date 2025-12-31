
import React from 'react';
import { Guest } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';
import { formatPrice } from './MenuView';

interface ConfirmationViewProps {
  onRestart: () => void;
  guests?: Guest[];
  tableNumber?: number;
}

const ConfirmationView: React.FC<ConfirmationViewProps> = ({ onRestart, guests = [], tableNumber }) => {
  const dinerShares = guests.length > 0 ? guests : [
    { id: '1', name: 'Tú' },
    { id: '2', name: 'Mark' },
    { id: '3', name: 'Sarah' }
  ];

  return (
    <div className="relative flex min-h-screen w-full flex-col max-w-md mx-auto bg-background-light dark:bg-background-dark overflow-hidden pb-32">
      <div className="flex items-center px-4 pt-6 pb-2 justify-between z-10 sticky top-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
        <button onClick={onRestart} className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-white/10 transition-colors"><span className="material-symbols-outlined">arrow_back</span></button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold flex-1 text-center pr-10">Estado de Cuenta</h2>
      </div>

      <div className="flex flex-col items-center justify-center pt-6 pb-4 animate-fade-in-up">
        <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 ring-1 ring-primary/50 shadow-lg shadow-primary/20"><span className="material-symbols-outlined text-primary text-4xl filled" style={{ fontVariationSettings: "'wght' 600" }}>check</span></div>
        <h2 className="text-slate-900 dark:text-white tracking-tight text-[28px] font-bold leading-tight px-4 text-center">¡Cuenta Saldada!</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Orden #4829 • Mesa {tableNumber || '--'}</p>
      </div>

      <div className="flex flex-wrap gap-3 px-4 py-3">
        <div className="flex min-w-[111px] flex-1 basis-[fit-content] flex-col gap-1 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark p-4 items-center text-center shadow-sm">
          <p className="text-slate-900 dark:text-white tracking-tight text-2xl font-bold leading-tight">${formatPrice(105.50)}</p>
          <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-slate-400 dark:text-text-secondary text-sm">receipt_long</span><p className="text-slate-500 dark:text-text-secondary text-sm font-medium">Total Cuenta</p></div>
        </div>
        <div className="flex min-w-[111px] flex-1 basis-[fit-content] flex-col gap-1 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark p-4 items-center text-center shadow-sm">
          <p className="text-slate-900 dark:text-white tracking-tight text-2xl font-bold leading-tight">18%</p>
          <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-slate-400 dark:text-text-secondary text-sm">volunteer_activism</span><p className="text-slate-500 dark:text-text-secondary text-sm font-medium">Propina Promedio</p></div>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="w-full rounded-2xl bg-gradient-to-r from-[#1c3024] to-[#13241b] border border-border-dark p-4 flex items-center justify-between shadow-md relative overflow-hidden group cursor-pointer">
          <div className="flex items-center gap-4 relative z-10"><div className="bg-white p-1.5 rounded-lg shrink-0"><span className="material-symbols-outlined text-black text-2xl">qr_code_2</span></div><div className="flex flex-col"><span className="text-white font-bold text-sm">Recibo Digital QR</span><span className="text-text-secondary text-xs">Escanea para descargar</span></div></div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-4"><h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">Estado de los Invitados</h3></div>

      <div className="flex flex-col gap-3 px-4 pb-4 overflow-y-auto no-scrollbar">
        {dinerShares.map((guest, idx) => {
          const isMe = guest.id === '1';
          const isPaid = idx === dinerShares.length - 1;
          return (
            <div key={guest.id} className={`flex items-center p-3 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark shadow-sm transition-opacity ${isPaid ? 'opacity-60' : ''}`}>
              <div className="relative">
                <div className={`size-12 rounded-full flex items-center justify-center border-2 shadow-inner ${isMe ? 'border-primary' : 'border-transparent'} ${getGuestColor(guest.id)}`}><span className="text-sm font-black text-white">{getInitials(guest.name)}</span></div>
                {isMe && <div className="absolute -bottom-1 -right-1 bg-primary text-[10px] text-black font-bold px-1.5 py-0.5 rounded-full border-2 border-surface-dark uppercase">TÚ</div>}
                {isPaid && <div className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-surface-dark flex items-center justify-center"><span className="material-symbols-outlined text-[10px] font-bold">check</span></div>}
              </div>
              <div className="ml-3 flex-1"><p className="text-slate-900 dark:text-white font-bold">{isMe ? 'Tú' : guest.name.split(' ')[0]}</p><p className={`${isPaid ? 'text-green-600 dark:text-green-400' : isMe ? 'text-primary' : 'text-slate-500 dark:text-slate-400'} text-sm font-medium`}>{isPaid ? `Pagado $${formatPrice(26.39)}` : `Debe $${formatPrice(26.37)}`}</p></div>
              {!isPaid && <span className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-xs px-2 py-1 rounded-full font-medium">{isMe ? 'Pendiente' : 'En proceso'}</span>}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white dark:bg-background-dark border-t border-slate-200 dark:border-border-dark p-4 flex flex-col gap-3 shadow-2xl z-50">
        <button onClick={onRestart} className="w-full bg-primary hover:bg-green-400 text-background-dark font-bold text-lg h-14 rounded-xl flex items-center justify-between px-6 shadow-lg shadow-primary/20 group">
          <span>Pagar mi parte</span>
          <div className="flex items-center gap-2"><span>$${formatPrice(26.37)}</span><span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span></div>
        </button>
        <button onClick={onRestart} className="w-full flex items-center justify-center text-slate-500 dark:text-text-secondary font-medium text-sm py-1">Volver al inicio</button>
      </div>
    </div>
  );
};

export default ConfirmationView;
