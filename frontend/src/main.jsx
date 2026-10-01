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
