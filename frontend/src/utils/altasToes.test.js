import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { altasPendientes as calcular } from './altasToes.js'

// Un día después de las lecturas de los ejemplos.
const AHORA = Date.parse('2026-10-15T12:00:00.000Z')
const altasPendientes = (m, p, u, ahora = AHORA) => calcular(m, p, u, ahora)

const UL = 'E3550001'
const ev = (instalacion, extra = {}) => [instalacion, {
  instalacion, unidad: UL, ciclo: '2026-10-14', medidor: 'S-' + instalacion, marca: 'ENERTEC',
  fecha: '2026-10-14T19:53:21.971Z', gps: { lat: -35.42, lng: -71.65 }, ...extra,
}]
const porUl = (eventos, extra = {}) => ({ [UL]: { ciclo: '2026-10-14', descartado: false, tomados: new Map(eventos), ...extra } })
const cargado = (instalacion, extra = {}) => ({ instalacion, unidadDeLectura: UL, ...extra })

describe('altasPendientes', () => {
  test('propone el servicio tomado que no tiene pin, con el GPS del lector', () => {
    const { altas } = altasPendientes([cargado('A')], porUl([ev('A'), ev('B')]), [UL])
    assert.deepEqual(altas, [{
      instalacion: 'B', ul: UL, ciclo: '2026-10-14', lat: -35.42, lng: -71.65,
      serie: 'S-B', marca: 'ENERTEC', fecha: '2026-10-14T19:53:21.971Z',
    }])
  })

  test('sin GPS no propone nada', () => {
    const { altas } = altasPendientes([cargado('A')], porUl([ev('B', { gps: null })]), [UL])
    assert.deepEqual(altas, [])
  })

  test('no propone si la UL todavía no tiene medidores cargados', () => {
    const otro = { instalacion: 'X', unidadDeLectura: 'OTRA' }
    assert.deepEqual(altasPendientes([otro], porUl([ev('B')]), [UL]).altas, [])
  })

  test('si la serie ya está en otro pin, el servicio no falta', () => {
    const { altas } = altasPendientes([cargado('A', { numeroDeSerie: 'S-B' })], porUl([ev('B')]), [UL])
    assert.deepEqual(altas, [])
  })

  test('tampoco si la serie es la de un medidor lupa', () => {
    const { altas } = altasPendientes(
      [cargado('A', { medidorLupa: { numeroDeSerie: 'S-B' } })], porUl([ev('B')]), [UL])
    assert.deepEqual(altas, [])
  })

  test('con demasiados faltantes no crea nada y avisa la UL', () => {
    const eventos = Array.from({ length: 30 }, (_, i) => ev('N' + i))
    const r = altasPendientes([cargado('A')], porUl([ev('A'), ...eventos]), [UL])
    assert.deepEqual(r.altas, [])
    assert.deepEqual(r.bloqueadas, [UL])
  })

  test('no crea pines por lecturas viejas (un pin eliminado no vuelve solo)', () => {
    const viejo = ev('B', { fecha: '2026-10-01T15:00:00.000Z' })
    const sinFecha = ev('C', { fecha: null })
    assert.deepEqual(altasPendientes([cargado('A')], porUl([viejo, sinFecha]), [UL]).altas, [])
  })

  test('ignora un ciclo descartado y las ULs no marcadas', () => {
    assert.deepEqual(altasPendientes([cargado('A')], porUl([ev('B')], { descartado: true }), [UL]).altas, [])
    assert.deepEqual(altasPendientes([cargado('A')], porUl([ev('B')]), []).altas, [])
  })
})
