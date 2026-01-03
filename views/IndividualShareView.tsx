
import React, { useState, useMemo } from 'react';
import { Guest, OrderItem, MenuItem } from '../types';
import { formatPrice } from './MenuView';

interface IndividualShareViewProps {
  onBack: () => void;
  onPay: () => void;
  cart: OrderItem[];
  menuItems: MenuItem[];
  splitData: any[] | null;
}

const IndividualShareView: React.FC<IndividualShareViewProps> = ({ onBack, onPay, cart, menuItems, splitData }) => {
  const [tipPercentage, setTipPercentage] = useState<number>(15);
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'transfer' | 'cash'>('mercadopago');

  const myDataFromSplit = useMemo(() => {
    return splitData?.find(s => s.id === '1');
  }, [splitData]);

  const myCartItems = useMemo(() => {
    return cart.filter(item => item.guestId === '1');
  }, [cart]);

  const subtotal = useMemo(() => {
    return myDataFromSplit?.total || 0;
  }, [myDataFromSplit]);

  const tipAmount = useMemo(() => (subtotal * tipPercentage) / 100, [subtotal, tipPercentage]);
  const finalTotal = useMemo(() => subtotal + tipAmount, [subtotal, tipAmount]);

  const tips = [
    { label: 'None', value: 0 },
    { label: '10%', value: 10 },
    { label: '15%', value: 15, badge: 'Popular' },
    { label: '20%', value: 20 },
    { label: 'Custom', value: 25 },
  ];

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-40 bg-background-dark text-white font-display antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background-dark/90 px-4 py-4 backdrop-blur-md">
        <button onClick={onBack} className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold leading-tight">Your Share</h1>
        <button className="text-sm font-semibold text-primary active:opacity-70">Full Bill</button>
      </header>

      <div className="flex flex-col items-center justify-center pt-4 pb-8">
        <div className="text-[#9db9a8] text-sm font-medium mb-1">Total to pay</div>
        <h2 className="text-4xl font-extrabold tracking-tight">${formatPrice(subtotal)}</h2>
        <div className="mt-2 flex items-center gap-1 rounded-full bg-surface-dark px-3 py-1 border border-white/5">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '14px' }}>check_circle</span>
          <span className="text-xs text-white/70">Includes tax & service</span>
        </div>
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold tracking-tight">Your Items</h3>
          <button className="text-xs text-[#9db9a8] underline decoration-dotted">Not yours?</button>
        </div>
        
        <div className="flex flex-col gap-3">
          {myCartItems.length > 0 ? (
            myCartItems.map((item) => {
              const dish = menuItems.find(m => m.id === item.itemId);
              return (
                <div key={item.id} className="flex items-center gap-4 rounded-xl bg-surface-dark p-3 shadow-sm border border-white/5">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/10">
                    <img alt={dish?.name} className="h-full w-full object-cover" src={dish?.image_url} />
                  </div>
                  <div className="flex flex-1 flex-col justify-center">
                    <p className="text-sm font-semibold leading-normal">{dish?.name}</p>
                    <p className="text-xs text-slate-400">Qty: {item.quantity}</p>
                  </div>
                  <div className="shrink-0 font-bold">${formatPrice((dish?.price || 0) * item.quantity)}</div>
                </div>
              );
            })
          ) : (
            <div className="bg-surface-dark rounded-xl p-4 text-center border border-dashed border-white/10">
              <p className="text-xs text-[#9db9a8]">No individual items assigned</p>
            </div>
          )}
          
          <div className="mt-1 flex flex-col gap-1 px-3">
            <div className="flex justify-between text-xs text-[#9db9a8]">
              <span>Service Fee (Included)</span>
              <span>-</span>
            </div>
            <div className="flex justify-between text-xs text-[#9db9a8]">
              <span>Tax (Included)</span>
              <span>-</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-8">
        <h3 className="text-lg font-bold tracking-tight mb-3">Add a Tip</h3>
        <div className="grid grid-cols-5 gap-2">
          {tips.map((t) => (
            <button 
              key={t.label} 
              onClick={() => setTipPercentage(t.value)}
              className={`relative flex h-12 flex-col items-center justify-center rounded-xl border transition-all active:scale-95 ${
                tipPercentage === t.value 
                ? 'bg-primary border-primary text-black font-bold shadow-[0_0_15px_rgba(19,236,106,0.3)]' 
                : 'bg-surface-dark border-white/10 text-white font-semibold hover:border-primary'
              }`}
            >
              <span className="text-sm">{t.label}</span>
              {t.badge && (
                <div className="absolute -top-2 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-black shadow-sm">
                  {t.badge}
                </div>
              )}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-[#9db9a8]">100% of tips go directly to the staff.</p>
      </div>

      <div className="px-4 mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold tracking-tight">Payment Method</h3>
          <button className="text-xs text-primary font-semibold">Edit</button>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          <div 
            onClick={() => setPaymentMethod('mercadopago')}
            className={`relative flex min-w-[160px] flex-col justify-between rounded-2xl p-4 border-2 transition-all cursor-pointer ${
              paymentMethod === 'mercadopago' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-transparent opacity-60'
            }`}
          >
            {paymentMethod === 'mercadopago' && (
              <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-black">
                <span className="material-symbols-outlined" style={{ fontSize: '14px', fontWeight: 'bold' }}>check</span>
              </div>
            )}
            <span className="material-symbols-outlined mb-4 text-[#009EE3]" style={{ fontSize: '36px', fontVariationSettings: "'FILL' 1" }}>handshake</span>
            <div>
              <p className="font-bold text-sm">MercadoPago</p>
              <p className="text-xs text-slate-500">Wallet</p>
            </div>
          </div>

          <div 
            onClick={() => setPaymentMethod('transfer')}
            className={`relative flex min-w-[160px] flex-col justify-between rounded-2xl p-4 border-2 transition-all cursor-pointer ${
              paymentMethod === 'transfer' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-transparent opacity-60'
            }`}
          >
            {paymentMethod === 'transfer' && (
              <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-black">
                <span className="material-symbols-outlined" style={{ fontSize: '14px', fontWeight: 'bold' }}>check</span>
              </div>
            )}
            <span className="material-symbols-outlined mb-4 text-white" style={{ fontSize: '32px' }}>account_balance</span>
            <div>
              <p className="font-bold text-sm">Transferencia</p>
              <p className="text-xs text-slate-500">Bank Transfer</p>
            </div>
          </div>

          <div 
            onClick={() => setPaymentMethod('cash')}
            className={`relative flex min-w-[160px] flex-col justify-between rounded-2xl p-4 border-2 transition-all cursor-pointer ${
              paymentMethod === 'cash' ? 'bg-surface-dark border-primary' : 'bg-surface-dark border-transparent opacity-60'
            }`}
          >
            {paymentMethod === 'cash' && (
              <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-black">
                <span className="material-symbols-outlined" style={{ fontSize: '14px', fontWeight: 'bold' }}>check</span>
              </div>
            )}
            <span className="material-symbols-outlined mb-4 text-white" style={{ fontSize: '32px' }}>payments</span>
            <div>
              <p className="font-bold text-sm">Cash</p>
              <p className="text-xs text-slate-500">Pay at counter</p>
            </div>
          </div>

          <div className="relative flex min-w-[100px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 p-4 cursor-pointer hover:bg-white/5 transition-colors">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '24px' }}>add</span>
            <p className="text-xs font-semibold mt-2 text-slate-500">Add</p>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 z-50 w-full border-t border-white/5 bg-background-dark/95 backdrop-blur-xl p-4 pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-sm font-medium text-gray-400">Subtotal ${formatPrice(subtotal)} + ${formatPrice(tipAmount)} Tip</span>
          <span className="text-sm font-bold text-white">${formatPrice(finalTotal)}</span>
        </div>
        <button 
          onClick={onPay}
          className="group relative flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 transition-all hover:bg-green-400 active:scale-[0.98]"
        >
          <span className="text-lg font-bold text-black tracking-tight group-hover:tracking-normal transition-all">Pay Now</span>
          <span className="material-symbols-outlined text-black transition-transform group-hover:translate-x-1" style={{ fontSize: '20px' }}>arrow_forward</span>
        </button>
        <div className="mt-3 flex items-center justify-center gap-1.5 opacity-60">
          <span className="material-symbols-outlined text-white" style={{ fontSize: '12px' }}>lock</span>
          <p className="text-[10px] font-medium uppercase tracking-wide text-white">Secure payment processing</p>
        </div>
      </div>
    </div>
  );
};

export default IndividualShareView;
