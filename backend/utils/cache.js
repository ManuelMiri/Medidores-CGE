// utils/cache.js
// Caché simple en memoria, con tiempo de expiracion TTL, no usa ninguna
// libreria externa ni un servidor de cache aparte como Redis — para el
// tamaño de este proyecto, un map en memoria alcanza 
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