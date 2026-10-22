import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorUl, encuadreDe, textoTipos } from './marcasPendientes.js'
import config from '../config/clavesToes.json' with { type: 'json' }

const pendiente = (instalacion, ul, tipo = 'sitioEriazo', coords = [-71.6, -35.4], situacion = 'propuesta') => ({
  _id: 'id-' + instalacion,
  instalacion,
  unidadDeLectura: ul,
  ubicacion: coords ? { type: 'Point', coordinates: coords } : undefined,
  marcaPermanente: { tipo, situacion, claveToes: tipo === 'noEncontrado' ? '02' : '26', cicloOrigen: '2026-10-14' },
})

describe('agruparPorUl', () => {
  test('agrupa por UL, en orden, y dentro por instalación (9 antes que 10)', () => {
    const grupos = agruparPorUl([
      pendiente('10', 'E3544002'), pendiente('9', 'E3544002'),
      pendiente('300', 'E3508013'), pendiente('G3534036', 'G3511002'),
    ], config)
    assert.deepEqual(grupos.map((g) => g.ul), ['E3508013', 'E3544002', 'G3511002'])
    assert.deepEqual(grupos[1].items.map((x) => x.instalacion), ['9', '10'])
  })

  test('cada punto trae su tipo con nombre y color, el ciclo y la coordenada', () => {
    const [g] = agruparPorUl([pendiente('100', 'E1', 'noEncontrado', [-71.5, -35.2])], config)
    assert.deepEqual(g.items[0], {
      _id: 'id-100', instalacion: '100', tipo: 'noEncontrado', nombreTipo: 'No encontrado', color: '#1E88E5',
      claveToes: '02', cicloOrigen: '2026-10-14', lat: -35.2, lng: -71.5,
    })
  })

  test('cuenta por tipo dentro de cada UL', () => {
    const [g] = agruparPorUl([
      pendiente('1', 'E1'), pendiente('2', 'E1'), pendiente('3', 'E1', 'noEncontrado'),
    ], config)
    assert.deepEqual(g.porTipo, { sitioEriazo: 2, noEncontrado: 1 })
  })

  test('deja afuera lo ya decidido (confirmada o rechazada) y lo que no tiene marca', () => {
    const grupos = agruparPorUl([
      pendiente('1', 'E1'),
      pendiente('2', 'E1', 'sitioEriazo', undefined, 'confirmada'),
      pendiente('3', 'E1', 'sitioEriazo', undefined, 'rechazada'),
      { _id: 'x', instalacion: '4', unidadDeLectura: 'E1' },
    ], config)
    assert.deepEqual(grupos.flatMap((g) => g.items.map((x) => x.instalacion)), ['1'])
  })

  test('un punto sin ubicación se lista igual, sin coordenada', () => {
    const [g] = agruparPorUl([pendiente('1', 'E1', 'sitioEriazo', null)], config)
    assert.equal(g.items[0].lat, null)
  })

  test('sin nada, lista vacía', () => {
    assert.deepEqual(agruparPorUl([], config), [])
    assert.deepEqual(agruparPorUl(undefined, config), [])
  })
})

test('textoTipos: el más numeroso primero, con el nombre de la tabla', () => {
  assert.equal(textoTipos({ noEncontrado: 1, sitioEriazo: 3 }, config), '3 Sitio eriazo · 1 No encontrado')
})

describe('encuadreDe', () => {
  test('el rectángulo de todos los pendientes con ubicación', () => {
    assert.deepEqual(encuadreDe([
      pendiente('1', 'E1', 'sitioEriazo', [-71.7, -35.5]),
      pendiente('2', 'E2', 'sitioEriazo', [-71.2, -35.1]),
      pendiente('3', 'E2', 'sitioEriazo', null),
    ]), { sur: -35.5, oeste: -71.7, norte: -35.1, este: -71.2 })
  })

  test('un solo punto da un rectángulo sin área (cada motor pone su zoom tope)', () => {
    assert.deepEqual(encuadreDe([pendiente('1', 'E1', 'sitioEriazo', [-71.6, -35.4])]),
      { sur: -35.4, oeste: -71.6, norte: -35.4, este: -71.6 })
  })

  test('sin ubicaciones no hay nada que encuadrar', () => {
    assert.equal(encuadreDe([pendiente('1', 'E1', 'sitioEriazo', null)]), null)
    assert.equal(encuadreDe([]), null)
  })
})
