// utils/cache.js
// Caché simple en memoria, con tiempo de expiración (TTL). No usa ninguna
// librería externa ni un servidor de caché aparte (como Redis) — para el
// tamaño de este proyecto, un Map en memoria alcanza y es fácil de
// entender: guardamos un valor y la hora en la que "vence".
const almacen = new Map()

function obtener(clave) {
  const entrada = almacen.get(clave)
  if (!entrada) return undefined

  if (Date.now() > entrada.expiraEn) {
    almacen.delete(clave)
    return undefined
  }

  return entrada.valor
}

function guardar(clave, valor, ttlSegundos = 60) {
  almacen.set(clave, {
    valor,
    expiraEn: Date.now() + ttlSegundos * 1000,
  })
}

module.exports = { obtener, guardar }