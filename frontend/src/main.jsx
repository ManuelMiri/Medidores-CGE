import 'bootstrap/dist/css/bootstrap.min.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'

// El service worker se registra SOLO en navegador. Dentro del APK, Android
// conserva el storage del WebView entre actualizaciones, y el SW puede seguir
// sirviendo el bundle precacheado viejo despues de instalar una version nueva.
// En la web el comportamiento no cambia respecto de antes.
if (!Capacitor.isNativePlatform()) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* sin PWA (p. ej. en dev) la app funciona igual */ })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
