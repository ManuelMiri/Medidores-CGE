// tilesDeRuta.js
// Qué cuadros del mapa hay que bajar para que una ruta se pueda recorrer sin
// esperar a la red. Lógica pura: no toca el DOM, no pide nada, solo calcula.
//
// El problema que resuelve: en el Maule rural la foto satelital se baja contra
// Esri en el momento, con la señal que haya, y `updateWhenIdle` encima no pide
// un tile hasta que sueltas el mapa. El resultado es que arrastrar a una zona
// nueva muestra cuadros vacíos. Precargar la ruta con wifi, antes de salir,
// convierte eso en lectura de disco.
//
// REGLA DE PRIVACIDAD: las coordenadas salen de `medidores[].ubicacion`, o sea
// de la base, y NUNCA del log de TOES. No es un detalle cosmético: pedir un
// tile le manda esa coordenada a Esri, y las del log son datos de clientes que
// no salen del teléfono. Las de la base ya viajan hoy en cada arrastre del
// mapa, así que por ese lado no se agrega nada.

/** Tamaño típico de un tile, para estimar cuánto va a pesar la descarga.
 *  Medido sobre el caché real del teléfono: los JPG de Esri andan en 15-25 KB
 *  y los PNG de OSM algo menos. Es una estimación y se muestra como tal. */
export const KB_POR_TILE = 20

/**
 * lat/lng a coordenadas de tile del esquema slippy map (el que usan OSM, Esri
 * y todos). Devuelve enteros ya recortados al rango válido del zoom.
 */
export function tileDe(lat, lng, z) {
  const n = 2 ** z
  // La latitud se recorta a los límites de Web Mercator: más allá la
  // proyección diverge y el tile daría NaN o un número enorme.
  const latSegura = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const rad = (latSegura * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  }
}

/**
 * El rectángulo que contiene a todos los medidores con ubicación, o null si
 * ninguno la tiene. Mismo criterio que el resto del repo: un medidor sin
 * coordenadas se salta, no rompe nada.
 */
export function bboxDe(medidores) {
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity
  let hay = false

  for (const m of medidores) {
    const c = m.ubicacion?.coordinates
    if (!c) continue
    const [lng, lat] = c
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    hay = true
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }

  return hay ? { minLat, maxLat, minLng, maxLng } : null
}

/** Clave de un tile, para deduplicar entre zooms y entre medidores. */
const clave = (z, x, y) => z + '/' + x + '/' + y

/** Todos los tiles que cubren un rectángulo en un zoom dado. */
export function tilesDeBbox(bbox, z, salida = new Map()) {
  if (!bbox) return salida
  // Ojo con el eje Y: en el esquema de tiles crece hacia el SUR, así que la
  // latitud máxima da el y mínimo. Invertirlo es el error clásico acá y se
  // manifiesta bajando la zona equivocada, sin ningún error.
  const arribaIzq = tileDe(bbox.maxLat, bbox.minLng, z)
  const abajoDer = tileDe(bbox.minLat, bbox.maxLng, z)

  for (let x = arribaIzq.x; x <= abajoDer.x; x++) {
    for (let y = arribaIzq.y; y <= abajoDer.y; y++) {
      salida.set(clave(z, x, y), { z, x, y })
    }
  }
  return salida
}

/**
 * Los tiles alrededor de cada medidor: el suyo más un anillo de `anillo` tiles
 * en cada dirección. Es lo que de verdad se mira en terreno — el lector se
 * mueve de un medidor al siguiente, no recorre el rectángulo completo.
 */
export function tilesDePuntos(medidores, z, anillo, salida = new Map()) {
  const n = 2 ** z
  for (const m of medidores) {
    const c = m.ubicacion?.coordinates
    if (!c) continue
    const [lng, lat] = c
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    const t = tileDe(lat, lng, z)
    for (let dx = -anillo; dx <= anillo; dx++) {
      for (let dy = -anillo; dy <= anillo; dy++) {
        const x = t.x + dx
        const y = t.y + dy
        if (x < 0 || y < 0 || x >= n || y >= n) continue
        salida.set(clave(z, x, y), { z, x, y })
      }
    }
  }
  return salida
}

/**
 * Lo que hay que bajar para una ruta.
 *
 * Son dos estrategias distintas según el zoom, y la razón es la cuenta: a z18,
 * en el Maule, un tile cubre unos 124 m de lado. El rectángulo de una UL puede
 * medir 10 km, o sea más de 6.000 tiles en ese solo nivel — una descarga que
 * nadie va a esperar y que además es casi toda campo vacío.
 *
 *   - zooms bajos (hasta `zBbox`): el rectángulo completo. Son pocos tiles y
 *     dan la vista general, la que se usa para ubicarse.
 *   - zooms altos: solo la vecindad de cada medidor, que es donde el lector
 *     mira de verdad.
 */
export function tilesDeRuta(medidores, opciones = {}) {
  const {
    zMin = 13,
    zBbox = 15,
    zMax = 18,
    anillo = 1,
    tope = 6000,
  } = opciones

  const mapa = new Map()
  const bbox = bboxDe(medidores)

  for (let z = zMin; z <= zMax; z++) {
    if (z <= zBbox) tilesDeBbox(bbox, z, mapa)
    else tilesDePuntos(medidores, z, anillo, mapa)
  }

  const todos = [...mapa.values()]
  // Se ordena por zoom para que, si se corta por el tope, lo que quede sea la
  // vista general completa y no un z18 a medias: un mapa general sirve, un
  // detalle con agujeros no.
  todos.sort((a, b) => a.z - b.z)

  return {
    tiles: todos.slice(0, tope),
    truncado: todos.length > tope,
    total: todos.length,
  }
}

/**
 * Pasa los tiles a URLs concretas con la plantilla de Leaflet. Sirve igual para
 * OSM ({z}/{x}/{y}) que para Esri ({z}/{y}/{x}), porque sustituye por nombre y
 * no por posición.
 */
export function urlsDeTiles(tiles, plantilla) {
  return tiles.map((t) =>
    plantilla
      .replaceAll('{z}', String(t.z))
      .replaceAll('{x}', String(t.x))
      .replaceAll('{y}', String(t.y))
  )
}

/** Peso estimado de una descarga, en MB, con un decimal. */
export function mbEstimados(cantidadDeTiles) {
  return Math.round((cantidadDeTiles * KB_POR_TILE) / 102.4) / 10
}
