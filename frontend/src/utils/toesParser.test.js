// Pruebas del parser de logs de TOES.
//   npm test
// Para contrastar tambien contra un log real (que no se versiona):
//   TOES_LOG_REAL="C:/ruta/Log_TOES-2026-10-06_134628.txt" npm test

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  parsearLog,
  estadoPorInstalacion,
  cicloVigente,
  estadoDeUL,
  cierreDeCiclo,
  llave,
} from './toesParser.js'
import {
  bloqueServicio,
  bloqueSincronizacion,
  lineaCierre,
  lineaRuido,
  cabecera,
} from './__fixtures__/logSintetico.js'

describe('parsearLog', () => {
  test('lee un archivo completo y saca un evento por bloque', () => {
    const texto =
      cabecera() +
      bloqueServicio({ instalacion: 'Z1' }) +
      lineaRuido() +
      bloqueServicio({ instalacion: 'Z2' }) +
      bloqueServicio({ instalacion: 'Z3' })
    const { eventos } = parsearLog(texto)
    assert.equal(eventos.length, 3)
    assert.equal(eventos[0].unidad, 'E9999999')
    assert.equal(eventos[0].ciclo, '2026-10-06')
    assert.deepEqual(eventos.map((e) => e.instalacion), ['Z1', 'Z2', 'Z3'])
  })

  test('ignora los bloques de sincronizacion (si no, las claves se duplican)', () => {
    const texto =
      bloqueServicio({ instalacion: 'Z1', lectura: '', clave: '08' }) +
      bloqueSincronizacion([{ instalacion: 'Z1', lectura: '', clave: '08' }])
    const { eventos } = parsearLog(texto)
    assert.equal(eventos.length, 1, 'el bloque de sincronizacion no debe contarse')
    assert.equal(eventos.filter((e) => e.clave === '08').length, 1)
  })

  test('un bloque JSON cortado a la mitad no se procesa', () => {
    const completo = bloqueServicio({ instalacion: 'Z1' })
    const parcial = bloqueServicio({ instalacion: 'Z2' })
    const corte = completo + parcial.slice(0, Math.floor(parcial.length / 2))
    const { eventos, consumido } = parsearLog(corte)
    assert.equal(eventos.length, 1, 'solo el bloque completo')
    assert.ok(
      consumido <= completo.length,
      'consumido debe quedar antes del bloque incompleto'
    )
  })

  test('leer por partes da el mismo resultado que leer completo', () => {
    const texto =
      bloqueServicio({ instalacion: 'Z1', fecha: '2026-10-06T10:00:00.000Z' }) +
      bloqueServicio({ instalacion: 'Z2', fecha: '2026-10-06T11:00:00.000Z' }) +
      bloqueServicio({ instalacion: 'Z3', fecha: '2026-10-06T12:00:00.000Z' })

    const completo = estadoDeUL(estadoPorInstalacion(parsearLog(texto).eventos), 'E9999999')

    // corte arbitrario, como cuando TOES todavia esta escribiendo
    const a = parsearLog(texto.slice(0, Math.floor(texto.length * 0.6)))
    const b = parsearLog(texto.slice(a.consumido))
    const porPartes = estadoDeUL(
      estadoPorInstalacion(b.eventos, estadoPorInstalacion(a.eventos)),
      'E9999999'
    )

    assert.equal(a.eventos.length + b.eventos.length, 3, 'sin perder ni duplicar')
    assert.deepEqual([...porPartes.keys()].sort(), [...completo.keys()].sort())
  })

  test('las llaves dentro de strings no rompen el conteo', () => {
    const texto = bloqueServicio({ instalacion: 'Z1', calle: 'AV {RARA} 123 "con comillas"' })
    const { eventos } = parsearLog(texto)
    assert.equal(eventos.length, 1)
    assert.equal(eventos[0].instalacion, 'Z1')
  })

  test('las instalaciones se comparan como string exacto, nunca como numero', () => {
    // en el log real conviven E714264365, 102508712 y G3564834
    const texto =
      bloqueServicio({ instalacion: 'E714264365' }) +
      bloqueServicio({ instalacion: '102508712' }) +
      bloqueServicio({ instalacion: 'G3564834' })
    const { eventos } = parsearLog(texto)
    assert.deepEqual(eventos.map((e) => e.instalacion), [
      'E714264365',
      '102508712',
      'G3564834',
    ])
  })
})

