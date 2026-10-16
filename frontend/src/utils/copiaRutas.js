// copiaRutas.js
// Copia en el teléfono de la lista de ULs y de los medidores de cada UL, para
// poder abrir la app sin señal (ver utils/cargaSinSenal.js, caso del
// 2026-10-16).
//
// IndexedDB y no localStorage: una UL de 1.000 servicios con su historial pesa
// del orden de un MB, y localStorage se acaba en ~5 MB.
//
// La clave lleva el usuario: en un teléfono compartido, el que entra después
// no ve las rutas del anterior. Y "Salir" la borra entera (AuthContext).
//
// Son datos de la base (lo mismo que ya muestra el mapa), no del log de TOES:
// el log sigue sin salir de su almacén propio.

const BASE = 'copiaRutas'
const ALMACEN = 'datos'

// Sin `version` abre la que haya (y si la base no existe, la crea en la 1).
function abrirVersion(version) {
  return new Promise((ok, mal) => {
    const req = version ? indexedDB.open(BASE, version) : indexedDB.open(BASE)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN)
    }
    req.onsuccess = () => {
      const db = req.result
      // Si otra pestaña o una versión nueva necesita la base, se suelta: una
      // conexión abierta bloquea el cambio de versión y el borrado.
      db.onversionchange = () => { db.close(); conexion = null }
      ok(db)
    }
    req.onerror = () => mal(req.error)
  })
}

// Una sola conexión para toda la sesión, en vez de una por lectura.
let conexion = null

async function abrir() {
  if (!conexion) {
    conexion = (async () => {
      // Se abre en la versión que tenga, no en una fija: después de una
      // reparación queda en la 2, y pedir la 1 daría VersionError.
      let db = await abrirVersion()
      // La base puede existir SIN el almacén: abrirla sin versión (un
      // indexedDB.open('copiaRutas') desde DevTools, pasó el 2026-10-16) la
      // crea vacía en la versión 1, y onupgradeneeded no vuelve a correr. Sin
      // esto la copia no se guardaría nunca, sin ningún error a la vista.
      if (!db.objectStoreNames.contains(ALMACEN)) {
        const siguiente = db.version + 1
        db.close()
        db = await abrirVersion(siguiente)
      }
      return db
    })().catch((e) => { conexion = null; throw e })
  }
  return conexion
}

async function transaccion(modo, hacer) {
  const db = await abrir()
  return new Promise((ok, mal) => {
    const tx = db.transaction(ALMACEN, modo)
    const req = hacer(tx.objectStore(ALMACEN))
    tx.oncomplete = () => ok(req?.result)
    tx.onerror = () => mal(tx.error)
  })
}

const claveUls = (usuario) => `uls:${usuario}`
const claveMedidores = (usuario, ul) => `medidores:${usuario}:${ul}`

// Leer y guardar nunca tiran: sin almacenamiento (modo privado, sin espacio)
// la app sigue funcionando como antes, solo que sin copia.
async function leer(clave) {
  try { return (await transaccion('readonly', (s) => s.get(clave))) ?? null } catch { return null }
}

async function guardar(clave, valor) {
  try { await transaccion('readwrite', (s) => s.put(valor, clave)) } catch { /* sin copia, da igual */ }
}

/** @returns { uls, fecha } | null */
export const leerCopiaUls = (usuario) => leer(claveUls(usuario))
export const guardarCopiaUls = (usuario, uls) =>
  guardar(claveUls(usuario), { uls, fecha: new Date().toISOString() })

/** @returns { medidores, fecha } | null */
export const leerCopiaMedidores = (usuario, ul) => leer(claveMedidores(usuario, ul))
export const guardarCopiaMedidores = (usuario, ul, medidores) =>
  guardar(claveMedidores(usuario, ul), { medidores, fecha: new Date().toISOString() })

/** Al salir: no deja datos de clientes de esta sesión en el teléfono. */
export async function borrarCopias() {
  try { await transaccion('readwrite', (s) => s.clear()) } catch { /* nada que borrar */ }
}
