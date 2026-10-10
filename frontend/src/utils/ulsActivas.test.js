import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ulsARestaurar } from './ulsActivas.js'

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
