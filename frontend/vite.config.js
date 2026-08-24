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
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})