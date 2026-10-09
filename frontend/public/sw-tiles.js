// sw-tiles.js
// Service worker SOLO para el APK. Cachea los tiles del mapa y NADA MÁS.
//
// Por qué existe uno aparte: en el navegador, vite-plugin-pwa genera un
// service worker que precachea el bundle de la app. Dentro del WebView eso no
// se puede usar, porque Android conserva el storage entre actualizaciones del
// APK y el SW seguiría sirviendo el bundle viejo después de instalar una
// versión nueva. Por eso el registro estaba apagado en nativo — y con él se
// iba también el caché de tiles, así que en el APK cada zona ya visitada se
// volvía a bajar entera. En terreno rural eso es la mitad de la sensación de
// lentitud.
//
// Este SW no precachea nada y solo intercepta los hosts de tiles: no puede
// servir un bundle viejo ni tocar /api, porque para todo lo demás ni siquiera
// llama a respondWith y la petición sigue de largo.

const CACHE = 'tiles-nativo-v1'
const MAX_ENTRADAS = 1500
const MAX_EDAD_MS = 30 * 24 * 60 * 60 * 1000 // 30 días
const CABECERA_FECHA = 'x-cacheado-en'

// Los mismos de vite.config.js. Si se agrega una capa nueva al mapa, va acá.
const HOSTS_DE_TILES = ['tile.openstreetmap.org', 'server.arcgisonline.com']

// Capas que ya no se usan. Lo que quedó cacheado de ellas se borra al activar
// una versión nueva del service worker: si no, seguiría ocupando parte de las
// 1.500 entradas hasta que la poda FIFO lo alcanzara. Cuando se saque una capa
// del mapa, su fragmento de URL va acá.
const CAPAS_RETIRADAS = ['World_Boundaries_and_Places']

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    await self.clients.claim()
    const cache = await caches.open(CACHE)
    await limpiarCapasRetiradas(cache)
    await podar(cache, true)
  })())
})

async function limpiarCapasRetiradas(cache) {
  if (!CAPAS_RETIRADAS.length) return
  for (const peticion of await cache.keys()) {
    if (CAPAS_RETIRADAS.some((c) => peticion.url.includes(c))) await cache.delete(peticion)
  }
}

const esTile = (url) => HOSTS_DE_TILES.includes(url.hostname)

function estaVencida(respuesta) {
  const t = Number(respuesta.headers.get(CABECERA_FECHA))
  // Sin marca de fecha: la guardó una versión anterior. Se da por buena en vez
  // de botarla, total el siguiente fetch la renueva con marca.
  if (!t) return false
  return Date.now() - t > MAX_EDAD_MS
}

// La Cache API no guarda cuándo se escribió cada entrada, así que la fecha se
// mete como cabecera propia. Las cabeceras de una Response son inmutables, de
// ahí que haya que construir una nueva.
async function conFecha(respuesta) {
  const cabeceras = new Headers(respuesta.headers)
  cabeceras.set(CABECERA_FECHA, String(Date.now()))
  return new Response(await respuesta.blob(), {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: cabeceras,
  })
}

// cache.keys() devuelve en orden de inserción, así que borrar las primeras es
// FIFO. No es LRU, pero recorrer 1.500 entradas en cada guardado costaría más
// de lo que ahorra: se poda cada 50.
let guardadosDesdeLaPoda = 0
async function podar(cache, forzar = false) {
  if (!forzar && ++guardadosDesdeLaPoda < 50) return
  guardadosDesdeLaPoda = 0
  const claves = await cache.keys()
  const sobran = claves.length - MAX_ENTRADAS
  for (let i = 0; i < sobran; i++) await cache.delete(claves[i])
}

async function guardar(cache, peticion, respuesta) {
  try {
    await cache.put(peticion, await conFecha(respuesta))
    await podar(cache)
  } catch {
    // Se acabó la cuota. Se bota el caché entero en vez de dejar el service
    // worker fallando en cada tile: se vuelven a bajar, que es molesto pero
    // no rompe nada.
    await caches.delete(CACHE)
  }
}

async function responder(evento) {
  const peticion = evento.request
  const cache = await caches.open(CACHE)
  const guardada = await cache.match(peticion)
  if (guardada && !estaVencida(guardada)) return guardada

  try {
    const respuesta = await fetch(peticion)
    // Solo respuestas 200 y con CORS de verdad.
    //
    // Nunca una respuesta opaca (type 'opaque', status 0): Chrome le cobra
    // ~7 MB de cuota a CADA una, así que con unos cientos de tiles el teléfono
    // se quedaba sin espacio y la PWA empezaba a fallar. Ya pasó una vez. Los
    // tiles se piden con crossOrigin="anonymous" desde Mapa.jsx, así que acá
    // llegan como 'cors' y esto no debería descartar nada legítimo.
    if (respuesta.status === 200 && respuesta.type !== 'opaque') {
      evento.waitUntil(guardar(cache, peticion, respuesta.clone()))
    }
    return respuesta
  } catch (error) {
    // Sin red. Una copia vencida es mejor que un cuadro gris: la foto
    // satelital de hace dos meses sigue sirviendo para ubicar un medidor.
    if (guardada) return guardada
    throw error
  }
}

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return
  let url
  try {
    url = new URL(evento.request.url)
  } catch {
    return
  }
  // Ojo: para todo lo que no sea un tile NO se llama a respondWith. Así los
  // assets de la app y las llamadas a /api ni pasan por acá.
  if (!esTile(url)) return
  evento.respondWith(responder(evento))
})
