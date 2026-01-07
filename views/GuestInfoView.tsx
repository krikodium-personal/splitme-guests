
import React, { useState, useEffect } from 'react';
import { Guest } from '../types';

interface GuestInfoViewProps {
  guests: Guest[];
  setGuests: React.Dispatch<React.SetStateAction<Guest[]>>;
  onBack: () => void;
  onNext: (finalGuests: Guest[]) => void;
  table?: any;
  waiter?: any;
  restaurant?: any;
}

export const getInitials = (name: string) => {
  // Detectar el patrón por defecto "Invitado X" o "Invitado X (Tú)"
  const defaultMatch = name.match(/^Invitado\s(\d+)/);
  if (defaultMatch) {
    return defaultMatch[1]; // Retornar solo el número (ej: "1", "2")
  }

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
  
  // Formatear la fecha de inicio de actividades (trayectoria)
  const formatStartDate = (dateStr: string) => {
    if (!dateStr) return "Reciente";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Reciente";
      
      return date.toLocaleDateString('es-AR', {
        month: 'short',
        year: 'numeric'
      }).replace('.', '');
    } catch (e) {
      return "Reciente";
    }
  };

  const memberSince = formatStartDate(waiter?.start_date);

  const isDefaultName = (name: string, index: number) => {
    return name === "Invitado 1 (Tú)" || name === `Invitado ${index + 1}`;
  };

  const [names, setNames] = useState<string[]>(() => 
    guests.map((g, i) => isDefaultName(g.name, i) ? "" : g.name)
  );

  useEffect(() => {
    setNames(prev => {
      const newNames = [...prev];
      if (guestCount > prev.length) {
        for (let i = prev.length; i < guestCount; i++) {
          newNames.push("");
        }
      } else {
        return newNames.slice(0, guestCount);
      }
      return newNames;
    });
  }, [guestCount]);

  const adjustCount = (delta: number) => {
    const newCount = Math.max(1, Math.min(tableCapacity, guestCount + delta));
    setGuestCount(newCount);
  };

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...names];
    newNames[index] = value;
    setNames(newNames);
  };

  const handleContinue = () => {
    const finalGuests: Guest[] = Array.from({ length: guestCount }).map((_, i) => ({
      id: (i + 1).toString(),
      name: names[i].trim() || (i === 0 ? "Invitado 1 (Tú)" : `Invitado ${i + 1}`),
      isHost: i === 0
    }));
    setGuests(finalGuests);
    onNext(finalGuests);
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-background-light dark:bg-background-dark">
      {/* Header: Logo a la izquierda del nombre */}
      <div className="flex items-center px-4 py-3 justify-between z-10 sticky top-0 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-3 overflow-hidden">
          <button onClick={onBack} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-slate-900 dark:text-white text-2xl">arrow_back</span>
          </button>
          
          <div className="flex items-center gap-2.5 truncate">
            {restaurant?.logo_url && (
              <img src={restaurant.logo_url} alt="Logo" className="h-8 w-8 object-contain rounded-lg bg-white/10 p-1" />
            )}
            <h2 className="text-slate-900 dark:text-white text-sm font-black uppercase tracking-[0.1em] truncate">
              {restaurant?.name || 'DineSplit'}
            </h2>
          </div>
        </div>

        <button className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-slate-900 dark:text-white text-2xl">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32 no-scrollbar">
        {/* Card del Mesero con Mesa Integrada - Diseño de 2 Columnas */}
        <div className="flex flex-col items-center justify-center mb-8 pt-6">
          <div className="w-full bg-white dark:bg-surface-dark rounded-[2.5rem] p-6 shadow-sm ring-1 ring-black/5 dark:ring-white/5 flex flex-col relative overflow-hidden">
            {/* Cintillo Superior */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
            
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/80 mb-6 text-center">
              Mesa {table?.table_number || '--'} atendida por:
            </h3>

            <div className="flex items-center gap-6">
              {/* Columna Izquierda: Foto */}
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-125"></div>
                <img 
                  alt={waiter?.nickname || 'Mesero'} 
                  className="size-28 rounded-full object-cover border-[4px] border-slate-100 dark:border-slate-800 shadow-xl relative z-10" 
                  src={waiter?.profile_photo_url || 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?q=80&w=200&auto=format&fit=crop'}
                />
                <div className="absolute bottom-1 right-1 size-6 bg-primary border-[3px] border-white dark:border-surface-dark rounded-full z-20 flex items-center justify-center">
                   <span className="material-symbols-outlined text-[12px] text-background-dark font-black">check</span>
                </div>
              </div>

              {/* Columna Derecha: Datos */}
              <div className="flex flex-col flex-1 items-start text-left">
                <h4 className="text-2xl font-black text-slate-900 dark:text-white leading-tight mb-1">
                  {waiter?.nickname || waiter?.full_name || 'Equipo DineSplit'}
                </h4>

                <div className="flex items-center gap-1.5 mb-4">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map(i => (
                      <span key={i} className={`material-symbols-outlined text-[18px] ${i <= (waiter?.average_rating || 5) ? 'filled' : ''}`}>star</span>
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{waiter?.average_rating || '5.0'}</span>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5">
                  <span className="material-symbols-outlined text-[14px] text-primary">history</span>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-0.5">En el equipo desde</span>
                    <span className="text-[10px] font-black uppercase text-slate-700 dark:text-white leading-none">
                      {memberSince}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center mb-8">
          <h2 className="text-slate-900 dark:text-white tracking-tight text-2xl font-bold leading-tight text-center">¿Cuántas personas<br/>están comiendo?</h2>
        </div>

        <div className="mb-10 w-full">
          <div className="bg-white dark:bg-surface-dark rounded-[2rem] p-6 shadow-sm ring-1 ring-black/5 dark:ring-white/5">
            <div className="flex items-center justify-between mb-6">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Invitados</span>
              <div className="flex flex-col items-end">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">{guestCount}</span>
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Máx {tableCapacity}</span>
              </div>
            </div>
            <div className="flex justify-between items-center gap-4">
              <button onClick={() => adjustCount(-1)} className="size-12 rounded-full bg-slate-100 dark:bg-black/40 text-slate-900 dark:text-white flex items-center justify-center hover:bg-slate-200 dark:hover:bg-black/60 transition-colors">
                <span className="material-symbols-outlined">remove</span>
              </button>
              <div className="flex-1 h-2 bg-slate-100 dark:bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(guestCount / tableCapacity) * 100}%` }}></div>
              </div>
              <button onClick={() => adjustCount(1)} className={`size-12 rounded-full bg-slate-100 dark:bg-black/40 text-slate-900 dark:text-white flex items-center justify-center hover:bg-slate-200 dark:hover:bg-black/60 transition-colors ${guestCount >= tableCapacity ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">Nombres de los invitados</h3>
          </div>
          <div className="space-y-3">
            {names.map((name, i) => {
              const currentName = name.trim() || (i === 0 ? "Invitado 1 (Tú)" : `Invitado ${i + 1}`);
              const colorId = (i + 1).toString();
              return (
                <div key={i} className="group relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <div className={`size-8 rounded-full ${getGuestColor(colorId)} flex items-center justify-center shadow-sm`}>
                      <span className="text-[10px] font-black text-white">{getInitials(currentName)}</span>
                    </div>
                  </div>
                  <input 
                    className="w-full bg-white dark:bg-surface-dark text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-full py-4 pl-16 pr-4 border-none ring-1 ring-slate-200 dark:ring-white/10 focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm" 
                    placeholder={i === 0 ? "Invitado 1 (Tú)" : `Invitado ${i + 1}`} 
                    type="text"
                    value={name}
                    onChange={(e) => handleNameChange(i, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-background-light via-background-light to-transparent dark:from-background-dark dark:via-background-dark dark:to-transparent pt-12">
        <button onClick={handleContinue} className="w-full bg-primary hover:bg-[#0fd660] active:scale-[0.98] transition-all text-black font-bold text-lg h-14 rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(19,236,106,0.3)]">
          <span>Ir al Menú</span>
          <span className="material-symbols-outlined text-xl font-bold">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};

export default GuestInfoView;
