// precargaTiles.js
// El lado de la página de "Descargar esta ruta": le pide al service worker que
// baje los cuadros del mapa de una UL y le va contando el avance.
//
// Quién hace qué, y por qué está partido así:
//   - tilesDeRuta.js decide QUÉ cuadros (lógica pura, con tests)
//   - este módulo arma las URLs y habla con el service worker
//   - sw-tiles.js los baja y los guarda en un caché que no se poda
//
// Los baja el service worker y no la página porque el destino es el caché de
// rutas. Si los pidiera la página, pasarían por el handler de fetch normal y
// terminarían en el caché podable — que es justo el que una jornada larga
// mirando el mapa termina vaciando.

import { Capacitor } from '@capacitor/core'
import { tilesDeRuta, urlsDeTiles, mbEstimados } from './tilesDeRuta'
import { urlsDeCapa } from '../config/capasMapa'

/**
 * Si se puede precargar acá.
 *
 * Solo en el APK: en el navegador el service worker lo genera vite-plugin-pwa
 * y no entiende estos mensajes. Tampoco hace falta — precargar una ruta es
 * para salir a terreno sin señal, y a terreno se va con el teléfono.
 */
export function hayPrecarga() {
  return Capacitor.isNativePlatform() && 'serviceWorker' in navigator
}

/** Una conversación con el service worker por un canal propio. El avance llega
 *  por el mismo puerto; se resuelve con el mensaje que trae `fin`. */
async function hablarConElSw(mensaje, onAvance) {
  if (!hayPrecarga()) throw new Error('La precarga solo está disponible en el APK')

  const registro = await navigator.serviceWorker.ready
  const sw = registro.active ?? navigator.serviceWorker.controller
  if (!sw) throw new Error('El service worker de tiles todavía no está activo')

  return new Promise((resolver, rechazar) => {
    const canal = new MessageChannel()
    canal.port1.onmessage = (e) => {
      const d = e.data ?? {}
      if (!d.fin) {
        onAvance?.(d)
        return
      }
      canal.port1.close()
      if (d.error) rechazar(new Error(d.error))
      else resolver(d)
    }
    sw.postMessage(mensaje, [canal.port2])
  })
}

/**
 * Qué habría que bajar para una UL, sin bajar nada. Es para poder preguntarle
 * al lector antes: una ruta son miles de cuadros y decenas de MB, y eso no se
 * empieza sin avisar.
 */
export function presupuestoDeRuta(medidores, capa, opciones) {
  const { tiles, truncado, total } = tilesDeRuta(medidores, opciones)
  const capas = urlsDeCapa(capa)
  const cantidad = tiles.length * capas.length
  return {
    tiles,
    capas,
    cantidad,
    mb: mbEstimados(cantidad),
    truncado,
    totalSinTope: total * capas.length,
  }
}

/**
 * Baja los cuadros de una ruta. `onAvance` recibe { hechas, fallidas, total }.
 *
 * Devuelve { hechas, fallidas, total, sinEspacio }. `sinEspacio` es que se
 * acabó la cuota del teléfono: lo que alcanzó a bajarse queda intacto y sirve,
 * simplemente no está completo.
 */
export async function descargarRuta(medidores, capa, onAvance, opciones) {
  const { tiles, capas } = presupuestoDeRuta(medidores, capa, opciones)
  const urls = capas.flatMap((plantilla) => urlsDeTiles(tiles, plantilla))
  if (!urls.length) return { hechas: 0, fallidas: 0, total: 0, sinEspacio: false }
  return hablarConElSw({ tipo: 'precargar', urls }, onAvance)
}

/** Cuántos cuadros hay guardados de rutas descargadas. */
export async function tilesDescargados() {
  const r = await hablarConElSw({ tipo: 'estadoRutas' })
  return r.tiles ?? 0
}

/** Borra todo lo descargado a propósito. El caché normal del mapa no se toca. */
export async function borrarDescargas() {
  const r = await hablarConElSw({ tipo: 'borrarRutas' })
  return Boolean(r.borrado)
}
