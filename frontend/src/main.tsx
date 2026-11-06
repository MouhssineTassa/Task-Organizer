import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA : le service worker n'est enregistré qu'en production (il gênerait le rechargement à chaud en développement).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sans service worker, l'application fonctionne normalement */
    });
  });
}

// Les erreurs réseau (serveur injoignable) sont déjà expliquées par le bandeau : on évite le bruit de "unhandled rejection".
window.addEventListener("unhandledrejection", (e) => {
  if ((e.reason as { isAxiosError?: boolean; response?: unknown })?.isAxiosError && !(e.reason as { response?: unknown }).response) e.preventDefault();
});
