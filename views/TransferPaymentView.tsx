import React, { useEffect, useState } from 'react';
import { formatPrice } from './MenuView';
import { supabase } from '../lib/supabase';

interface TransferPaymentViewProps {
  onBack: () => void;
  amount: number;
  restaurant?: any;
}

const TransferPaymentView: React.FC<TransferPaymentViewProps> = ({ onBack, amount, restaurant }) => {
  const [bankData, setBankData] = useState({
    alias: '',
    cbu: '',
    accountNumber: '',
    bankName: ''
  });

  useEffect(() => {
    const loadBankData = async () => {
      if (!restaurant?.id || !supabase) return;
      
      // Obtener datos bancarios desde payment_configs con provider que no sea 'mercadopago'
      const { data: config } = await supabase
        .from('payment_configs')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .neq('provider', 'mercadopago')
        .maybeSingle();
      
      if (config) {
        setBankData({
          alias: config.key_alias || '', // key_alias contiene el alias bancario
          cbu: config.token_cbu || '', // token_cbu contiene el CBU
          accountNumber: config.user_account || '', // user_account contiene el número de cuenta
          bankName: config.provider || '' // provider contiene el nombre del banco
        });
      }
    };

    loadBankData();
  }, [restaurant]);

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => alert('¡Copiado al portapapeles!'))
        .catch(err => {
          console.error("Error al copiar:", err);
          // Fallback
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          alert('¡Copiado al portapapeles!');
        });
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark text-white font-display antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background-dark/90 px-4 py-4 backdrop-blur-md border-b border-white/5">
        <button onClick={onBack} className="flex size-10 items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-base font-bold leading-tight">Datos Bancarios</h1>
        <div className="size-10"></div>
      </header>

      <div className="flex flex-col items-center justify-center pt-8 pb-6 animate-fade-in-up">
        <div className="size-20 rounded-full bg-primary/20 flex items-center justify-center mb-4 ring-2 ring-primary/30">
          <span className="material-symbols-outlined text-primary text-5xl" style={{ fontVariationSettings: "'wght' 600" }}>account_balance</span>
        </div>
        <h2 className="text-2xl font-black tracking-tight text-center px-4">Transferencia Bancaria</h2>
        <p className="text-text-secondary text-sm mt-2 text-center px-4">
          Realiza la transferencia por el monto indicado
        </p>
      </div>

      <div className="px-5 space-y-4 pb-40">
        {/* Monto a transferir */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="bg-surface-dark rounded-3xl p-6 border border-white/5">
            <div className="flex flex-col items-center text-center">
              <p className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-2">Monto a Transferir</p>
              <p className="text-4xl font-black text-primary tabular-nums">${formatPrice(amount)}</p>
            </div>
          </div>
        </section>

        {/* Datos bancarios */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary mb-4 px-1">Datos de la Cuenta</h3>
          
          {/* Alias */}
          <div className="bg-surface-dark rounded-2xl p-5 border border-white/5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-text-secondary text-xs font-bold uppercase tracking-widest">Alias</p>
              <button
                onClick={() => copyToClipboard(bankData.alias)}
                className="text-primary text-xs font-black uppercase tracking-wider hover:opacity-80 transition-opacity"
              >
                Copiar
              </button>
            </div>
            <p className="text-xl font-black tracking-tight break-all">{bankData.alias}</p>
          </div>

          {/* CBU */}
          <div className="bg-surface-dark rounded-2xl p-5 border border-white/5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-text-secondary text-xs font-bold uppercase tracking-widest">CBU</p>
              <button
                onClick={() => copyToClipboard(bankData.cbu)}
                className="text-primary text-xs font-black uppercase tracking-wider hover:opacity-80 transition-opacity"
              >
                Copiar
              </button>
            </div>
            <p className="text-xl font-black tracking-tight break-all">{bankData.cbu || 'No disponible'}</p>
          </div>

          {/* Nro de Cuenta */}
          <div className="bg-surface-dark rounded-2xl p-5 border border-white/5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-text-secondary text-xs font-bold uppercase tracking-widest">Nro de Cuenta</p>
              {bankData.accountNumber && (
                <button
                  onClick={() => copyToClipboard(bankData.accountNumber)}
                  className="text-primary text-xs font-black uppercase tracking-wider hover:opacity-80 transition-opacity"
                >
                  Copiar
                </button>
              )}
            </div>
            <p className="text-xl font-black tracking-tight break-all">{bankData.accountNumber || 'No disponible'}</p>
          </div>

          {/* Banco */}
          <div className="bg-surface-dark rounded-2xl p-5 border border-white/5">
            <p className="text-text-secondary text-xs font-bold uppercase tracking-widest mb-2">Banco</p>
            <p className="text-base font-bold capitalize">{bankData.bankName || 'No disponible'}</p>
          </div>
        </section>

        {/* Instrucciones */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="bg-primary/10 rounded-2xl p-5 border border-primary/20">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-xl font-black">info</span>
              <div className="flex-1">
                <p className="text-primary font-black text-xs uppercase tracking-widest mb-2">Importante</p>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Una vez realizada la transferencia, el restaurante recibirá una notificación y marcará tu pago como confirmado. 
                  El proceso puede tardar unos minutos.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default TransferPaymentView;

