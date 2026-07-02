import React, { useState, useEffect, useRef } from 'react';

declare const Html5Qrcode: any;

interface ScanViewProps {
  onNext: (code: string, table: string) => void;
  restaurantName?: string;
}

const ScanView: React.FC<ScanViewProps> = ({ onNext, restaurantName }) => {
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [restaurantCode, setRestaurantCode] = useState('SOR047');
  const [tableNumber, setTableNumber] = useState('');
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const scannerRef = useRef<any>(null);
  const scannerId = "qr-reader";

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  const startScanner = async () => {
    if (isCameraActive || isInitializing) return;
    setIsInitializing(true);
    setScannerError(null);
    try {
      if (typeof Html5Qrcode === 'undefined') throw new Error("Librería de escaneo no cargada. Reintenta.");
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
        onScanSuccess,
        onScanFailure
      );
      setIsCameraActive(true);
    } catch (err: any) {
      setScannerError(err.message?.includes("Permission")
        ? "Permiso de cámara denegado. Activalo en ajustes o usá el código manual."
        : "No pudimos acceder a la cámara.");
      setIsCameraActive(false);
    } finally {
      setIsInitializing(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try { await scannerRef.current.stop(); setIsCameraActive(false); } catch (e) {}
    }
  };

  const onScanSuccess = (decodedText: string) => {
    let resCode = "", tableNum = "";
    try {
      if (decodedText.includes("?")) {
        const params = new URLSearchParams(decodedText.split('?')[1]);
        resCode = params.get('res') || "";
        tableNum = params.get('table') || "";
      }
      if (!resCode || !tableNum) {
        const parts = decodedText.split(/[-/: ]/);
        if (parts.length >= 2) { resCode = parts[parts.length - 2]; tableNum = parts[parts.length - 1]; }
      }
      if (resCode && tableNum) { stopScanner(); onNext(resCode, tableNum.toString()); }
    } catch (e) {}
  };

  const onScanFailure = () => {};

  const handleManualConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (restaurantCode && tableNumber) onNext(restaurantCode.toUpperCase().trim(), tableNumber.toString().trim());
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden font-display">
      {/* Foto de fondo */}
      <img
        src="https://images.unsplash.com/photo-1559329007-40df8a9345d8?auto=format&fit=crop&w=800&q=80"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Gradiente oscuro sobre la foto */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/50 to-black/90" />

      {/* Contenido */}
      <div className="relative z-10 flex flex-col flex-1">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-14 pb-4">
          <h1 className="text-white text-2xl font-bold tracking-tight">SplitMe</h1>
          <button className="size-10 flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white/60">
            <span className="material-symbols-outlined text-[20px]">help</span>
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">

          <div className="text-center">
            <h2 className="text-white text-[32px] font-bold leading-tight mb-2">¡A comer!</h2>
            <p className="text-white/55 text-sm leading-relaxed">Escaneá el código QR de tu mesa o ingresa los datos manualmente para entrar al menú y empezar tu pedido.</p>
          </div>

          {/* Scanner */}
          <div className="relative w-full max-w-[300px] aspect-square rounded-[2.5rem] overflow-hidden bg-black/40 border border-white/10 shadow-2xl flex items-center justify-center">
            <div
              id={scannerId}
              className={`w-full h-full absolute inset-0 transition-opacity duration-700 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
            />

            {!isCameraActive && (
              <div className="relative z-10 flex flex-col items-center p-8 text-center">
                {isInitializing ? (
                  <>
                    <div className="size-12 border-[3px] border-primary border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-white/60 text-xs font-medium">Iniciando cámara...</p>
                  </>
                ) : (
                  <>
                    <div className="size-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                      <span className="material-symbols-outlined text-primary text-5xl">qr_code_scanner</span>
                    </div>
                    {scannerError && <p className="text-red-400 text-xs font-medium mb-5 px-2">{scannerError}</p>}
                    <button
                      onClick={startScanner}
                      className="bg-primary text-black px-8 py-3 rounded-2xl text-sm font-semibold shadow-lg shadow-primary/30 active:scale-95 transition-transform"
                    >
                      Escanear QR
                    </button>
                  </>
                )}
              </div>
            )}

            {isCameraActive && (
              <div className="absolute inset-0 pointer-events-none z-20">
                <div className="absolute inset-6 border-2 border-primary/50 rounded-[2rem]" />
                <div className="absolute left-0 top-[10%] w-full h-[2px] bg-primary/70 shadow-[0_0_12px_#F0AE4A] animate-scan" />
              </div>
            )}
          </div>

          {/* Separador + ingreso manual */}
          <div className="w-full flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 w-full">
              <div className="h-px bg-white/15 flex-1" />
              <span className="text-white/30 text-xs font-medium">o ingresá el código</span>
              <div className="h-px bg-white/15 flex-1" />
            </div>

            <button
              onClick={() => setIsManualModalOpen(true)}
              className="w-full h-14 bg-white/8 border border-white/12 rounded-2xl flex items-center justify-between px-5 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <span className="text-white/70 font-medium">Ingresar código manualmente</span>
              <span className="material-symbols-outlined text-primary text-xl">keyboard</span>
            </button>
          </div>

        </div>

        {/* Footer versión */}
        <footer className="py-5 flex justify-center">
          <span className="text-white/20 text-[10px] font-medium tracking-widest">v{__APP_VERSION__}</span>
        </footer>
      </div>

      {/* Modal ingreso manual */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsManualModalOpen(false)} />
          <div className="bg-surface-dark w-full rounded-t-[2.5rem] p-8 pb-12 border-t border-white/8 relative z-10 animate-fade-in-up shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
            <div className="flex justify-center mb-6">
              <div className="w-10 h-1 bg-white/15 rounded-full" />
            </div>
            <h2 className="text-[20px] font-bold text-white mb-7 tracking-tight">Acceso manual</h2>
            <form onSubmit={handleManualConfirm} className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-text-secondary block mb-2 ml-1">Código del local</label>
                <input
                  type="text"
                  value={restaurantCode}
                  onChange={e => setRestaurantCode(e.target.value.toUpperCase())}
                  placeholder="Ej: SOR047"
                  className="w-full bg-white/5 border border-border-dark rounded-2xl px-5 py-4 text-white text-lg font-semibold outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-text-secondary block mb-2 ml-1">Número de mesa</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej: 4"
                  className="w-full bg-white/5 border border-border-dark rounded-2xl px-5 py-4 text-white text-lg font-semibold outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={!restaurantCode || !tableNumber}
                className="w-full h-[54px] bg-primary text-black rounded-[14px] font-semibold text-[15px] disabled:opacity-25 transition-all mt-2 active:scale-[0.98]"
              >
                Vincular mesa
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanView;