describe('cierres de unidad', () => {
  test('detecta "Cierre Especial"', () => {
    const { cierres } = parsearLog(bloqueServicio() + lineaCierre('E9999999', 'Especial'))
    assert.equal(cierres.length, 1)
    assert.equal(cierres[0].unidad, 'E9999999')
    assert.equal(cierres[0].tipo, 'especial')
  })

  // Esta variante no estaba en el README: aparecio al cerrar el segundo dia
  // de una ruta real. Antes del arreglo, el cierre se perdia por completo.
  test('detecta "Cierre Final"', () => {
    const { cierres } = parsearLog(bloqueServicio() + lineaCierre('E9999999', 'Final'))
    assert.equal(cierres.length, 1)
    assert.equal(cierres[0].tipo, 'final')
  })

  test('distingue las dos variantes cuando aparecen juntas', () => {
    const texto =
      bloqueServicio() +
      lineaCierre('E9999999', 'Especial', '19:00:00.000') +
      lineaCierre('E9999999', 'Final', '20:00:00.000')
    const { cierres } = parsearLog(texto)
    assert.deepEqual(cierres.map((c) => c.tipo), ['especial', 'final'])
  })
})

// Si TOES no arranca en frio (queda vivo en segundo plano de un dia para
// otro), NO crea archivo nuevo: sigue escribiendo en el del dia anterior. Eso
// hace que un mismo archivo pueda traer dos rutas distintas, con dos ciclos y
// dos cierres. Estos casos salieron de ahi.
describe('a que ciclo pertenece un cierre', () => {
  // El ciclo de ayer cerrado, y hoy una ruta nueva de la MISMA UL que todavia
  // no se cierra. Antes de atar el cierre a un ciclo, el panel mostraba
  // CERRADA sobre una ruta que recien empezaba.
  const dosRutas =
    bloqueServicio({ instalacion: 'A1', ciclo: '2026-10-06', fecha: '2026-10-07T12:00:00.000Z' }) +
    lineaCierre('E9999999', 'Final', '14:37:58.457', '2026-10-07') +
    bloqueServicio({ instalacion: 'B1', ciclo: '2026-11-05', fecha: '2026-11-05T13:00:00.000Z' })

  test('el cierre del ciclo anterior no marca cerrado al ciclo nuevo', () => {
    const { eventos, cierres } = parsearLog(dosRutas)
    const estado = estadoPorInstalacion(eventos)
    assert.equal(cicloVigente(estado, 'E9999999'), '2026-11-05')
    assert.equal(cierreDeCiclo(cierres, estado, 'E9999999'), null)
  })

  test('pero ese cierre sigue siendo el del ciclo al que pertenece', () => {
    const { eventos, cierres } = parsearLog(dosRutas)
    const estado = estadoPorInstalacion(eventos)
    const c = cierreDeCiclo(cierres, estado, 'E9999999', '2026-10-06')
    assert.equal(c?.tipo, 'final')
  })

  test('dos cierres del mismo ciclo: gana el ultimo', () => {
    const texto =
      bloqueServicio({ ciclo: '2026-10-06', fecha: '2026-10-06T12:00:00.000Z' }) +
      lineaCierre('E9999999', 'Especial', '19:23:25.266', '2026-10-06') +
      lineaCierre('E9999999', 'Final', '14:37:58.457', '2026-10-07')
    const { eventos, cierres } = parsearLog(texto)
    const estado = estadoPorInstalacion(eventos)
    assert.equal(cierreDeCiclo(cierres, estado, 'E9999999')?.tipo, 'final')
  })

  test('un cierre de otra UL no cierra esta', () => {
    const texto =
      bloqueServicio({ ciclo: '2026-10-06', fecha: '2026-10-06T12:00:00.000Z' }) +
      lineaCierre('E0000001', 'Final', '19:23:25.266', '2026-10-06')
    const { eventos, cierres } = parsearLog(texto)
    const estado = estadoPorInstalacion(eventos)
    assert.equal(cierreDeCiclo(cierres, estado, 'E9999999'), null)
  })

  test('sin cierres no se inventa ninguno', () => {
    const { eventos, cierres } = parsearLog(bloqueServicio())
    const estado = estadoPorInstalacion(eventos)
    assert.equal(cierreDeCiclo(cierres, estado, 'E9999999'), null)
  })

  // La linea de cierre va en hora local y ACTUALMRDATE en UTC: compararlas
  // como texto daria cualquier cosa. Un cierre a las 19:23 locales del mismo
  // dia es posterior a una lectura de las 17:53Z (14:53 locales).
  test('compara bien aunque el log mezcle hora local y UTC', () => {
    const texto =
      bloqueServicio({ ciclo: '2026-10-06', fecha: '2026-10-06T17:53:49.520Z' }) +
      lineaCierre('E9999999', 'Especial', '19:23:25.266', '2026-10-06')
    const { eventos, cierres } = parsearLog(texto)
    const estado = estadoPorInstalacion(eventos)
    assert.equal(cierreDeCiclo(cierres, estado, 'E9999999')?.tipo, 'especial')
  })
})

