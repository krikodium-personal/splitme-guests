import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Guest } from '../types';
import { getInitials, getGuestColor } from './GuestInfoView';

interface JoinTableViewProps {
  guests: Guest[];
  activeOrderId: string | null;
  table?: any;
  restaurant?: any;
  onSelectGuest: (guestId: string) => void;
  onAddGuest: (name: string) => Promise<string | null>;
}

const JoinTableView: React.FC<JoinTableViewProps> = ({
  guests,
  activeOrderId,
  table,
  restaurant,
  onSelectGuest,
  onAddGuest,
}) => {
  const navigate = useNavigate();
  const [newGuestName, setNewGuestName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const tableCapacity = table?.capacity || 10;
  const canAddGuest = guests.length < tableCapacity;

  const handleSelectGuest = (guestId: string) => {
    onSelectGuest(guestId);
    navigate(`/menu?orderId=${activeOrderId}&guestId=${guestId}`);
  };

  const handleAddSelf = async () => {
    if (!newGuestName.trim()) return;
    if (guests.length >= tableCapacity) {
      alert(`La mesa tiene una capacidad máxima de ${tableCapacity} personas.`);
      return;
    }
    setIsAdding(true);
    try {
      const newGuestId = await onAddGuest(newGuestName.trim());
      if (newGuestId) {
        onSelectGuest(newGuestId);
        navigate(`/menu?orderId=${activeOrderId}&guestId=${newGuestId}`);
      } else {
        alert('No se pudo agregar. Intentá de nuevo.');
      }
    } catch (e) {
      console.error('Error adding guest:', e);
      alert('Error al agregarte a la mesa. Intentá de nuevo.');
    } finally {
      setIsAdding(false);
      setNewGuestName('');
      setShowAddForm(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark text-white font-display antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-center bg-background-dark/90 px-4 py-4 backdrop-blur-md border-b border-white/5">
        <h1 className="text-lg font-bold leading-tight">¿Quién sos?</h1>
      </header>

      <div className="flex flex-col items-center justify-center pt-6 pb-4 px-4">
        <div className="text-text-secondary text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-60 text-center">
          {restaurant?.name || 'Restaurante'}
        </div>
        <p className="text-sm text-text-secondary text-center max-w-sm">
          Seleccioná tu nombre o agregate a la mesa para empezar a pedir
        </p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3 pb-6">
        {guests.map((guest) => (
          <button
            key={guest.id}
            onClick={() => handleSelectGuest(guest.id)}
            className="w-full flex items-center p-4 rounded-2xl bg-surface-dark border border-white/5 shadow-sm transition-all hover:border-primary/40 hover:bg-surface-dark/80 active:scale-[0.98]"
          >
            <div className={`size-12 rounded-full flex items-center justify-center font-black text-base border-2 border-white/10 ${getGuestColor(guest.id)}`}>
              <span className="text-white">{getInitials(guest.name)}</span>
            </div>
            <div className="ml-4 flex-1 min-w-0 text-left">
              <p className="text-white font-bold text-base truncate">{guest.name}</p>
              <p className="text-xs text-text-secondary mt-0.5">Tocá para pedir tus platos</p>
            </div>
            <span className="material-symbols-outlined text-primary text-xl">arrow_forward</span>
          </button>
        ))}

        {showAddForm ? (
          <div className="p-4 rounded-2xl bg-surface-dark border border-primary/30 space-y-3">
            <input
              type="text"
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              placeholder="Tu nombre..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold placeholder:text-white/40 outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddSelf()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAddForm(false); setNewGuestName(''); }}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold border border-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddSelf}
                disabled={!newGuestName.trim() || isAdding || guests.length >= tableCapacity}
                className="flex-1 py-3 rounded-xl bg-primary text-black font-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAdding ? (
                  <>
                    <div className="size-4 border-2 border-background-dark border-t-transparent rounded-full animate-spin" />
                    <span>Agregando...</span>
                  </>
                ) : (
                  'Agregar'
                )}
              </button>
            </div>
          </div>
        ) : canAddGuest ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center p-4 rounded-2xl bg-white/5 border border-dashed border-white/20 transition-all hover:border-primary/40 hover:bg-white/10 active:scale-[0.98]"
          >
            <div className="size-12 rounded-full flex items-center justify-center bg-primary/20 border-2 border-primary/40">
              <span className="material-symbols-outlined text-primary text-2xl">person_add</span>
            </div>
            <div className="ml-4 flex-1 text-left">
              <p className="text-white font-bold text-base">Agregarme a la mesa</p>
              <p className="text-xs text-text-secondary mt-0.5">No estoy en la lista</p>
            </div>
            <span className="material-symbols-outlined text-primary text-xl">add</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default JoinTableView;
