import React from 'react';

const DEFAULT_WAITER_PHOTO = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyiwOtsINFh8RspVDg_Wx4QKXthNxCS7ZJlDSZvL6ADwFD3WRUpKHGhrscxV9dcR7w7guM4E-iFCNXx-tDgHs1BrbfGjolJoASehM-SEc4Pe6bKEx7zjcF4WAcON7mbdWJCepEdMPkBZ36lB_4tPTsJeNzTNqRNGKgusVb3U_X0WGEAgij6Y48HIunhj_BC8lxMdsB5ublmAltnyYerUKa_NkT8aybLFkaaRkQGQ_irdtS2ZQwrNGNj6b1ZrWY1HRClBeExJL615bG';

export const WAITER_TAB_INTRO_MS = 5800;

interface WaiterTabButtonProps {
  waiter: { profile_photo_url?: string | null; nickname?: string | null; full_name?: string | null } | null;
  onClick: () => void;
}

const WaiterTabButton: React.FC<WaiterTabButtonProps> = ({ waiter, onClick }) => {
  const name = waiter?.nickname?.trim() || waiter?.full_name?.trim().split(/\s+/)[0] || '';

  return (
    // La pestaña sobresale 2rem del borde de la columna para que, al entrar de más, siga tocando el borde
    <div className="fixed inset-x-0 bottom-[5.5rem] z-[70] mx-auto w-full max-w-md h-24 overflow-hidden pointer-events-none">
      <button
        onClick={onClick}
        className="group pointer-events-auto absolute top-4 -right-8 h-14 pr-12 flex items-center rounded-l-full bg-primary shadow-xl shadow-black/40 motion-safe:animate-waiter-tab-in"
        title="Solicitar al mesero"
      >
        <span className="size-14 shrink-0 rounded-full overflow-hidden border-[3px] border-primary bg-surface-dark transition-transform group-active:scale-95">
          <img
            src={waiter?.profile_photo_url || DEFAULT_WAITER_PHOTO}
            alt={waiter?.nickname || waiter?.full_name || 'Mesero'}
            className="w-full h-full object-cover"
          />
        </span>
        <span className="block overflow-hidden max-w-0 opacity-0 motion-safe:animate-waiter-tab-text">
          <span className="block w-[11.5rem] pl-3 pr-2 text-left text-black leading-tight">
            <span className="block text-[13px] font-black truncate">{name ? `Hola, soy ${name}` : 'Hola, soy tu mesero'}</span>
            <span className="block text-[12px] font-semibold text-black/75">pedime lo que necesites</span>
          </span>
        </span>
      </button>
    </div>
  );
};

export default WaiterTabButton;
