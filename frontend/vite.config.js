import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // el registro lo hago yo en main.jsx (para que recargue sola al actualizar)
      injectRegister: false,
      // Cachea el mapa base (calles de OSM y satélite de Esri) para que, con mala señal en
      // terreno, el mapa de zonas ya visitadas siga apareciendo aunque no
      // haya red — no reemplaza tener señal, pero ayuda con la lentitud
      // que veíamos en zonas rurales.
      workbox: {
        // Sin esto, un service worker nuevo se queda "esperando" en
        // segundo plano hasta que cierres todas las pestañas — y mientras
        // tanto la app sigue sirviendo la versión vieja desde el caché.
        // skipWaiting + clientsClaim fuerza a que la versión nueva tome el
        // control apenas está lista, sin esperar nada.
        skipWaiting: true,
        clientsClaim: true,
        // borra los archivos de versiones anteriores del caché, para que no
        // se mezclen .js viejos con nuevos (eso era el error raro al abrir)
        cleanupOutdatedCaches: true,
        // la API nunca debe responder con el index.html cacheado
        navigateFallbackDenylist: [/^\/api\//],
        // Las llamadas a la API (ULs, medidores, login, etc.) NUNCA deben
        // servirse desde caché — siempre red primero. Antes no estaban
        // excluidas explícitamente, así que en algunos navegadores el
        // service worker las interceptaba igual y devolvía respuestas
        // viejas o rotas.
        runtimeCaching: [
          {
            // ojo: cambié el nombre del caché para no seguir sirviendo los tiles
            // viejos de CARTO que quedaron guardados con el "API KEY REQUIRED"
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles-osm-v2',
              // purgeOnQuotaError: si el celular se queda sin espacio, borra
              // este caché en vez de romper el service worker entero
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }, // 30 días
              // Antes guardaba también status 0 (respuestas "opacas"). Chrome
              // cuenta cada respuesta opaca como ~7 MB en la cuota, así que con
              // unos cientos de tiles el celular se quedaba sin espacio y la PWA
              // empezaba a fallar. Ahora los tiles se piden con CORS
              // (crossOrigin en Mapa.jsx) y solo guardo respuestas 200 reales.
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // tiles satelitales de Esri, mismo trato que los de OSM
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles-satelite-v3', // v3: bota los cuadros grises y las respuestas opacas guardadas
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }, // 30 días
              cacheableResponse: { statuses: [200] }, // ver comentario de arriba
            },
          },
          {
            urlPattern: /\/api\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'MLA Maule — Localización de Medidores',
        short_name: 'MLA Maule',
        description: 'Sistema de localización y seguimiento de medidores eléctricos',
        theme_color: '#2b6cb0',
        background_color: '#ffffff',
        display: 'standalone',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'es',
        orientation: 'portrait',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})