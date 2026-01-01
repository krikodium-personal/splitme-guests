
import React, { useState, useEffect, useRef } from 'react';

// External QR library
declare const Html5Qrcode: any;

interface ScanViewProps {
  onNext: (code: string, table: string) => void;
  restaurantName?: string;
}

const ScanView: React.FC<ScanViewProps> = ({ onNext, restaurantName }) => {
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [restaurantCode, setRestaurantCode] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  
  const scannerRef = useRef<any>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const scannerId = "qr-reader";

  // Shutdown scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    if (isCameraActive || isInitializing) return;

    setIsInitializing(true);
    setScannerError(null);

    try {
      // Ensure the script is available
      if (typeof Html5Qrcode === 'undefined') {
        throw new Error("Librería de escaneo no disponible. Reintenta.");
      }

      // Initializing the component
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0 
      };

      await html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        onScanSuccess,
        onScanFailure
      );
      
      setIsCameraActive(true);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setScannerError(err.message?.includes("Permission") 
        ? "Acceso a cámara denegado. Actívala o ingresa el código manualmente." 
        : "No pudimos iniciar la cámara.");
      setIsCameraActive(false);
    } finally {
      setIsInitializing(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        setIsCameraActive(false);
      } catch (err) {
        console.error("Stop error:", err);
      }
    }
  };

  const onScanSuccess = (decodedText: string) => {
    let resCode = "";
    let tableNum = "";

    try {
      if (decodedText.includes("?")) {
        const params = new URLSearchParams(decodedText.split('?')[1]);
        resCode = params.get('res') || "";
        tableNum = params.get('table') || "";
      } 
      
      if (!resCode || !tableNum) {
        const parts = decodedText.split(/[-/: ]/);
        if (parts.length >= 2) {
          resCode = parts[parts.length - 2];
          tableNum = parts[parts.length - 1];
        }
      }

      if (resCode && tableNum) {
        stopScanner();
        onNext(resCode, tableNum);
      }
    } catch (e) {
      console.error("Parse error:", e);
    }
  };

  const onScanFailure = () => {};

  const handleManualConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (restaurantCode && tableNumber) {
      onNext(restaurantCode, tableNumber);
    }
  };

  return (
    <div className="relative flex flex-col flex-1 bg-background-dark animate-fade-in overflow-hidden">
      <div className="h-12 shrink-0"></div>
      
      <div className="flex items-center px-6 justify-between shrink-0 z-20">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Bienvenido a</span>
          <h2 className="text-white text-xl font-bold">{restaurantName || 'DineSplit'}</h2>
        </div>
        <button onClick={() => setIsManualModalOpen(true)} className="size-10 flex items-center justify-center rounded-full bg-white/5 text-white">
          <span className="material-symbols-outlined">help</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 relative">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-white mb-3">¡Bienvenido!</h1>
          <p className="text-text-secondary text-sm">Escanea el código QR de tu mesa para empezar a pedir.</p>
        </div>

        {/* Scanner Container */}
        <div className="relative w-full max-w-[320px] aspect-square rounded-[3rem] overflow-hidden bg-black/40 border border-white/10 shadow-2xl flex items-center justify-center">
          <div id={scannerId} className={`w-full h-full absolute inset-0 transition-opacity duration-700 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}></div>

          {!isCameraActive && (
            <div className="relative z-10 flex flex-col items-center p-8 text-center animate-fade-in">
              {isInitializing ? (
                <>
                  <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-white text-xs font-bold uppercase tracking-widest">Iniciando...</p>
                </>
              ) : (
                <>
                  <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-primary text-5xl">qr_code_scanner</span>
                  </div>
                  {scannerError && <p className="text-red-400 text-xs font-bold mb-4">{scannerError}</p>}
                  <button 
                    onClick={startScanner} 
                    className="bg-primary text-background-dark px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-transform"
                  >
                    Activar Cámara
                  </button>
                </>
              )}
            </div>
          )}

          {isCameraActive && (
             <div className="absolute inset-0 pointer-events-none z-20">
                <div className="absolute top-0 left-0 w-full h-full border-[1.5rem] border-background-dark/20"></div>
                <div className="absolute inset-6 border-2 border-primary/40 rounded-[2rem]"></div>
                <div className="absolute left-0 top-[10%] w-full h-[2px] bg-primary/60 shadow-[0_0_15px_#13ec6a] animate-scan"></div>
             </div>
          )}
        </div>

        <div className="mt-12 w-full flex flex-col items-center gap-6">
          <div className="flex items-center gap-4 w-full opacity-30">
            <div className="h-[1px] bg-white flex-1"></div>
            <span className="text-[10px] font-black uppercase text-white tracking-widest">O</span>
            <div className="h-[1px] bg-white flex-1"></div>
          </div>
          
          <button 
            onClick={() => setIsManualModalOpen(true)}
            className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-white text-xl">dialpad</span>
            <span className="text-white font-bold">Ingreso Manual</span>
          </button>
        </div>
      </div>

      {isManualModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsManualModalOpen(false)}></div>
          <div className="bg-surface-dark w-full rounded-t-[32px] p-8 border-t border-white/10 relative z-10 animate-fade-in-up">
            <h2 className="text-2xl font-black text-white mb-8">Acceso Manual</h2>
            <form onSubmit={handleManualConfirm} className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block mb-2">Código Local</label>
                <input 
                  type="text" value={restaurantCode} onChange={e => setRestaurantCode(e.target.value.toUpperCase())}
                  placeholder="Ej: LAP006" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-xl font-bold outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block mb-2">Número de Mesa</label>
                <input 
                  type="number" value={tableNumber} onChange={e => setTableNumber(e.target.value)}
                  placeholder="Ej: 1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-xl font-bold outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button 
                type="submit" disabled={!restaurantCode || !tableNumber}
                className="w-full h-16 bg-primary text-background-dark rounded-2xl font-black text-lg disabled:opacity-30 transition-all"
              >
                Ingresar a la mesa
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanView;
