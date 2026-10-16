import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  sirveLaCopia, resolverCargaUl, unirMedidores, resumenSinSenal, fechaCorta, textoSinSenal,
} from './cargaSinSenal.js'

// Un error de axios sin respuesta (sin señal, timeout) y uno con status.
const sinRed = { message: 'Network Error' }
const timeout = { code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' }
const conStatus = (status) => ({ response: { status } })

const COPIA = { medidores: [{ _id: 'a' }, { _id: 'b' }], fecha: '2026-10-16T12:35:00.000Z' }

describe('sirveLaCopia', () => {
  test('sin respuesta del servidor (sin señal) sí', () => {
    assert.equal(sirveLaCopia(sinRed), true)
    assert.equal(sirveLaCopia(timeout), true)
    assert.equal(sirveLaCopia(undefined), true)
  })

  test('servidor caído o saturado sí', () => {
    assert.equal(sirveLaCopia(conStatus(500)), true)
    assert.equal(sirveLaCopia(conStatus(503)), true)
    assert.equal(sirveLaCopia(conStatus(408)), true)
    assert.equal(sirveLaCopia(conStatus(429)), true)
  })

  test('una respuesta de verdad no: la UL ya no es tuya o no existe', () => {
    // Mostrar la copia de una UL que te quitaron sería mostrarte datos ajenos.
    assert.equal(sirveLaCopia(conStatus(403)), false)
    assert.equal(sirveLaCopia(conStatus(404)), false)
    assert.equal(sirveLaCopia(conStatus(400)), false)
    assert.equal(sirveLaCopia(conStatus(401)), false)
  })
})

describe('resolverCargaUl', () => {
  test('lo que llega de la red gana', () => {
    const r = resolverCargaUl('E1', { ok: true, medidores: [{ _id: 'x' }] }, COPIA)
    assert.equal(r.origen, 'red')
    assert.deepEqual(r.medidores, [{ _id: 'x' }])
  })

  test('sin señal usa la copia, con su fecha', () => {
    const r = resolverCargaUl('E1', { ok: false, err: sinRed }, COPIA)
    assert.equal(r.origen, 'copia')
    assert.equal(r.medidores.length, 2)
    assert.equal(r.fecha, COPIA.fecha)
  })

  test('sin señal y sin copia no hay nada', () => {
    const r = resolverCargaUl('E1', { ok: false, err: sinRed }, null)
    assert.equal(r.origen, 'nada')
    assert.deepEqual(r.medidores, [])
  })

  test('un 403 no usa la copia aunque exista, y no cuenta como falta de señal', () => {
    const r = resolverCargaUl('E1', { ok: false, err: conStatus(403) }, COPIA)
    assert.equal(r.origen, 'error')
    assert.deepEqual(r.medidores, [])
  })
})

describe('unirMedidores', () => {
  test('no repite un medidor que viene en dos ULs', () => {
    const r = unirMedidores([[{ _id: 'a' }, { _id: 'b' }], [{ _id: 'b' }, { _id: 'c' }]])
    assert.deepEqual(r.map((m) => m._id), ['a', 'b', 'c'])
  })

  test('tolera listas vacías o faltantes', () => {
    assert.deepEqual(unirMedidores([[], null, undefined]), [])
  })
})

describe('resumenSinSenal', () => {
  test('todo de la red: nada que avisar', () => {
    assert.equal(resumenSinSenal([{ ul: 'E1', origen: 'red' }, { ul: 'E2', origen: 'red' }]), null)
  })

  test('avisa la copia MÁS VIEJA, que es la que importa', () => {
    const r = resumenSinSenal([
      { ul: 'E1', origen: 'copia', fecha: '2026-10-16T12:00:00.000Z' },
      { ul: 'E2', origen: 'copia', fecha: '2026-10-14T09:00:00.000Z' },
      { ul: 'E3', origen: 'red' },
    ])
    assert.deepEqual(r.desdeCopia, ['E1', 'E2'])
    assert.equal(r.fecha, '2026-10-14T09:00:00.000Z')
  })

  test('separa las que no tienen ni red ni copia', () => {
    const r = resumenSinSenal([{ ul: 'E1', origen: 'copia', fecha: COPIA.fecha }, { ul: 'E2', origen: 'nada' }])
    assert.deepEqual(r.sinDatos, ['E2'])
  })

  test('un rechazo del servidor no es "sin señal"', () => {
    assert.equal(resumenSinSenal([{ ul: 'E1', origen: 'error' }, { ul: 'E2', origen: 'red' }]), null)
  })
})

describe('fechaCorta', () => {
  test('día-mes hora:minuto en la hora del teléfono', () => {
    // Construida con la hora local para que el test no dependa de la zona.
    assert.equal(fechaCorta(new Date(2026, 9, 16, 9, 5).toISOString()), '16-10 09:05')
  })

  test('una fecha inválida no rompe', () => {
    assert.equal(fechaCorta('no es fecha'), null)
  })
})

describe('textoSinSenal', () => {
  const fecha = new Date(2026, 9, 16, 9, 35).toISOString()

  test('nada que avisar', () => {
    assert.equal(textoSinSenal(null), null)
  })

  test('una UL desde la copia dice cuál y de cuándo', () => {
    const t = textoSinSenal({ desdeCopia: ['E3554001'], sinDatos: [], fecha })
    assert.match(t, /la UL E3554001 se muestra con la copia guardada del 16-10 09:35/)
    assert.match(t, /Se actualiza sola/)
  })

  test('varias ULs desde la copia', () => {
    const t = textoSinSenal({ desdeCopia: ['E1', 'E2'], sinDatos: [], fecha })
    assert.match(t, /2 ULs se muestran con la copia/)
  })

  test('una UL sin copia se nombra', () => {
    const t = textoSinSenal({ desdeCopia: [], sinDatos: ['E9'], fecha: null })
    assert.match(t, /sin copia de E9/)
  })

  test('sin lista de ULs y sin copia: pide abrirla una vez con señal', () => {
    assert.match(textoSinSenal(null, null, true), /ábrela una vez con señal/)
  })

  test('solo la lista vino de la copia', () => {
    assert.match(textoSinSenal(null, fecha), /la lista de ULs es la copia guardada del 16-10 09:35/)
  })
})
