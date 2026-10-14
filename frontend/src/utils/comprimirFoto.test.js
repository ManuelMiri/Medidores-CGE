import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { medidasDestino } from './comprimirFoto.js'
import { esFalloPasajero } from './colaFotos.js'

describe('medidasDestino', () => {
  test('achica una foto de 12 MP a 1920 por el lado largo, sin deformarla', () => {
    assert.deepEqual(medidasDestino(4000, 3000), { ancho: 1920, alto: 1440 })
    assert.deepEqual(medidasDestino(3000, 4000), { ancho: 1440, alto: 1920 })
  })

  test('nunca agranda una foto chica', () => {
    assert.deepEqual(medidasDestino(800, 600), { ancho: 800, alto: 600 })
  })

  test('medidas inválidas no rompen', () => {
    assert.deepEqual(medidasDestino(0, 600), { ancho: 0, alto: 0 })
    assert.deepEqual(medidasDestino(NaN, 600), { ancho: 0, alto: 0 })
  })
})

describe('esFalloPasajero', () => {
  test('sin respuesta (sin señal) se reintenta sola', () => {
    assert.equal(esFalloPasajero(new Error('Network Error')), true)
  })

  test('un error del servidor o un 429 también', () => {
    assert.equal(esFalloPasajero({ response: { status: 500 } }), true)
    assert.equal(esFalloPasajero({ response: { status: 429 } }), true)
  })

  test('una sesión vencida (401) también: se arregla al volver a entrar', () => {
    assert.equal(esFalloPasajero({ response: { status: 401 } }), true)
  })

  test('un 4xx no: reintentarlo cada minuto no lo arregla', () => {
    assert.equal(esFalloPasajero({ response: { status: 404 } }), false)
    assert.equal(esFalloPasajero({ response: { status: 400 } }), false)
  })
})
