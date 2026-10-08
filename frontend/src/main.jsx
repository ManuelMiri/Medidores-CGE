import 'bootstrap/dist/css/bootstrap.min.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Antes el service worker se registraba con el script automático del plugin,
// que instala la versión nueva pero NO recarga la página. Resultado: en el
// navegador normal seguía viéndose la versión vieja (en incógnito no, porque
// ahí no hay service worker). Ahora lo registro yo: cuando hay versión nueva
// se activa y la página se recarga sola con lo último.
const actualizarSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    // Los técnicos dejan la app abierta todo el día en el celular, así que
    // reviso si hay versión nueva cada 30 min y cada vez que vuelven a la app
    setInterval(() => registro.update(), 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update()
    })
  },
})

// Si quedó una página vieja abierta y pide un archivo .js que ya no existe
// en el deploy nuevo, Vite lanza este evento. En vez de mostrar el error,
// actualizo y recargo una sola vez (el flag evita un loop de recargas).
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  try {
    if (sessionStorage.getItem('recargadoPorError')) return
    sessionStorage.setItem('recargadoPorError', '1')
  } catch { /* sin sessionStorage, recargo igual */ }
  actualizarSW(true)
  window.location.reload()
})
window.addEventListener('load', () => {
  // si cargó bien, limpio el flag para la próxima vez
  setTimeout(() => { try { sessionStorage.removeItem('recargadoPorError') } catch { /* nada */ } }, 5000)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)