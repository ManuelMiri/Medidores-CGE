// toesStore.js
// Guarda en el teléfono lo que se deduce de los logs de TOES. Nada de esto
// sale del dispositivo: el README prohíbe subir el log o su contenido a
// cualquier servidor, así que no hay endpoint ni sincronización.
//
// Se guarda solo lo necesario para el mapa: UL, ciclo, instalación, medidor,
// clave, si hubo lectura y la fecha. Ni direcciones, ni lecturas, ni
// coordenadas del cliente.
//
// Wrapper propio sobre IndexedDB (~60 líneas) en vez de una dependencia,
// porque el uso es un simple clave/valor y el repo ya tiene utilidades
// escritas a mano con este estilo.

const BASE = 'toes'
const ALMACEN = 'estado'
const VERSION = 1

function abrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function leer(clave) {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const req = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(clave)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function escribir(clave, valor) {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put(valor, clave)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// El estado vive en memoria como Map; IndexedDB no guarda Map directo de
// forma cómoda para inspeccionar, así que se serializa a array de pares.
export async function cargarEstado() {
  try {
    const pares = await leer('estado')
    return new Map(Array.isArray(pares) ? pares : [])
  } catch {
    return new Map()
  }
}

export async function guardarEstado(estado) {
  try {
    await escribir('estado', [...estado.entries()])
  } catch {
    // si el almacenamiento falla (modo privado, sin espacio) la app sigue
    // funcionando: el estado se reconstruye releyendo los logs de /TOES.
  }
}

export async function cargarCierres() {
  try {
    return (await leer('cierres')) ?? []
  } catch {
    return []
  }
}

export async function guardarCierres(cierres) {
  try { await escribir('cierres', cierres) } catch { /* ver nota arriba */ }
}

// Progreso por archivo: { [nombre]: { tamano, cursor, unidadOffset, completo } }
//
// `unidadOffset` se guarda junto al cursor a propósito. Si cambia la forma de
// leer (caracteres vs bytes), el cursor viejo deja de ser válido: el log real
// tiene 761.639 bytes pero 761.541 caracteres — 98 de diferencia por los
// acentos — y mezclar las dos unidades desincroniza la lectura y puede cortar
// un carácter en dos, rompiendo el JSON.parse del bloque siguiente.
export async function cargarArchivos() {
  try {
    return (await leer('archivos')) ?? {}
  } catch {
    return {}
  }
}

export async function guardarArchivos(archivos) {
  try { await escribir('archivos', archivos) } catch { /* ver nota arriba */ }
}

// Ciclos que el usuario descartó a mano con "Nuevo ciclo": { [ul]: ciclo }
export async function cargarCiclosDescartados() {
  try {
    return (await leer('ciclosDescartados')) ?? {}
  } catch {
    return {}
  }
}

export async function guardarCiclosDescartados(mapa) {
  try { await escribir('ciclosDescartados', mapa) } catch { /* ver nota arriba */ }
}

// Referencia de la carpeta /TOES concedida por SAF (tree URI). Es lo único
// que, si se pierde, obliga al lector a volver a elegir la carpeta a mano.
export async function cargarCarpeta() {
  try { return (await leer('carpeta')) ?? null } catch { return null }
}

export async function guardarCarpeta(ref) {
  try { await escribir('carpeta', ref) } catch { /* ver nota arriba */ }
}

export async function borrarTodo() {
  try {
    const db = await abrir()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ALMACEN, 'readwrite')
      tx.objectStore(ALMACEN).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ver nota arriba */ }
}
