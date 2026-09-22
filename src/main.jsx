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

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);

// Register Offline Service Worker for 0ms offline capability
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((reg) => console.log('🚀 [PWA] Offline Service Worker registered:', reg.scope))
      .catch((err) => console.warn('⚠️ [PWA] Service Worker registration failed:', err));
  });
}
