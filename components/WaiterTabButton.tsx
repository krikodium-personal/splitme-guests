import React, { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_WAITER_PHOTO = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyiwOtsINFh8RspVDg_Wx4QKXthNxCS7ZJlDSZvL6ADwFD3WRUpKHGhrscxV9dcR7w7guM4E-iFCNXx-tDgHs1BrbfGjolJoASehM-SEc4Pe6bKEx7zjcF4WAcON7mbdWJCepEdMPkBZ36lB_4tPTsJeNzTNqRNGKgusVb3U_X0WGEAgij6Y48HIunhj_BC8lxMdsB5ublmAltnyYerUKa_NkT8aybLFkaaRkQGQ_irdtS2ZQwrNGNj6b1ZrWY1HRClBeExJL615bG';

export const WAITER_TAB_INTRO_MS = 5800;

const TAB_HEIGHT = 56; // h-14
const EDGE_MARGIN = 8;
const POSITION_KEY = 'splitme_waiter_tab_y';
/** Posición original: justo arriba del footer (bottom-[5.5rem], alto 6rem, top-4). */
const defaultY = () => (typeof window === 'undefined' ? 400 : window.innerHeight - 168);
const clampY = (y: number) => Math.min(Math.max(y, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerHeight - TAB_HEIGHT - EDGE_MARGIN));

interface WaiterTabButtonProps {
  waiter: { profile_photo_url?: string | null; nickname?: string | null; full_name?: string | null } | null;
  onClick: () => void;
}

const WaiterTabButton: React.FC<WaiterTabButtonProps> = ({ waiter, onClick }) => {
  const name = waiter?.nickname?.trim() || waiter?.full_name?.trim().split(/\s+/)[0] || '';

  // La pestaña se puede arrastrar para arriba y para abajo para que no tape contenido; se recuerda dónde se dejó.
  const [y, setY] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(POSITION_KEY));
      if (Number.isFinite(saved) && saved > 0) return clampY(saved);
    } catch (e) { /* sin localStorage */ }
    return clampY(defaultY());
  });
  const drag = useRef<{ startPointerY: number; startY: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  useEffect(() => {
    const onResize = () => setY(prev => clampY(prev));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { startPointerY: e.clientY, startY: y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientY - d.startPointerY;
    if (!d.moved && Math.abs(delta) < 6) return;
    d.moved = true;
    setY(clampY(d.startY + delta));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
    if (d?.moved) {
      // El click del navegador llega justo después del pointerup: se ignora ese solo
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      try { localStorage.setItem(POSITION_KEY, String(Math.round(y))); } catch (err) { /* sin localStorage */ }
    }
  }, [y]);

  const handleClick = useCallback(() => {
    // Un arrastre no debe abrir el modal; solo un toque
    if (justDragged.current) return;
    onClick();
  }, [onClick]);

  return (
    // La pestaña sobresale 2rem del borde de la columna para que, al entrar de más, siga tocando el borde
    <div className="fixed inset-y-0 inset-x-0 z-[70] mx-auto w-full max-w-md overflow-hidden pointer-events-none">
      <button
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ top: y, touchAction: 'none' }}
        className="group pointer-events-auto absolute -right-8 h-14 cursor-grab active:cursor-grabbing select-none pr-12 flex items-center rounded-l-full bg-primary shadow-xl shadow-black/40 motion-safe:animate-waiter-tab-in"
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
