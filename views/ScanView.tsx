
import React, { useState, useEffect, useRef } from 'react';

// Declaración global para la librería cargada por script
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
  
  const scannerRef = useRef<any>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const scannerId = "qr-reader";

  useEffect(() => {
    // Iniciar el scanner al montar el componente
    startScanner();

    return () => {
      stopScanner();
    };
  }, []);

  // Efecto para enfocar el input cuando se abre el modal manual
  useEffect(() => {
    if (isManualModalOpen) {
      const timer = setTimeout(() => {
        manualInputRef.current?.focus();
      }, 150); 
      return () => clearTimeout(timer);
    }
  }, [isManualModalOpen]);

  const startScanner = async () => {
    try {
      setScannerError(null);
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 0.75 
      };

      await html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        onScanSuccess,
        onScanFailure
      );
      setIsCameraActive(true);
    } catch (err) {
      console.error("Error iniciando cámara:", err);
      setScannerError("No se pudo acceder a la cámara. Por favor usa el ingreso manual.");
      setIsCameraActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.error("Error deteniendo el scanner:", err);
      }
    }
  };

  const onScanSuccess = (decodedText: string) => {
    console.log(`Código detectado: ${decodedText}`);
    
    let resCode = "";
    let tableNum = "";

    try {
      // 1. Intentar detectar parámetros de consulta (res=...&table=...)
      if (decodedText.includes("?")) {
        const queryPart = decodedText.split('?')[1];
        const params = new URLSearchParams(queryPart);
        resCode = params.get('res') || "";
        tableNum = params.get('table') || "";
      } 
      
      // 2. Si no hay parámetros de consulta, intentar parseo por segmentos de ruta
      if (!resCode || !tableNum) {
        if (decodedText.includes("://")) {
          // Formatos: "https://dinesplit.app/LAP006/1"
          const urlObj = new URL(decodedText);
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          if (pathParts.length >= 2) {
            tableNum = pathParts.pop() || "";
            resCode = pathParts.pop() || "";
          }
        } else {
          // Formatos: "LAP006-1", "LAP006/1", "LAP006 1"
          const separators = /[-/: ]/;
          const parts = decodedText.split(separators);
          if (parts.length >= 2) {
            resCode = parts[0];
            tableNum = parts[1];
          } else {
            // Caso borde: solo un código
            resCode = decodedText;
          }
        }
      }

      if (resCode && tableNum) {
        stopScanner();
        onNext(resCode.toUpperCase(), tableNum);
      }
    } catch (e) {
      console.error("Error parseando código:", e);
      // Fallback simple: dividir por separadores comunes
      const separators = /[-/: ]/;
      const parts = decodedText.split(separators);
      if (parts.length >= 2) {
        stopScanner();
        onNext(parts[0].toUpperCase(), parts[1]);
      }
    }
  };

  const onScanFailure = (error: any) => {
    // No alertamos en cada fallo de lectura (es normal mientras busca el QR)
  };

  const handleManualConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (restaurantCode && tableNumber) {
      stopScanner();
      onNext(restaurantCode.toUpperCase(), tableNumber);
    } else {
      alert("Por favor ingresa ambos datos");
    }
  };

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden bg-background-dark">
      <div className="h-12 shrink-0"></div>
      <div className="flex items-center px-4 py-2 justify-between shrink-0 z-20">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Bienvenido a</span>
          <h2 className="text-white text-lg font-bold leading-tight tracking-tight">{restaurantName || 'DineSplit'}</h2>
        </div>
        <button className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-white">help</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start pt-4 relative">
        <div className="text-center px-6 mb-2 shrink-0 z-20">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-white">¡A comer se ha dicho!</h1>
          <p className="text-text-secondary text-sm">Escanea el código QR de tu mesa para ordenar.</p>
        </div>

        <div className="relative w-full max-w-[340px] aspect-[3/4] my-6 rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 group bg-black/40">
          <div id={scannerId} className="w-full h-full"></div>

          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-surface-dark/80 backdrop-blur-md">
               <span className="material-symbols-outlined text-primary text-5xl mb-4">no_photography</span>
               <p className="text-white text-sm font-bold mb-4">{scannerError || "Iniciando cámara..."}</p>
               <button onClick={startScanner} className="bg-primary/20 text-primary px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest">Reintentar Cámara</button>
            </div>
          )}

          <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between z-10">
            <div className="flex justify-between">
              <div className="w-12 h-12 border-l-4 border-t-4 border-primary rounded-tl-2xl shadow-[0_0_15px_rgba(19,236,106,0.5)]"></div>
              <div className="w-12 h-12 border-r-4 border-t-4 border-primary rounded-tr-2xl shadow-[0_0_15px_rgba(19,236,106,0.5)]"></div>
            </div>
            
            <div className="absolute left-0 w-full h-[2px] bg-primary shadow-[0_0_10px_#13ec6a] animate-scan opacity-50"></div>
            
            <div className="flex justify-between">
              <div className="w-12 h-12 border-l-4 border-b-4 border-primary rounded-bl-2xl shadow-[0_0_15px_rgba(19,236,106,0.5)]"></div>
              <div className="w-12 h-12 border-r-4 border-b-4 border-primary rounded-br-2xl shadow-[0_0_15px_rgba(19,236,106,0.5)]"></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 w-full px-6 mt-auto pb-10 z-20">
          <div className="flex items-center gap-3 w-full">
            <div className="h-[1px] bg-white/10 flex-1"></div>
            <span className="text-xs uppercase font-black text-slate-500 tracking-widest">O</span>
            <div className="h-[1px] bg-white/10 flex-1"></div>
          </div>
          
          <button 
            onClick={() => setIsManualModalOpen(true)}
            className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between px-6 hover:bg-white/10 active:scale-[0.98] transition-all duration-200 group"
          >
            <span className="text-white font-bold text-lg">Ingreso manual</span>
            <div className="size-10 rounded-full bg-white flex items-center justify-center group-hover:bg-primary transition-colors">
              <span className="material-symbols-outlined text-black text-[20px] font-bold">dialpad</span>
            </div>
          </button>
        </div>
      </div>

      {isManualModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsManualModalOpen(false)}></div>
          <div className="bg-surface-dark w-full max-w-md mx-auto rounded-t-[32px] overflow-hidden flex flex-col relative z-10 animate-fade-in-up border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-12 h-1.5 bg-white/20 rounded-full"></div>
            </div>

            <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">login</span>
                Acceso Manual
              </h2>
              <button onClick={() => setIsManualModalOpen(false)} className="size-10 rounded-full bg-white/5 flex items-center justify-center text-text-secondary hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleManualConfirm} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-text-secondary text-[10px] font-black uppercase tracking-widest mb-2 block pl-1">Código Restaurante</label>
                  <input 
                    ref={manualInputRef}
                    type="text" 
                    placeholder="Ej: LAP006"
                    value={restaurantCode}
                    onChange={(e) => setRestaurantCode(e.target.value.toUpperCase())}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-xl font-bold focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-white/10"
                  />
                </div>
                
                <div>
                  <label className="text-text-secondary text-[10px] font-black uppercase tracking-widest mb-2 block pl-1">Número de Mesa</label>
                  <input 
                    type="number" 
                    placeholder="Ej: 1"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-xl font-bold focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-white/10"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={!restaurantCode || !tableNumber}
                  className={`w-full h-16 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all ${
                    (restaurantCode && tableNumber) ? 'bg-primary text-background-dark shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]' : 'bg-white/5 text-white/20 cursor-not-allowed'
                  }`}
                >
                  <span>Ingresar a la Mesa</span>
                  <span className="material-symbols-outlined font-bold">sync</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanView;
