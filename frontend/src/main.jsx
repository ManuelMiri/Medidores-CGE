import 'bootstrap/dist/css/bootstrap.min.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// El service worker CON PRECACHE es solo para el navegador, por dos razones
// distintas que apuntan al mismo lado:
//   - Dentro del WebView del APK, Android conserva el storage entre
//     actualizaciones, asi que el SW seguiria sirviendo el bundle precacheado
//     viejo despues de instalar una version nueva.
//   - La recuperacion del vite:preloadError existe para cuando se redeploya la
//     web con una pestaña vieja abierta. En el APK no hay deploy a mitad de
//     sesion: el bundle es el que quedo instalado.
//
// El APK tiene el suyo propio (sw-tiles.js), ver mas abajo.
if (!Capacitor.isNativePlatform()) {
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
} else {
  // En el APK va un service worker propio que SOLO cachea tiles del mapa.
  //
  // Sin esto el APK no cacheaba nada: el caché de 1.500 tiles por 30 días de
  // vite-plugin-pwa vive en el SW del navegador, que acá no se puede registrar
  // porque precachea el bundle. En terreno eso significaba volver a bajar los
  // cuadros de una zona ya visitada cada vez.
  //
  // sw-tiles.js no precachea nada y solo intercepta los hosts de tiles, así
  // que no puede servir un bundle viejo: el problema que motivó apagar el SW
  // acá no aplica.
  navigator.serviceWorker?.register('/sw-tiles.js').catch(() => {
    // Si falla, el mapa funciona igual, solo que sin caché de tiles. No vale
    // la pena molestar al lector con un error por esto.
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
