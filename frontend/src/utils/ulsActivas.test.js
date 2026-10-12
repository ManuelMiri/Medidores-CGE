import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ulsARestaurar, ulsTrasRecargar } from './ulsActivas.js'

const DISPONIBLES = ['E3505704', 'E3510021', 'E3542002']

describe('ulsARestaurar', () => {
  test('restaura la que estaba marcada, no la primera de la lista', () => {
    // El bug que esto arregla: abrir siempre con E3505704 aunque estuvieras
    // trabajando en otra.
    assert.deepEqual(ulsARestaurar(['E3542002'], DISPONIBLES), ['E3542002'])
  })

  test('restaura varias', () => {
    assert.deepEqual(
      ulsARestaurar(['E3510021', 'E3542002'], DISPONIBLES),
      ['E3510021', 'E3542002'])
  })

  test('descarta una UL que ya no existe', () => {
    // La ruta se borró, o al lector le cambiaron las ULs asignadas.
    assert.deepEqual(ulsARestaurar(['BORRADA'], DISPONIBLES), ['E3505704'])
  })

  test('se queda solo con las que sobreviven', () => {
    assert.deepEqual(ulsARestaurar(['BORRADA', 'E3542002'], DISPONIBLES), ['E3542002'])
  })

  test('sin nada guardado marca la primera, como antes', () => {
    assert.deepEqual(ulsARestaurar([], DISPONIBLES), ['E3505704'])
    assert.deepEqual(ulsARestaurar(null, DISPONIBLES), ['E3505704'])
  })

  test('sin ULs disponibles no marca nada', () => {
    assert.deepEqual(ulsARestaurar(['E3542002'], []), [])
    assert.deepEqual(ulsARestaurar(['E3542002'], null), [])
  })
})

describe('ulsTrasRecargar', () => {
  test('conserva lo marcado en la sesión, no lo del arranque', () => {
    // El bug: importar un KML devolvía las ULs que había al abrir la app.
    const actuales = ['E3510021', 'E3542002']
    assert.equal(ulsTrasRecargar(actuales, DISPONIBLES), actuales)
  })

  test('una ruta nueva no cambia lo marcado', () => {
    const actuales = ['E3542002']
    assert.equal(ulsTrasRecargar(actuales, [...DISPONIBLES, 'NUEVA']), actuales)
  })

  test('saca una ruta que se eliminó', () => {
    assert.deepEqual(
      ulsTrasRecargar(['E3510021', 'BORRADA'], DISPONIBLES),
      ['E3510021'])
  })

  test('si se eliminó la única marcada, marca la primera', () => {
    assert.deepEqual(ulsTrasRecargar(['BORRADA'], DISPONIBLES), ['E3505704'])
  })

  test('sin nada marcado no marca nada', () => {
    const actuales = []
    assert.equal(ulsTrasRecargar(actuales, DISPONIBLES), actuales)
  })
})
