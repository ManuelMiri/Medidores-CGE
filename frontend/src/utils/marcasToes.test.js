// Pruebas de qué marcas se proponen y cuáles se quitan según TOES.
//   npm test
//
// Esta es la lógica que ESCRIBE en el servidor, y se equivoca en silencio:
// proponer de más deja un medidor real descartado para los próximos meses;
// no proponer deja al lector buscando lo que ya no existe.

// vistaMarcador.js importa Leaflet, que al cargarse necesita window y
// document. Con un stub mínimo alcanza (mismo truco que vistaMarcador.test.js).
const elemento = () => ({
  style: {}, setAttribute() {}, appendChild() {},
  classList: { add() {}, remove() {} }, getContext: () => null,
})
globalThis.window = {
  devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, screen: {},
}
globalThis.document = {
  documentElement: elemento(), createElement: elemento, createElementNS: elemento,
  addEventListener() {}, removeEventListener() {}, body: elemento(),
}

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const { accionesDeMarca, claveDeAccion } = await import('./marcasToes.js')
const config = (await import('../config/clavesToes.json', { with: { type: 'json' } })).default

const medidor = (instalacion, marca) => ({
  _id: 'id-' + instalacion, instalacion, estado: 'pendiente',
  ...(marca ? { marcaPermanente: marca } : {}),
})

function indiceCon(...registros) {
  const porInstalacion = new Map()
  for (const r of registros) {
    porInstalacion.set(r.instalacion, {
      instalacion: r.instalacion,
      clave: r.clave ?? null,
      conLectura: r.conLectura ?? !r.clave,
      ciclo: r.ciclo ?? '2026-10-06',
      tomado: true,
    })
  }
  return { porInstalacion, porMedidor: new Map() }
}

describe('qué propone', () => {
  test('la clave 26 (sitio eriazo) propone marca', () => {
    const acciones = accionesDeMarca(
      [medidor('101')], indiceCon({ instalacion: '101', clave: '26' }), config)
    assert.deepEqual(acciones, [{
      instalacion: '101', accion: 'proponer', tipo: 'sitioEriazo',
      claveToes: '26', cicloOrigen: '2026-10-06',
    }])
  })

  test('la clave 02 (medidor no ubicado) propone marca', () => {
    const acciones = accionesDeMarca(
      [medidor('101')], indiceCon({ instalacion: '101', clave: '02' }), config)
    assert.equal(acciones[0].tipo, 'noEncontrado')
  })

  test('una lectura normal no propone nada', () => {
    const acciones = accionesDeMarca(
      [medidor('101')], indiceCon({ instalacion: '101' }), config)
    assert.deepEqual(acciones, [])
  })

  test('las claves de "no se pudo leer esta vez" NO proponen marca', () => {
    // Casa cerrada, vidrio empañado, sin acceso: el medidor sigue ahí y el
    // mes que viene puede leerse. Marcarlo seria esconder un medidor real.
    const transitorias = ['01', '08', '09', '20', '30', '05', '11']
    for (const clave of transitorias) {
      const acciones = accionesDeMarca(
        [medidor('101')], indiceCon({ instalacion: '101', clave }), config)
      assert.deepEqual(acciones, [], `la clave ${clave} no deberia proponer marca`)
    }
  })

  test('un medidor sin registro en TOES no genera nada', () => {
    assert.deepEqual(accionesDeMarca([medidor('101')], indiceCon(), config), [])
  })

  test('un punto sin instalación se salta', () => {
    const acciones = accionesDeMarca(
      [{ _id: 'x', instalacion: '' }], indiceCon({ instalacion: '101', clave: '26' }), config)
    assert.deepEqual(acciones, [])
  })
})

describe('qué no vuelve a proponer', () => {
  test('si ya tiene la misma marca, no se repite', () => {
    const m = medidor('101', { tipo: 'sitioEriazo', situacion: 'propuesta' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101', clave: '26' }), config)
    assert.deepEqual(acciones, [])
  })

  test('una marca confirmada no se degrada aunque TOES diga otra cosa', () => {
    // Un supervisor ya decidió: la clave de un ciclo no puede pisarlo.
    const m = medidor('101', { tipo: 'sitioEriazo', situacion: 'confirmada' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101', clave: '02' }), config)
    assert.deepEqual(acciones, [])
  })

  test('una propuesta sí se corrige si TOES ahora dice otra clave', () => {
    const m = medidor('101', { tipo: 'sitioEriazo', situacion: 'propuesta' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101', clave: '02' }), config)
    assert.equal(acciones[0].accion, 'proponer')
    assert.equal(acciones[0].tipo, 'noEncontrado')
  })
})

describe('qué quita', () => {
  test('una lectura real quita la marca', () => {
    const m = medidor('101', { tipo: 'sitioEriazo', situacion: 'confirmada' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101' }), config)
    assert.deepEqual(acciones, [{ instalacion: '101', accion: 'quitar' }])
  })

  test('quita incluso una marca confirmada: el medidor demostró que está', () => {
    const m = medidor('101', { tipo: 'noEncontrado', situacion: 'confirmada' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101', conLectura: true }), config)
    assert.equal(acciones[0].accion, 'quitar')
  })

  test('una clave sin lectura no quita la marca', () => {
    const m = medidor('101', { tipo: 'sitioEriazo', situacion: 'confirmada' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101', clave: '26' }), config)
    assert.deepEqual(acciones, [])
  })
})

describe('claveDeAccion', () => {
  test('distingue proponer de quitar sobre el mismo punto', () => {
    const a = { instalacion: '101', accion: 'proponer', tipo: 'sitioEriazo', cicloOrigen: '2026-10-06' }
    const b = { instalacion: '101', accion: 'quitar' }
    assert.notEqual(claveDeAccion(a), claveDeAccion(b))
  })

  test('la misma propuesta en otro ciclo es otra acción', () => {
    const a = { instalacion: '101', accion: 'proponer', tipo: 'sitioEriazo', cicloOrigen: '2026-10-06' }
    const b = { ...a, cicloOrigen: '2026-11-06' }
    assert.notEqual(claveDeAccion(a), claveDeAccion(b))
  })
})

describe('marca rechazada', () => {
  test('una rechazada no se vuelve a proponer', () => {
    // Si no, rechazarla no serviría de nada: el sondeo la repondría a los
    // 5 segundos porque TOES sigue teniendo esa clave en el ciclo.
    const m = medidor('101', { tipo: 'sitioEriazo', situacion: 'rechazada' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101', clave: '26' }), config)
    assert.deepEqual(acciones, [])
  })

  test('una rechazada tampoco deja proponer otro tipo', () => {
    const m = medidor('101', { tipo: 'sitioEriazo', situacion: 'rechazada' })
    const acciones = accionesDeMarca([m], indiceCon({ instalacion: '101', clave: '02' }), config)
    assert.deepEqual(acciones, [])
  })
})
