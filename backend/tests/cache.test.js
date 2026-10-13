// tests/cache.test.js
// En producción el backend corre en cluster (index.js): cada proceso tiene
// su propia caché. Invalidar en uno solo dejaba a los otros sirviendo la
// lista de ULs vieja durante el minuto de TTL.
const { execFileSync } = require('child_process')
const path = require('path')

test('invalidar la lista de ULs en un worker la borra en todos', () => {
  const salida = execFileSync(process.execPath, [path.join(__dirname, 'cacheCluster.script.js')], {
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(JSON.parse(salida.trim().split('\n').pop())).toEqual({ cacheadosTrasInvalidar: 0 })
})
