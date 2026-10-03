import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

// Automatically adjust the API path for every Axios call in the app
if (Capacitor.isNativePlatform()) {
  // Replace with your production URL or your local machine's IP (e.g., 'http://192.168.1.50:8000')
  axios.defaults.baseURL = 'https://your-production-fastapi-backend.com'; 
} else {
  // Keeps your existing Vite proxy working seamlessly for web development
  axios.defaults.baseURL = '/api'; 
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// PWA: offline-first app shell (API always network-first — see public/sw.js).
// Registered in PROD builds only. In dev the worker would pin localhost to
// stale cached CSS/JS across reloads, so dev actively unregisters it.
if ('serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          // Actively look for a newer worker on every load; when it takes
          // over, reload once so no client stays stuck on a stale shell.
          reg.update().catch(() => {})
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'activated' && navigator.serviceWorker.controller) {
                window.location.reload()
              }
            })
          })
        })
        .catch(() => {})
    })
  } else {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
      .catch(() => {})
    if (window.caches?.keys) {
      caches.keys()
        .then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
        .catch(() => {})
    }
  }
}
