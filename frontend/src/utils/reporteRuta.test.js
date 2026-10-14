import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { armarReporte, textoReporte } from './reporteRuta.js'
import config from '../config/clavesToes.json' with { type: 'json' }

const UL = 'E3550001'
const CICLO = '2026-10-14'
const pin = (instalacion, extra = {}) => ({ instalacion, unidadDeLectura: UL, ...extra })
const tomado = (instalacion, clave = null) => [instalacion, { instalacion, clave, tomado: true }]

function escenario() {
  // 12 pines en la ruta; 9 tomados; uno tomado que no tenía pin.
  const medidores = Array.from({ length: 12 }, (_, i) => pin('P' + i))
  medidores.push(pin('NUEVO', { desdeToes: { ciclo: CICLO } }))
  medidores.push({ instalacion: 'DE-OTRA-UL', unidadDeLectura: 'OTRA' })
  const tomados = new Map([
    tomado('P0'), tomado('P1'), tomado('P2'),
    tomado('P3', '01'), tomado('P4', '01'), tomado('P5', '09'),
    tomado('P6', '26'),
    tomado('P7', '10'),
    tomado('P8', '11'),
    tomado('NUEVO'),
    tomado('SIN-PIN'),
  ])
  // "especial" es como lo escribe TOES ("Cierre Especial"): el cierre parcial.
  return { ul: UL, datos: { ciclo: CICLO, tomados, cierre: { tipo: 'especial' } }, medidores, config }
}

describe('armarReporte', () => {
  test('cuenta cada categoría y las de la ruta suman el total', () => {
    const r = armarReporte(escenario())
    assert.equal(r.total, 13) // los 12 + el creado desde TOES; no cuenta otra UL
    assert.equal(r.leidos, 5) // P0, P1, P2, NUEVO, SIN-PIN
    assert.equal(r.cerradas.total, 3)
    assert.equal(r.eriazos, 1)
    assert.equal(r.cambios, 1)
    assert.equal(r.otras.total, 1)
    assert.equal(r.pendientes, 3) // P9, P10, P11
    // tomados con pin + pendientes = total
    assert.equal(r.leidos - 1 + r.cerradas.total + r.eriazos + r.cambios + r.otras.total + r.pendientes, r.total)
  })

  test('separa las casas cerradas por tipo, sin el prefijo repetido', () => {
    const r = armarReporte(escenario())
    assert.deepEqual(r.cerradas.detalle, [
      { clave: '01', nombre: 'Medidor interior', n: 2 },
      { clave: '09', nombre: 'Medidor mal ubicado', n: 1 },
    ])
    assert.deepEqual(r.otras.detalle, [{ clave: '11', nombre: 'Posible CNR', n: 1 }])
  })

  test('nuevos: los creados desde TOES en este ciclo y los que aún no tienen pin', () => {
    assert.equal(armarReporte(escenario()).nuevos, 2)
  })

  test('un pin creado desde TOES en otro ciclo ya no es nuevo', () => {
    const e = escenario()
    e.medidores.find((m) => m.instalacion === 'NUEVO').desdeToes.ciclo = '2026-09-14'
    assert.equal(armarReporte(e).nuevos, 1)
  })

  test('sin datos de TOES no revienta', () => {
    const r = armarReporte({ ul: UL, datos: undefined, medidores: [], config })
    assert.equal(r.total, 0)
    assert.equal(r.avance, 0)
  })
})

describe('textoReporte', () => {
  test('arma el texto para WhatsApp, con el detalle y sin lecturas', () => {
    const texto = textoReporte(armarReporte(escenario()))
    assert.match(texto, /^📋 \*Ruta E3550001\* · ciclo 14-10-2026 \(cierre parcial\)/)
    assert.match(texto, /✅ Leídos: \*5\*/)
    assert.match(texto, /• Medidor interior \(01\): 2/)
    assert.match(texto, /⚠️ Otras claves: \*1\*/)
    assert.match(texto, /🆕 Nuevos \(no venían en la ruta\): \*2\*/)
  })

  test('el cierre final dice "ruta cerrada"; sin cierre, "en curso"', () => {
    const e = escenario()
    e.datos.cierre = { tipo: 'final' }
    assert.match(textoReporte(armarReporte(e)), /\(ruta cerrada\)/)
    e.datos.cierre = null
    assert.match(textoReporte(armarReporte(e)), /\(en curso\)/)
  })

  test('sin otras claves no muestra esa línea', () => {
    const e = escenario()
    e.datos.tomados.delete('P8')
    assert.doesNotMatch(textoReporte(armarReporte(e)), /Otras claves/)
  })
})
