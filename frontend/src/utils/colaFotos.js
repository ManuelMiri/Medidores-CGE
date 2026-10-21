// colaFotos.js
// Fotos que esperan señal para subir.
//
// Caso real (2026-10-14): una foto sin señal dio error, no había cómo
// guardarla y el lector tenía que seguir — la foto se perdió. Ahora toda foto
// se guarda primero en el teléfono y recién después se intenta subir. Si no
// hay señal queda esperando y se sube sola.
//
// Dónde se guarda depende de dónde corre la app:
//   - en el APK, en archivos de la app (utils/archivosFotos.js), que no se
//     borran al bajar de versión el WebView (caso del 2026-10-21);
//   - en el navegador, en IndexedDB, como siempre.
// Las que el APK tenía en IndexedDB de antes se pasan solas a archivos.
//
// Nunca se descarta una foto por un error: si el servidor la rechaza queda
// marcada con el motivo, a la vista, y se puede reintentar a mano.

import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { crearAlmacenArchivos, migrarCola, unirListas } from './archivosFotos.js'

const BASE = 'fotos'
const ALMACEN = 'pendientes'
const VERSION = 1
export const EVENTO = 'fotos-pendientes'

function abrir() {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(BASE, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'idLocal' })
    }
    req.onsuccess = () => ok(req.result)
    req.onerror = () => mal(req.error)
  })
}

async function transaccion(modo, hacer) {
  const db = await abrir()
  return new Promise((ok, mal) => {
    const tx = db.transaction(ALMACEN, modo)
    const resultado = hacer(tx.objectStore(ALMACEN))
    // Se cierra al terminar: una conexión abierta bloquea el borrado de la
    // base después de pasar las fotos a archivos.
    tx.oncomplete = () => { db.close(); ok(resultado?.result ?? resultado) }
    tx.onerror = () => { db.close(); mal(tx.error) }
  })
}

const almacenIndexedDB = {
  guardar: (foto) => transaccion('readwrite', (s) => s.put(foto)),
  listar: async () => (await transaccion('readonly', (s) => s.getAll())) ?? [],
  leerImagen: async (foto) => foto.blob,
  quitar: (idLocal) => transaccion('readwrite', (s) => s.delete(idLocal)),
}

const almacenArchivos = crearAlmacenArchivos(Filesystem, Directory.Data, Encoding.UTF8)

const enArchivos = () => Capacitor.isNativePlatform()

// Cada foto de la lista dice de qué almacén salió, para que anotarle un fallo
// o sacarla vaya al mismo lado. Una foto nueva no lo dice: va al principal.
const almacenDe = (foto) =>
  foto?.origen === 'indexeddb' || !enArchivos() ? almacenIndexedDB : almacenArchivos
const sinOrigen = ({ origen: _origen, ...foto }) => foto

const avisar = () => window.dispatchEvent(new Event(EVENTO))

// ¿Quedó la base vieja? Se pregunta antes de abrirla porque abrirla la crea.
async function hayBaseVieja() {
  if (!indexedDB.databases) return true
  return (await indexedDB.databases()).some((d) => d.name === BASE)
}

// En el APK, las fotos que esperaban en IndexedDB pasan a archivos una sola
// vez. Si alguna no se pudo pasar, se reintenta en la próxima lista, y mientras
// tanto se sigue viendo y subiendo desde donde está.
let migracion = null
function migrarAArchivos() {
  if (!migracion) {
    migracion = (async () => {
      if (!(await hayBaseVieja())) return
      const { pasadas, quedaron } = await migrarCola(almacenIndexedDB, almacenArchivos)
      if (quedaron > 0) {
        migracion = null
      } else {
        // Vacía: se borra para no volver a abrirla en cada lista.
        await new Promise((ok) => {
          const req = indexedDB.deleteDatabase(BASE)
          req.onsuccess = req.onerror = req.onblocked = () => ok()
        })
      }
      if (pasadas > 0) avisar()
    })().catch(() => { migracion = null })
  }
  return migracion
}

