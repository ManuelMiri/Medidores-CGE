// utils/cache.js
// Caché simple en memoria, con tiempo de expiracion TTL, no usa ninguna
// libreria externa ni un servidor de cache aparte como Redis — para el
// tamaño de este proyecto, un map en memoria alcanza 
const cluster = require('cluster')

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

function borrar(clave) {
  almacen.delete(clave)
}

// La lista de ULs se cachea, y cualquier ruta que cree o borre medidores
// puede cambiarla. La clave vive acá para que todas borren la misma.
const CLAVE_ULS = 'uls:todas'

const MENSAJE = 'cache:borrar'

// Sin esto, después de importar una ruta la lista seguía sin ella durante
// el minuto de TTL, y una ruta recién eliminada seguía apareciendo.
//
// En producción hay un proceso por núcleo (index.js) y cada uno tiene SU
// almacén: borrar solo en el que atendió la petición dejaba a los demás
// sirviendo la lista vieja. Por eso el aviso sube al proceso principal, que
// lo reparte (ver reenviarInvalidaciones).
function invalidarUls() {
  borrar(CLAVE_ULS)
  if (cluster.isWorker) process.send({ tipo: MENSAJE, clave: CLAVE_ULS })
}

if (cluster.isWorker) {
  process.on('message', (m) => {
    if (m?.tipo === MENSAJE) borrar(m.clave)
  })
}

// Lo llama el proceso principal: reenvía cada invalidación a los demás
// workers (el que la mandó ya borró lo suyo).
function reenviarInvalidaciones(clusterPrimario) {
  clusterPrimario.on('message', (origen, m) => {
    if (m?.tipo !== MENSAJE) return
    for (const w of Object.values(clusterPrimario.workers)) {
      if (w && w !== origen) w.send(m)
    }
  })
}

module.exports = { obtener, guardar, borrar, CLAVE_ULS, invalidarUls, reenviarInvalidaciones }