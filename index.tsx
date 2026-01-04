
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("[DineSplit] Entry point loaded");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("[DineSplit] Error: Root element not found");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("[DineSplit] App mounted successfully");
} catch (error) {
  console.error("[DineSplit] Error mounting app:", error);
  rootElement.innerHTML = `
    <div style="padding: 2rem; color: white; background: #102217; min-height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column;">
      <h1 style="color: #13ec6a; margin-bottom: 1rem;">Error al cargar la aplicación</h1>
      <p style="color: #9db9a8; margin-bottom: 1rem;">${error instanceof Error ? error.message : 'Error desconocido'}</p>
      <button onclick="window.location.reload()" style="padding: 0.75rem 1.5rem; background: #13ec6a; color: #102217; border: none; border-radius: 0.5rem; font-weight: bold; cursor: pointer;">
        Recargar
      </button>
    </div>
  `;
}