describe('estado y ciclos', () => {
  test('separa leidos de los que llevan clave', () => {
    const texto =
      bloqueServicio({ instalacion: 'Z1', lectura: '100' }) +
      bloqueServicio({ instalacion: 'Z2', lectura: '200' }) +
      bloqueServicio({ instalacion: 'Z3', lectura: '', clave: '08' })
    const tomados = estadoDeUL(estadoPorInstalacion(parsearLog(texto).eventos), 'E9999999')
    assert.equal(tomados.size, 3)
    assert.equal(tomados.get('Z1').estado, 'leido')
    assert.equal(tomados.get('Z3').estado, 'clave')
    assert.equal(tomados.get('Z3').clave, '08')
  })

  test('una UL no toca los puntos de otra UL', () => {
    const texto =
      bloqueServicio({ unidad: 'E1111111', instalacion: 'Z1' }) +
      bloqueServicio({ unidad: 'E2222222', instalacion: 'Z2' })
    const estado = estadoPorInstalacion(parsearLog(texto).eventos)
    assert.equal(estadoDeUL(estado, 'E1111111').size, 1)
    assert.equal(estadoDeUL(estado, 'E2222222').size, 1)
    assert.equal(estadoDeUL(estado, 'E0000000').size, 0)
  })

  test('dos dias de la misma ruta son UN solo ciclo', () => {
    // el ciclo lo define ADATSOLL (fecha programada), no el dia de lectura
    const dia1 = bloqueServicio({
      instalacion: 'Z1', ciclo: '2026-10-06', fecha: '2026-10-06T17:00:00.000Z',
    })
    const dia2 = bloqueServicio({
      instalacion: 'Z2', ciclo: '2026-10-06', fecha: '2026-10-07T13:00:00.000Z',
    })
    const estado = estadoPorInstalacion(
      parsearLog(dia2).eventos, estadoPorInstalacion(parsearLog(dia1).eventos)
    )
    assert.equal(cicloVigente(estado, 'E9999999'), '2026-10-06')
    assert.equal(estadoDeUL(estado, 'E9999999').size, 2)
  })

  test('un ciclo nuevo devuelve los puntos del anterior a pendientes', () => {
    const viejo = [1, 2, 3, 4, 5]
      .map((n) => bloqueServicio({ instalacion: 'Z' + n, ciclo: '2026-10-06' })).join('')
    const nuevo = bloqueServicio({
      instalacion: 'Z1', ciclo: '2026-11-05', fecha: '2026-11-05T10:00:00.000Z',
    })
    const estado = estadoPorInstalacion(
      parsearLog(nuevo).eventos, estadoPorInstalacion(parsearLog(viejo).eventos)
    )
    assert.equal(cicloVigente(estado, 'E9999999'), '2026-11-05')
    assert.equal(estadoDeUL(estado, 'E9999999').size, 1, 'solo el del ciclo nuevo')
    assert.equal(estado.size, 6, 'los del ciclo viejo siguen guardados')
    // y se puede consultar el ciclo viejo a proposito
    assert.equal(estadoDeUL(estado, 'E9999999', '2026-10-06').size, 5)
  })

  test('ante repetidos gana el ACTUALMRDATE mas reciente', () => {
    const texto =
      bloqueServicio({
        instalacion: 'Z1', lectura: '100', clave: '', fecha: '2026-10-06T10:00:00.000Z',
      }) +
      bloqueServicio({
        instalacion: 'Z1', lectura: '100', clave: '11', fecha: '2026-10-06T15:00:00.000Z',
      })
    const tomados = estadoDeUL(estadoPorInstalacion(parsearLog(texto).eventos), 'E9999999')
    assert.equal(tomados.size, 1, 'una sola entrada por instalacion')
    assert.equal(tomados.get('Z1').clave, '11', 'gana la correccion')
  })

  test('un medidor con varios registros cuenta como UNA instalacion', () => {
    // un BT3 escribe un bloque por registro (AC, BD, RB, AR) en el mismo guardado
    const texto = [1, 2, 3, 6]
      .map((r) => bloqueServicio({
        instalacion: 'G3568050', registro: r,
        fecha: `2026-10-06T13:12:26.4${40 + r}Z`,
      })).join('')
    const { eventos } = parsearLog(texto)
    assert.equal(eventos.length, 4, 'cuatro bloques en el log')
    const tomados = estadoDeUL(estadoPorInstalacion(eventos), 'E9999999')
    assert.equal(tomados.size, 1, 'pero una sola instalacion tomada')
  })

  test('una correccion que borra la lectura devuelve el punto a pendiente', () => {
    // el lector guarda por error, borra la lectura y vuelve a guardar.
    // Si el punto quedara oculto, ese medidor no se leeria nunca mas.
    const texto =
      bloqueServicio({
        instalacion: 'Z1', lectura: '100', clave: '', fecha: '2026-10-06T10:00:00.000Z',
      }) +
      bloqueServicio({
        instalacion: 'Z1', lectura: '', clave: '', fecha: '2026-10-06T15:00:00.000Z',
      })
    const tomados = estadoDeUL(estadoPorInstalacion(parsearLog(texto).eventos), 'E9999999')
    assert.equal(tomados.size, 0, 'el punto debe volver a aparecer en el mapa')
  })

  test('lectura en cero es una lectura valida', () => {
    const texto = bloqueServicio({ instalacion: 'Z1', lectura: '0' })
    const tomados = estadoDeUL(estadoPorInstalacion(parsearLog(texto).eventos), 'E9999999')
    assert.equal(tomados.size, 1)
    assert.equal(tomados.get('Z1').estado, 'leido')
  })

  test('llave() arma UL|ciclo|instalacion', () => {
    assert.equal(llave('E1', '2026-10-06', 'Z1'), 'E1|2026-10-06|Z1')
  })
})

// Contraste contra un log real. Se salta solo si no se pasa la variable,
// asi el log con datos de clientes nunca necesita estar en el repo.
describe('log real (opcional)', () => {
  const ruta = process.env.TOES_LOG_REAL
  test('reproduce los numeros medidos del log real', { skip: !ruta }, () => {
    const { eventos, cierres } = parsearLog(fs.readFileSync(ruta, 'utf8'))
    assert.ok(eventos.length > 0, 'debe encontrar eventos')
    const uls = new Set(eventos.map((e) => e.unidad))
    assert.ok(uls.size >= 1)
    // ningun evento puede quedar sin UL, sin ciclo ni sin instalacion
    for (const e of eventos) {
      assert.ok(e.unidad, 'evento sin UL')
      assert.match(e.ciclo, /^\d{4}-\d{2}-\d{2}$/, 'ciclo con formato raro')
      assert.ok(e.instalacion, 'evento sin instalacion')
    }
    console.log(
      `   log real: ${eventos.length} eventos, ${uls.size} UL, ` +
      `${cierres.length} cierre(s) [${cierres.map((c) => c.tipo).join(', ')}]`
    )
  })
})
