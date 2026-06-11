import React, { useState, useEffect } from 'react';
import { Guest } from '../types';

interface GuestInfoViewProps {
  guests: Guest[];
  setGuests: React.Dispatch<React.SetStateAction<Guest[]>>;
  onBack: () => void;
  onNext: (finalGuests: Guest[], table: any, restaurant: any) => void | Promise<void>;
  table?: any;
  waiter?: any;
  restaurant?: any;
}

export const getInitials = (name: string) => {
  const defaultMatch = name.match(/^(?:Comensal|Invitado)\s(\d+)/);
  if (defaultMatch) return defaultMatch[1];
  const parts = name.trim().split(' ');
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export const getGuestColor = (id: string) => {
  const colors = [
    'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
    'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500',
    'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
    'bg-pink-500', 'bg-slate-600'
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const GuestInfoView: React.FC<GuestInfoViewProps> = ({ guests, setGuests, onBack, onNext, table, waiter, restaurant }) => {
  const tableCapacity = table?.capacity || 10;
  const [guestCount, setGuestCount] = useState(guests.length);

  const formatStartDate = (dateStr: string) => {
    if (!dateStr) return "Reciente";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Reciente";
      return date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }).replace('.', '');
    } catch (e) { return "Reciente"; }
  };

  const memberSince = formatStartDate(waiter?.start_date);

  const isDefaultName = (name: string, index: number) =>
    name === "Comensal 1 (Tú)" || name === `Comensal ${index + 1}` ||
    name === "Invitado 1 (Tú)" || name === `Invitado ${index + 1}`;

  const [names, setNames] = useState<string[]>(() =>
    guests.map((g, i) => isDefaultName(g.name, i) ? "" : g.name)
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNames(prev => {
      const newNames = [...prev];
      if (guestCount > prev.length) {
        for (let i = prev.length; i < guestCount; i++) newNames.push("");
      } else {
        return newNames.slice(0, guestCount);
      }
      return newNames;
    });
  }, [guestCount]);

  const adjustCount = (delta: number) => {
    setError(null);
    setGuestCount(c => Math.max(1, Math.min(tableCapacity, c + delta)));
  };

  const handleNameChange = (index: number, value: string) => {
    setError(null);
    const newNames = [...names];
    newNames[index] = value;
    setNames(newNames);
  };

  const handleContinue = async () => {
    setError(null);
    if (isSubmitting) return;
    setIsSubmitting(true);

    const trimmed = names.slice(0, guestCount).map(n => (n ?? '').trim());
    if (trimmed.some(t => !t)) {
      setError('Cada comensal debe tener un nombre.');
      setIsSubmitting(false);
      return;
    }
    if (guestCount > 1) {
      const lower = trimmed.map(t => t.toLowerCase());
      if (new Set(lower).size !== lower.length) {
        setError('Cada comensal debe tener un nombre distinto.');
        setIsSubmitting(false);
        return;
      }
    }
    if (!table || !restaurant) {
      setError('No se pudo vincular la mesa. Volvé a escanear el código QR.');
      setIsSubmitting(false);
      return;
    }

    const finalGuests: Guest[] = Array.from({ length: guestCount }).map((_, i) => ({
      id: (i + 1).toString(),
      name: (names[i] ?? '').trim() || (i === 0 ? "Comensal 1 (Tú)" : `Comensal ${i + 1}`),
      isHost: i === 0
    }));
    setGuests(finalGuests);
    try {
      await onNext(finalGuests, table, restaurant);
    } catch (err: any) {
      console.error('[GuestInfoView] Error en onNext:', err);
      setError(err?.message || 'No se pudo continuar. Intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full font-display">
      {/* Header */}
      <div className="flex items-center px-4 py-3 justify-between z-10 sticky top-0 bg-background-dark-top/90 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3 overflow-hidden">
          <button
            onClick={onBack}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/8 text-white transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <div className="flex items-center gap-2.5 truncate">
            {restaurant?.logo_url && (
              <img src={restaurant.logo_url} alt="Logo" className="h-8 w-8 object-contain rounded-xl bg-white/10 p-1" />
            )}
            <h2 className="text-white text-sm font-semibold truncate">
              {restaurant?.name || 'SplitMe'}
            </h2>
          </div>
        </div>
        <button className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/8 text-white/50 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-36 no-scrollbar">

        {/* Card del mesero */}
        <div className="mt-6 mb-6">
          <div className="w-full bg-surface-dark rounded-[2rem] p-5 border border-border-dark shadow-xl shadow-black/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-widest mb-5 text-center">
              Mesa {table?.table_number || '--'} · Tu mesero
            </p>

            <div className="flex items-center gap-5">
              {/* Foto */}
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-primary/15 rounded-full blur-2xl scale-150" />
                <img
                  alt={waiter?.nickname || 'Mesero'}
                  className="size-24 rounded-[1.5rem] object-cover border border-border-dark shadow-lg relative z-10"
                  src={waiter?.profile_photo_url || 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?q=80&w=200&auto=format&fit=crop'}
                />
                <div className="absolute -bottom-1 -right-1 size-6 bg-primary border-[2px] border-surface-dark rounded-full z-20 flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined filled text-[12px] text-background-dark">check</span>
                </div>
              </div>

              {/* Datos */}
              <div className="flex flex-col flex-1 gap-2">
                <h4 className="text-xl font-bold text-white leading-tight">
                  {waiter?.nickname || waiter?.full_name || 'Nuestro equipo'}
                </h4>

                <div className="flex items-center gap-1.5">
                  <div className="flex text-primary">
                    {[1, 2, 3, 4, 5].map(i => (
                      <span key={i} className={`material-symbols-outlined text-[16px] ${i <= Math.round(waiter?.average_rating || 5) ? 'filled' : ''}`}>star</span>
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-text-secondary">{waiter?.average_rating || '5.0'}</span>
                </div>

                <div className="flex items-center gap-1.5 self-start bg-white/5 border border-white/8 rounded-full px-3 py-1.5">
                  <span className="material-symbols-outlined text-[13px] text-primary">history</span>
                  <span className="text-[10px] text-text-secondary font-medium">Desde {memberSince}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Título */}
        <div className="mb-6">
          <h2 className="text-white text-2xl font-bold leading-tight text-center">¿Cuántas personas<br/>están comiendo?</h2>
        </div>

        {/* Contador de comensales */}
        <div className="mb-8">
          <div className="bg-surface-dark rounded-[2rem] p-6 border border-border-dark shadow-lg shadow-black/30">
            <div className="flex items-center justify-between mb-5">
              <span className="text-text-secondary font-medium">Comensales</span>
              <div className="flex flex-col items-end">
                <span className="text-3xl font-bold text-white">{guestCount}</span>
                <span className="text-[10px] text-text-secondary font-medium">Máx {tableCapacity}</span>
              </div>
            </div>
            <div className="flex justify-between items-center gap-4">
              <button
                onClick={() => adjustCount(-1)}
                className="size-12 rounded-full bg-surface-dark-alt border border-border-dark text-white flex items-center justify-center active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined">remove</span>
              </button>
              <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all shadow-sm shadow-primary/50"
                  style={{ width: `${(guestCount / tableCapacity) * 100}%` }}
                />
              </div>
              <button
                onClick={() => adjustCount(1)}
                disabled={guestCount >= tableCapacity}
                className="size-12 rounded-full bg-surface-dark-alt border border-border-dark text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-25"
              >
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>
        </div>

        {/* Inputs de nombres */}
        <div className="flex flex-col gap-4 animate-fade-in">
          <h3 className="text-white text-[15px] font-semibold px-1">
            Nombres<span className="text-primary">*</span>
          </h3>
          <div className="space-y-3">
            {names.map((name, i) => {
              const currentName = name.trim() || (i === 0 ? "Comensal 1 (Tú)" : `Comensal ${i + 1}`);
              return (
                <div key={i} className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3 pointer-events-none">
                    <div className={`size-8 rounded-full ${getGuestColor((i + 1).toString())} flex items-center justify-center shadow-sm`}>
                      <span className="text-[10px] font-bold text-white">{getInitials(currentName)}</span>
                    </div>
                  </div>
                  <input
                    className="w-full bg-surface-dark text-white placeholder:text-white/25 rounded-2xl py-4 pl-[3.75rem] pr-4 border border-border-dark focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm font-medium"
                    placeholder={i === 0 ? "Tu nombre" : `Comensal ${i + 1}`}
                    type="text"
                    value={name}
                    onChange={e => handleNameChange(i, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTA fijo abajo */}
      <div className="absolute bottom-0 left-0 w-full px-5 pb-8 pt-12 bg-gradient-to-t from-background-dark via-background-dark/95 to-transparent">
        {error && (
          <p className="text-red-400 text-sm font-medium mb-3 text-center" role="alert">{error}</p>
        )}
        {guestCount > 1 && !error && (
          <p className="text-text-secondary text-xs mb-3 text-center">Cada comensal debe tener un nombre distinto.</p>
        )}
        <button
          onClick={handleContinue}
          disabled={isSubmitting}
          className="w-full bg-primary text-black h-[54px] rounded-[14px] font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Creando orden...</span>
            </>
          ) : (
            <>
              <span>Ir al Menú</span>
              <span className="material-symbols-outlined text-xl">arrow_forward</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default GuestInfoView;
