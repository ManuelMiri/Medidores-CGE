import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Cachea el mapa base (tiles de CARTO) para que, con mala señal en
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
        // Si alguien abre una URL de la API directo en el navegador (ej. una
        // foto), no quiero que el service worker le responda con el index.html
        // de la app. Con esto esas rutas siempre van a la red.
        navigateFallbackDenylist: [/^\/api/],
        // Las llamadas a la API (ULs, medidores, login, etc.) NUNCA deben
        // servirse desde caché — siempre red primero. Antes no estaban
        // excluidas explícitamente, así que en algunos navegadores el
        // service worker las interceptaba igual y devolvía respuestas
        // viejas o rotas.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles-mapa',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 días
              // Solo 200: los tiles ahora se piden con crossOrigin (ver
              // Mapa.jsx), así que llegan como respuesta normal y no "opaca".
              // Las opacas Chrome las cuenta como ~7 MB cada una en la cuota,
              // y con 2000 tiles eso reventaba el almacenamiento del celular.
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Lo mismo para el satélite de Esri (fotos + nombres de calles).
            // Le puse menos entradas que al mapa normal porque las fotos pesan
            // bastante más y no quiero llenarle el celular a nadie.
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles-satelite',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 días
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Los íconos de los marcadores (verde, rojo, azul, etc.) vienen de
            // unpkg y GitHub. Sin esto, sin señal el mapa cargaba pero los
            // medidores aparecían sin ícono. Son pocos archivos, así que acá
            // sí da lo mismo que sean respuestas opacas.
            urlPattern: /^https:\/\/(unpkg\.com\/leaflet@|raw\.githubusercontent\.com\/pointhi\/leaflet-color-markers\/).*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'iconos-marcadores',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
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
        start_url: '/',
        lang: 'es',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})