export function nuevoIdLocal() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** { idLocal, instalacion, nombre, lat, lng, fecha, blob } */
export async function guardarPendiente(foto) {
  await almacenDe(foto).guardar(sinOrigen({ ...foto, error: null, intentos: 0 }))
  avisar()
}

/**
 * Las fotos que esperan, de la más vieja a la más nueva. En el APK vienen sin
 * `blob` (la imagen está en un archivo aparte): para tenerla, `imagenDe`.
 */
export async function listarPendientes() {
  try {
    let todas
    if (enArchivos()) {
      await migrarAArchivos()
      const deArchivos = (await almacenArchivos.listar()).map((f) => ({ ...f, origen: 'archivos' }))
      const quedaron = (await hayBaseVieja())
        ? (await almacenIndexedDB.listar()).map((f) => ({ ...f, origen: 'indexeddb' }))
        : []
      todas = unirListas(deArchivos, quedaron)
    } else {
      todas = await almacenIndexedDB.listar()
    }
    return todas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  } catch {
    return []
  }
}

/** La imagen de una foto de la cola, como Blob. */
export async function imagenDe(foto) {
  return foto.blob ?? almacenDe(foto).leerImagen(foto)
}

async function quitar(foto) {
  await almacenDe(foto).quitar(foto.idLocal)
  avisar()
}

async function anotarFallo(foto, error) {
  await almacenDe(foto).guardar(sinOrigen({ ...foto, error, intentos: (foto.intentos ?? 0) + 1 }))
  avisar()
}

/**
 * Sin respuesta del servidor es la red: reintentar sola tiene sentido.
 * Con respuesta, depende: un 5xx o un 429 pueden pasar, y un 401 también (la
 * sesión venció y se arregla al volver a entrar). Otro 4xx (medidor que ya no
 * existe, sin acceso a la UL) no se arregla reintentando cada minuto.
 */
export function esFalloPasajero(err) {
  const estado = err?.response?.status
  if (!estado) return true
  return estado >= 500 || estado === 401 || estado === 408 || estado === 429
}

/** Sube una foto de la cola. Devuelve el medidor actualizado. */
export async function subirPendiente(foto, api) {
  let imagen
  try {
    imagen = await imagenDe(foto)
  } catch {
    // Sin esta marca parecería un error de red (no hay `response`) y frenaría
    // la cola entera con un "Sin señal" que no es cierto.
    throw Object.assign(new Error('No se pudo leer la imagen en el teléfono'), { sinImagen: true })
  }
  const datos = new FormData()
  datos.append('foto', imagen, `${foto.idLocal}.jpg`)
  datos.append('nombre', foto.nombre)
  datos.append('lat', foto.lat)
  datos.append('lng', foto.lng)
  datos.append('fecha', foto.fecha)
  datos.append('idLocal', foto.idLocal)
  const { data } = await api.post(`/medidores/${encodeURIComponent(foto.instalacion)}/fotos`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  await quitar(foto)
  return data
}

/**
 * Intenta subir todo lo que espera. `manual` reintenta también las que el
 * servidor rechazó. Si una falla por red se corta ahí: sin señal, las demás
 * también van a fallar.
 */
export async function subirTodas(api, { manual = false } = {}) {
  let subidas = 0
  for (const foto of await listarPendientes()) {
    if (foto.error && !foto.errorPasajero && !manual) continue
    try {
      await subirPendiente(foto, api)
      subidas++
    } catch (err) {
      if (err?.sinImagen) {
        await anotarFallo({ ...foto, errorPasajero: false }, err.message)
        continue
      }
      const pasajero = esFalloPasajero(err)
      await anotarFallo({ ...foto, errorPasajero: pasajero },
        err?.response?.data?.error ?? (err?.response ? `Error ${err.response.status}` : 'Sin señal'))
      if (!err?.response) break
    }
  }
  return subidas
}
