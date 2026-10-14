import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { accionesDeCambio } from './cambiosToes.js'

const cambio = (extra = {}) => ({
  instalacion: 'Z1', serie: 'NUEVO', marca: 'ENERTEC', serieAnterior: 'VIEJO',
  ciclo: '2026-10-14', fecha: '2026-10-14T19:53:21.920Z', ...extra,
})

describe('accionesDeCambio', () => {
  test('manda el cambio de un medidor cargado que todavía tiene la serie vieja', () => {
    const acciones = accionesDeCambio([{ instalacion: 'Z1', numeroDeSerie: 'VIEJO' }], [cambio()])
    assert.deepEqual(acciones, [{
      instalacion: 'Z1', serie: 'NUEVO', marca: 'ENERTEC', serieAnterior: 'VIEJO',
      ciclo: '2026-10-14', fecha: '2026-10-14T19:53:21.920Z',
    }])
  })

  test('no repite lo que la base ya tiene', () => {
    assert.deepEqual(accionesDeCambio([{ instalacion: 'Z1', numeroDeSerie: 'NUEVO' }], [cambio()]), [])
    assert.deepEqual(accionesDeCambio(
      [{ instalacion: 'Z1', numeroDeSerie: 'X', cambioMedidor: { serieNueva: 'NUEVO' } }], [cambio()]), [])
  })

  test('si el que se cambió es el lupa y ya está, tampoco', () => {
    const m = { instalacion: 'Z1', numeroDeSerie: 'CASA', medidorLupa: { numeroDeSerie: 'NUEVO' } }
    assert.deepEqual(accionesDeCambio([m], [cambio()]), [])
  })

  test('ignora instalaciones que no están cargadas', () => {
    assert.deepEqual(accionesDeCambio([{ instalacion: 'OTRA' }], [cambio()]), [])
  })

  test('con dos cambios de la misma instalación vale el último', () => {
    const acciones = accionesDeCambio([{ instalacion: 'Z1', numeroDeSerie: 'VIEJO' }], [
      cambio({ serie: 'SEGUNDO', fecha: '2026-10-15T10:00:00.000Z' }),
      cambio({ serie: 'PRIMERO', fecha: '2026-10-14T10:00:00.000Z' }),
    ])
    assert.deepEqual(acciones.map((a) => a.serie), ['SEGUNDO'])
  })
})
