
import React from 'react';
import { formatPrice } from './MenuView';

interface IndividualShareViewProps {
  onBack: () => void;
  onPay: () => void;
}

const IndividualShareView: React.FC<IndividualShareViewProps> = ({ onBack, onPay }) => {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-32 bg-background-dark text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background-dark/90 px-4 py-4 backdrop-blur-md">
        <button onClick={onBack} className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold">Tu Parte</h1>
        <button className="text-sm font-semibold text-primary active:opacity-70">Cuenta Completa</button>
      </header>

      <div className="flex flex-col items-center justify-center pt-4 pb-8">
        <div className="text-[#9db9a8] text-sm font-medium mb-1">Total a pagar</div>
        <h2 className="text-4xl font-extrabold tracking-tight">${formatPrice(20.50)}</h2>
        <div className="mt-2 flex items-center gap-1 rounded-full bg-surface-dark px-3 py-1 border border-white/5">
          <span className="material-symbols-outlined text-primary text-[14px] filled">check_circle</span>
          <span className="text-xs text-white/70">Incluye impuestos y servicio</span>
        </div>
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold tracking-tight">Tus Platillos</h3>
          <button className="text-xs text-[#9db9a8] underline decoration-dotted">¿No es tuyo?</button>
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 rounded-xl bg-surface-dark p-3 shadow-sm border border-white/5">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[16px] bg-white/10">
              <img alt="Burger" className="h-full w-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD3yaw_VoS2R_WIs-1rbpjvGD4qATzltp9Txbd8-TrjwZ7XcEx1YfeC-21RG12twTo9MITILhqfikuL0vYFb6VXr4KMdLzIUVhkKzlmmt8R2vaRjmCXPKnENMKmS9fZe2ULJhlQ-xjC6-rYeodKeWPe0crY2XgwtLTUMM2njtWZN7xrhMbxhGJcTKm3Hxgxc2TLwKNxZeikaVFe1puJxdSuFXS6pAcYO8GYwewz2jwSZULxwQ1t83Jx-T9yHtMve2zx96Y6CMAE27cD"/>
            </div>
            <div className="flex flex-1 flex-col justify-center">
              <p className="text-sm font-semibold leading-normal">Cheeseburger Doble</p>
              <p className="text-xs text-slate-400">Extra queso</p>
            </div>
            <div className="shrink-0 font-bold">${formatPrice(12.00)}</div>
          </div>

          <div className="flex items-center gap-4 rounded-xl bg-surface-dark p-3 shadow-sm border border-white/5">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[16px] bg-white/10">
              <img alt="Soda" className="h-full w-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDF18N8TM8r3u4NM1clkSvN57WdXdiO3aduGxzudAVwA40wIBeRUQP9iUPKcVxNf3wvhP3ozea-dogQLJNE5lVlAUyaWf1rQRC6jnV7TD5kxmN6iUwA28NMJnaNp_7qMRHB9l9wtZCiDLi5YmU9dkg76IOjgbJrYeMH8SPDFMdECdE8SviwvGlIobrKnyH2F_6HKF4a94lXGO4RQRS8rb4sVG5xAV3ztwpc4uTDO7h8mkrXL8VYt9-eNPN1K7CK7ryzGX88TuoNLjit"/>
            </div>
            <div className="flex flex-1 flex-col justify-center">
              <p className="text-sm font-semibold leading-normal">Coca-Cola Zero</p>
              <p className="text-xs text-slate-400">Grande</p>
            </div>
            <div className="shrink-0 font-bold">${formatPrice(3.00)}</div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-8">
        <h3 className="text-lg font-bold tracking-tight mb-3">Agregar Propina</h3>
        <div className="grid grid-cols-5 gap-2">
          {['Ninguna', '10%', '15%', '20%', 'Otra'].map((t, i) => (
            <button key={i} className={`relative flex h-12 flex-col items-center justify-center rounded-xl transition-all active:scale-95 ${t === '15%' ? 'bg-primary text-black font-bold shadow-lg' : 'bg-surface-dark border border-white/10 font-semibold'}`}>
              <span className="text-sm">{t}</span>
              {t === '15%' && <div className="absolute -top-2 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-black shadow-sm">Popular</div>}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-[#9db9a8]">El 100% de las propinas va directamente al personal.</p>
      </div>

      <div className="fixed bottom-0 z-50 w-full border-t border-white/5 bg-background-dark/95 backdrop-blur-xl p-4 pb-8 shadow-2xl">
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-sm font-medium text-gray-400">Subtotal ${formatPrice(20.50)} + ${formatPrice(3.08)} Propina</span>
          <span className="text-sm font-bold text-white">${formatPrice(23.58)}</span>
        </div>
        <button 
          onClick={onPay}
          className="group relative flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 transition-all hover:bg-green-400 active:scale-[0.98]"
        >
          <span className="text-lg font-bold text-black tracking-tight group-hover:tracking-normal transition-all">Pagar Ahora</span>
          <span className="material-symbols-outlined text-black group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};

export default IndividualShareView;
