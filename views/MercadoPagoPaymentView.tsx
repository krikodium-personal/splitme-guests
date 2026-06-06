import React from 'react';
import MercadoPagoPaymentBrick from '../components/MercadoPagoPaymentBrick';

type MercadoPagoPaymentViewProps = {
  amount: number;
  restaurantId: string;
  orderId: string;
  guestId: string;
  chargeId?: string | null;
  onBack: () => void;
  onApproved: (paymentId: string | number) => void;
  onError: (message: string) => void;
};

const MercadoPagoPaymentView: React.FC<MercadoPagoPaymentViewProps> = ({
  amount,
  restaurantId,
  orderId,
  guestId,
  chargeId,
  onBack,
  onApproved,
  onError,
}) => {
  return (
    <div className="min-h-screen bg-background-dark text-white flex flex-col">
      <header className="p-6 flex items-center gap-4 border-b border-white/5">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-surface-dark flex items-center justify-center"
          aria-label="Volver"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-lg font-bold">Pagar con Mercado Pago</h1>
          <p className="text-sm text-text-secondary">
            Total: ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        <MercadoPagoPaymentBrick
          restaurantId={restaurantId}
          orderId={orderId}
          guestId={guestId}
          chargeId={chargeId}
          amount={amount}
          onApproved={onApproved}
          onError={onError}
        />
      </main>
    </div>
  );
};

export default MercadoPagoPaymentView;
