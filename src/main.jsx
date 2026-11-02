import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// ReactDOM.createRoot(document.getElementById('root')).render(
//   <React.StrictMode>
//     <ErrorBoundary>
//       <BrowserRouter>
//         <App />
//       </BrowserRouter>
//     </ErrorBoundary>
//   </React.StrictMode>,
// );

// Auto-reload on stale Vite dynamic chunk preload errors
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);

// Register Offline Service Worker for 0ms offline capability (Production only)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Clean dev environment: unregister SW and purge CacheStorage on localhost
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let reg of registrations) {
        reg.unregister();
        console.log('🧹 [Dev] Unregistered service worker on localhost');
      }
    });
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (let name of names) caches.delete(name);
      });
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((reg) => console.log('🚀 [PWA] Offline Service Worker registered:', reg.scope))
        .catch((err) => console.warn('⚠️ [PWA] Service Worker registration failed:', err));
    });
  }
}
