import React from 'react';

interface ThanksViewProps {
  restaurant?: any;
  onBackToMenu: () => void;
}

/** Acepta una URL completa o un usuario (con o sin @) y devuelve el link de la red. */
const socialLink = (value: string | null | undefined, base: string): string | null => {
  const v = (value || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^@/, '').replace(/^\/+/, '')}`;
};

const ThanksView: React.FC<ThanksViewProps> = ({ restaurant, onBackToMenu }) => {
  const instagram = socialLink(restaurant?.instagram_url, 'https://www.instagram.com/');
  const tiktok = socialLink(restaurant?.tiktok_url, 'https://www.tiktok.com/@');
  const facebook = socialLink(restaurant?.facebook_url, 'https://www.facebook.com/');
  const youtube = socialLink(restaurant?.youtube_url, 'https://www.youtube.com/@');
  const name = restaurant?.name || 'el restaurante';

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-background-dark text-white items-center justify-center p-8 text-center">
      {restaurant?.logo_url ? (
        <img src={restaurant.logo_url} alt={name} className="size-24 rounded-full object-cover border-4 border-primary/30 mb-8 shadow-lg shadow-primary/20" />
      ) : (
        <div className="size-24 bg-primary rounded-full flex items-center justify-center mb-8 shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-black text-6xl font-black">favorite</span>
        </div>
      )}
      <h1 className="text-3xl font-black tracking-tight mb-3">¡Gracias por tu visita!</h1>
      <p className="text-text-secondary text-base max-w-xs mb-10">
        Fue un gusto atenderte en {name}. Esperamos verte pronto.
      </p>

      <button
        onClick={onBackToMenu}
        className="w-full max-w-xs h-16 rounded-2xl font-black text-lg bg-primary text-black shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined font-black">restaurant_menu</span>
        <span>Volver al menú</span>
      </button>

      {(instagram || tiktok || facebook || youtube) && (
        <div className="mt-10 w-full max-w-xs">
          <p className="text-text-secondary text-xs font-black uppercase tracking-[0.2em] mb-4">Seguinos en redes</p>
          <div className="flex flex-col gap-3">
            {instagram && (
              <a href={instagram} target="_blank" rel="noopener noreferrer" className="h-14 rounded-2xl bg-surface-dark border border-white/10 flex items-center justify-center gap-3 font-bold hover:border-primary/40 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
                <span>Instagram</span>
              </a>
            )}
            {facebook && (
              <a href={facebook} target="_blank" rel="noopener noreferrer" className="h-14 rounded-2xl bg-surface-dark border border-white/10 flex items-center justify-center gap-3 font-bold hover:border-primary/40 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21h3z" /></svg>
                <span>Facebook</span>
              </a>
            )}
            {youtube && (
              <a href={youtube} target="_blank" rel="noopener noreferrer" className="h-14 rounded-2xl bg-surface-dark border border-white/10 flex items-center justify-center gap-3 font-bold hover:border-primary/40 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" /></svg>
                <span>YouTube</span>
              </a>
            )}
            {tiktok && (
              <a href={tiktok} target="_blank" rel="noopener noreferrer" className="h-14 rounded-2xl bg-surface-dark border border-white/10 flex items-center justify-center gap-3 font-bold hover:border-primary/40 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 3a5.5 5.5 0 0 0 4.4 4.4v3.2a8.6 8.6 0 0 1-4.4-1.3v6.2a6 6 0 1 1-6-6c.3 0 .6 0 .9.1v3.3a2.8 2.8 0 1 0 1.9 2.6V3h3.2z" /></svg>
                <span>TikTok</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThanksView;
