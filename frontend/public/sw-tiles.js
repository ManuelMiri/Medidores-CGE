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
//
// Hay DOS cachés de tiles, y la diferencia importa:
//
//   CACHE       lo que se fue guardando solo, al mirar el mapa. Tiene tope y
//               se poda en FIFO.
//   CACHE_RUTAS lo que el lector pidió bajar a propósito con "Descargar esta
//               ruta". NO se poda: si se podara, una jornada larga mirando el
//               mapa terminaría botando justamente la ruta que se bajó con
//               wifi para poder trabajar sin señal, que es todo el punto.

const CACHE = 'tiles-nativo-v1'
const CACHE_RUTAS = 'tiles-rutas-v1'
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

  // Primero lo que el lector bajó a propósito. Es lo que tiene que estar sí o
  // sí cuando no hay señal, y además ahorra mirar el caché grande.
  const rutas = await caches.open(CACHE_RUTAS)
  const deRuta = await rutas.match(peticion)
  if (deRuta && !estaVencida(deRuta)) return deRuta

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
    if (deRuta) return deRuta
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

// ---------------------------------------------------------------- precarga
//
// "Descargar esta ruta": el lector baja con wifi los cuadros de su UL y en
// terreno el mapa ya no espera a Esri. Qué tiles son lo decide la página
// (utils/tilesDeRuta.js, que está testeado); acá solo se bajan y se guardan.
//
// Lo hace el service worker y no la página porque el destino es CACHE_RUTAS:
// si la página hiciera los fetch, pasarían por el handler de arriba y
// terminarían en el caché podable, que es justo lo que no se quiere.

/** Cuántos tiles se piden a la vez. Bajo a propósito: la idea es no castigar
 *  ni a Esri ni al teléfono, y una precarga puede ser de miles de cuadros. */
const EN_PARALELO = 6
/** Cada cuántos tiles se avisa del avance. */
const AVISAR_CADA = 20

async function precargar(urls, avisar) {
  const rutas = await caches.open(CACHE_RUTAS)
  const yaEstaban = await caches.open(CACHE)

  let hechas = 0
  let fallidas = 0
  let sinEspacio = false
  let i = 0

  async function unTrabajador() {
    while (i < urls.length && !sinEspacio) {
      const url = urls[i++]
      try {
        // Si ya está bajado, no se vuelve a pedir. Vale tanto para repetir la
        // descarga de una ruta como para los cuadros que el lector ya miró.
        const peticion = new Request(url, { mode: 'cors', credentials: 'omit' })
        if (await rutas.match(peticion)) { hechas++; continue }

        const deAntes = await yaEstaban.match(peticion)
        if (deAntes && !estaVencida(deAntes)) {
          // Estaba en el caché podable: se asciende al de rutas en vez de
          // volver a bajarlo, y así deja de estar expuesto a la poda.
          await rutas.put(peticion, deAntes)
          hechas++
          continue
        }

        const respuesta = await fetch(peticion)
        if (respuesta.status === 200 && respuesta.type !== 'opaque') {
          await rutas.put(peticion, await conFecha(respuesta))
          hechas++
        } else {
          fallidas++
        }
      } catch (err) {
        // QuotaExceededError no se arregla reintentando y no tiene sentido
        // seguir pidiendo miles de tiles que no van a entrar: se corta y se
        // avisa, con lo que alcanzó a bajarse intacto.
        if (err?.name === 'QuotaExceededError') {
          sinEspacio = true
          break
        }
        fallidas++
      }

      if ((hechas + fallidas) % AVISAR_CADA === 0) {
        avisar({ hechas, fallidas, total: urls.length })
      }
    }
  }

  await Promise.all(Array.from({ length: EN_PARALELO }, unTrabajador))
  // `fin` es lo que distingue un mensaje de avance del ultimo: la pagina
  // resuelve su promesa con el que lo traiga. Sin una marca explicita habria
  // que adivinar por la forma del objeto, que se rompe al agregar un campo.
  return { hechas, fallidas, total: urls.length, sinEspacio, fin: true }
}

async function tilesGuardadosDeRutas() {
  const rutas = await caches.open(CACHE_RUTAS)
  return (await rutas.keys()).length
}

self.addEventListener('message', (evento) => {
  const datos = evento.data
  if (!datos || typeof datos !== 'object') return
  // El puerto lo manda la página con un MessageChannel: es por donde vuelven
  // el avance y el resultado.
  const puerto = evento.ports?.[0]
  const responderA = (msg) => puerto?.postMessage(msg)

  if (datos.tipo === 'precargar') {
    const urls = Array.isArray(datos.urls) ? datos.urls : []
    evento.waitUntil(
      precargar(urls, responderA)
        .then(responderA)
        .catch((err) => responderA({ fin: true, error: String(err?.message ?? err) }))
    )
    return
  }

  if (datos.tipo === 'estadoRutas') {
    evento.waitUntil(
      tilesGuardadosDeRutas()
        .then((tiles) => responderA({ tiles, fin: true }))
        .catch(() => responderA({ tiles: 0, fin: true }))
    )
    return
  }

  if (datos.tipo === 'borrarRutas') {
    evento.waitUntil(
      caches.delete(CACHE_RUTAS)
        .then(() => responderA({ borrado: true, fin: true }))
        .catch(() => responderA({ borrado: false, fin: true }))
    )
  }
})
