// colaFotos.js
// Fotos que esperan señal para subir.
//
// Caso real (2026-10-14): una foto sin señal dio error, no había cómo
// guardarla y el lector tenía que seguir — la foto se perdió. Ahora toda foto
// se guarda primero acá (IndexedDB, en el teléfono) y recién después se
// intenta subir. Si no hay señal queda esperando y se sube sola.
//
// Nunca se descarta una foto por un error: si el servidor la rechaza queda
// marcada con el motivo, a la vista, y se puede reintentar a mano.

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
    tx.oncomplete = () => ok(resultado?.result ?? resultado)
    tx.onerror = () => mal(tx.error)
  })
}

const avisar = () => window.dispatchEvent(new Event(EVENTO))

export function nuevoIdLocal() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** { idLocal, instalacion, nombre, lat, lng, fecha, blob } */
export async function guardarPendiente(foto) {
  await transaccion('readwrite', (s) => s.put({ ...foto, error: null, intentos: 0 }))
  avisar()
}

export async function listarPendientes() {
  try {
    const todas = await transaccion('readonly', (s) => s.getAll())
    return (todas ?? []).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  } catch {
    return []
  }
}

async function quitar(idLocal) {
  await transaccion('readwrite', (s) => s.delete(idLocal))
  avisar()
}

async function anotarFallo(foto, error) {
  await transaccion('readwrite', (s) => s.put({ ...foto, error, intentos: (foto.intentos ?? 0) + 1 }))
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
  const datos = new FormData()
  datos.append('foto', foto.blob, `${foto.idLocal}.jpg`)
  datos.append('nombre', foto.nombre)
  datos.append('lat', foto.lat)
  datos.append('lng', foto.lng)
  datos.append('fecha', foto.fecha)
  datos.append('idLocal', foto.idLocal)
  const { data } = await api.post(`/medidores/${encodeURIComponent(foto.instalacion)}/fotos`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  await quitar(foto.idLocal)
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
      const pasajero = esFalloPasajero(err)
      await anotarFallo({ ...foto, errorPasajero: pasajero },
        err?.response?.data?.error ?? (err?.response ? `Error ${err.response.status}` : 'Sin señal'))
      if (!err?.response) break
    }
  }
  return subidas
}
