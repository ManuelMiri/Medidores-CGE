// tests/cacheCluster.script.js
// Lo corre cache.test.js en un proceso aparte: jest no puede hacer de
// proceso principal de un cluster. Arma lo mismo que index.js en
// producción (varios workers con su propia caché) y cuenta en cuántos sigue
// viva la lista de ULs después de que UNO solo la invalida.
const cluster = require('cluster')
const cache = require('../utils/cache')

const WORKERS = 3

if (cluster.isPrimary) {
  cache.reenviarInvalidaciones(cluster)
  const listos = new Set()
  const respuestas = []
  for (let i = 0; i < WORKERS; i++) cluster.fork()

  cluster.on('message', (w, m) => {
    if (m.tipo === 'listo') {
      listos.add(w.id)
      // Recién con todos cacheados, uno solo invalida.
      if (listos.size === WORKERS) Object.values(cluster.workers)[0].send({ tipo: 'invalidar' })
    }
    if (m.tipo === 'invalidado') {
      // Un margen para que el aviso llegue a los demás antes de preguntar.
      setTimeout(() => {
        for (const x of Object.values(cluster.workers)) x.send({ tipo: 'consultar' })
      }, 200)
    }
    if (m.tipo === 'estado') {
      respuestas.push(m.cacheado)
      if (respuestas.length === WORKERS) {
        console.log(JSON.stringify({ cacheadosTrasInvalidar: respuestas.filter(Boolean).length }))
        for (const x of Object.values(cluster.workers)) x.kill()
        process.exit(0)
      }
    }
  })
  setTimeout(() => { console.log('timeout'); process.exit(1) }, 10000)
} else {
  cache.guardar(cache.CLAVE_ULS, ['UL_VIEJA'], 60)
  process.on('message', (m) => {
    if (m.tipo === 'invalidar') {
      cache.invalidarUls()
      process.send({ tipo: 'invalidado' })
    }
    if (m.tipo === 'consultar') {
      process.send({ tipo: 'estado', cacheado: cache.obtener(cache.CLAVE_ULS) !== undefined })
    }
  })
  process.send({ tipo: 'listo' })
}
